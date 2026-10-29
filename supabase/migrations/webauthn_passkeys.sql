-- Passkeys (WebAuthn) for ace-platform apps. Stores only PUBLIC keys; no biometric data ever reaches the server.
create table if not exists public.webauthn_credentials (
  id text primary key,                       -- credential ID (base64url)
  user_id uuid not null references auth.users(id) on delete cascade,
  public_key text not null,                  -- COSE public key (base64url)
  counter bigint not null default 0,
  transports text[] default '{}',
  device_type text, backed_up boolean,
  name text, app text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists webauthn_credentials_user_idx on public.webauthn_credentials(user_id);
alter table public.webauthn_credentials enable row level security;
drop policy if exists "own passkeys read" on public.webauthn_credentials;
create policy "own passkeys read" on public.webauthn_credentials for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own passkeys delete" on public.webauthn_credentials;
create policy "own passkeys delete" on public.webauthn_credentials for delete to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own passkeys rename" on public.webauthn_credentials;
create policy "own passkeys rename" on public.webauthn_credentials for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke insert, update on public.webauthn_credentials from anon, authenticated;
grant select, delete on public.webauthn_credentials to authenticated;
grant update (name) on public.webauthn_credentials to authenticated;

create table if not exists public.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge text not null,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in ('reg','auth')),
  created_at timestamptz not null default now()
);
alter table public.webauthn_challenges enable row level security; -- no policies: service role only
revoke all on public.webauthn_challenges from anon, authenticated;
