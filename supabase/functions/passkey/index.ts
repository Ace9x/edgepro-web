// passkey: WebAuthn (Face ID / Touch ID / Windows Hello / security key) sign-in for ace9x.github.io apps.
// Only public keys are stored. Biometrics never leave the user's device.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from 'npm:@simplewebauthn/server@13.1.1';
import { isoBase64URL } from 'npm:@simplewebauthn/server@13.1.1/helpers';

const RP_ID = 'ace9x.github.io', RP_NAME = 'Ace apps', ORIGINS = ['https://ace9x.github.io'];
const URL_ = Deno.env.get('SUPABASE_URL')!, SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(URL_, SR, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = (o: string | null) => ({ 'Access-Control-Allow-Origin': o && ORIGINS.includes(o) ? o : ORIGINS[0], 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json' });
const TTL = 5 * 60e3;

async function take(id: string, kind: string) {
  const { data } = await admin.from('webauthn_challenges').delete().eq('id', id).eq('kind', kind).select().maybeSingle();
  if (!data || Date.now() - new Date(data.created_at).getTime() > TTL) throw new Error('Passkey request expired. Try again.');
  return data;
}
async function caller(req: Request) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(t); if (error || !data.user) throw new Error('Sign in first to add a passkey.');
  if (data.user.is_anonymous) throw new Error('Sign in with an account first.'); return data.user;
}

Deno.serve(async req => {
  const h = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: h });
  try {
    const b = await req.json(); const act = String(b.action || '');
    admin.from('webauthn_challenges').delete().lt('created_at', new Date(Date.now() - TTL).toISOString()).then(() => {});
    if (act === 'register-options') {
      const u = await caller(req);
      const { data: creds } = await admin.from('webauthn_credentials').select('id,transports').eq('user_id', u.id);
      const options = await generateRegistrationOptions({ rpName: RP_NAME, rpID: RP_ID, userName: u.email || u.phone || u.id, userDisplayName: u.user_metadata?.display_name || u.email || 'Account',
        userID: new TextEncoder().encode(u.id), attestationType: 'none', excludeCredentials: (creds || []).map(c => ({ id: c.id, transports: c.transports || undefined })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' } });
      const { data: ch, error } = await admin.from('webauthn_challenges').insert({ challenge: options.challenge, user_id: u.id, kind: 'reg' }).select('id').single(); if (error) throw error;
      return out({ options, challengeId: ch.id });
    }
    if (act === 'register-verify') {
      const u = await caller(req); const ch = await take(b.challengeId, 'reg'); if (ch.user_id !== u.id) throw new Error('Passkey request mismatch.');
      const v = await verifyRegistrationResponse({ response: b.response, expectedChallenge: ch.challenge, expectedOrigin: ORIGINS, expectedRPID: RP_ID, requireUserVerification: true });
      if (!v.verified || !v.registrationInfo) throw new Error('Passkey could not be verified.');
      const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;
      const { error } = await admin.from('webauthn_credentials').insert({ id: credential.id, user_id: u.id, public_key: isoBase64URL.fromBuffer(credential.publicKey), counter: credential.counter,
        transports: credential.transports || b.response?.response?.transports || [], device_type: credentialDeviceType, backed_up: credentialBackedUp, name: String(b.name || 'Passkey').slice(0, 60), app: String(b.app || '').slice(0, 30) });
      if (error) throw new Error(error.code === '23505' ? 'This passkey is already registered.' : error.message);
      return out({ ok: true, id: credential.id });
    }
    if (act === 'auth-options') {
      const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: 'required', allowCredentials: [] });
      const { data: ch, error } = await admin.from('webauthn_challenges').insert({ challenge: options.challenge, kind: 'auth' }).select('id').single(); if (error) throw error;
      return out({ options, challengeId: ch.id });
    }
    if (act === 'auth-verify') {
      const ch = await take(b.challengeId, 'auth');
      const { data: c } = await admin.from('webauthn_credentials').select('*').eq('id', String(b.response?.id || '')).maybeSingle();
      if (!c) throw new Error('This passkey is not registered here. Sign in with email, then add a passkey in Account.');
      const v = await verifyAuthenticationResponse({ response: b.response, expectedChallenge: ch.challenge, expectedOrigin: ORIGINS, expectedRPID: RP_ID, requireUserVerification: true,
        credential: { id: c.id, publicKey: isoBase64URL.toBuffer(c.public_key), counter: Number(c.counter), transports: c.transports || undefined } });
      if (!v.verified) throw new Error('Passkey could not be verified.');
      const uh = b.response?.response?.userHandle; if (uh && new TextDecoder().decode(isoBase64URL.toBuffer(uh)) !== c.user_id) throw new Error('Passkey account mismatch.');
      await admin.from('webauthn_credentials').update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('id', c.id);
      const { data: ud } = await admin.auth.admin.getUserById(c.user_id); const u = ud?.user;
      if (!u || !u.email || !u.email_confirmed_at) throw new Error('Confirm your email before using a passkey.');
      if (u.banned_until && new Date(u.banned_until) > new Date()) throw new Error('This account is disabled.');
      const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.email }); if (le) throw le;
      const r = await fetch(`${URL_}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.properties.hashed_token }) });
      const s = await r.json(); if (!r.ok || !s.access_token) throw new Error('Could not start a session. Try email sign-in.');
      return out({ access_token: s.access_token, refresh_token: s.refresh_token });
    }
    return out({ error: 'unknown action' }, 400);
  } catch (e) { return out({ error: (e as Error).message || 'Passkey error' }, 400); }
});
