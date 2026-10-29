// Passkey e2e against the LIVE sites with a Chrome virtual authenticator. Needs a confirmed test account (EM/PW below), deleted after the run.
import { chromium } from 'playwright';
const APPS = { edgepro: 'https://ace9x.github.io/edgepro-web/', rigroute: 'https://ace9x.github.io/truckers-gps/', rocapulco: 'https://ace9x.github.io/rocapulco-supreme-web/' };
const EM = 'pk-e2e-test@example.com', PW = process.env.PK_PW;
const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p); await cdp.send('WebAuthn.enable');
const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const res = {};
// 1) EdgePro: real modules from the live site — email sign-in, add passkey, sign out, passkey sign-in
await p.goto(APPS.edgepro + '?nosplash=1'); await p.waitForTimeout(2500);
res.edgepro = await p.evaluate(async ([em, pw]) => { const A = await import('./js/account.js?t=' + Date.now()); await A.init(); await A.emailIn(em, pw);
  const reg = await A.passkeyAdd(); const before = (await A.passkeys()).length; await A.signOut(); const out = !(await A.client().auth.getSession()).data.session;
  await A.passkeyIn(); const s = (await A.client().auth.getSession()).data.session; return { reg: !!reg.ok, listed: before, signedOut: out, passkeySession: s?.user?.email }; }, [EM, PW]);
const creds = await cdp.send('WebAuthn.getCredentials', { authenticatorId }); res.credsOnAuthenticator = creds.credentials.length;
// 2) Same passkey signs into RigRoute and Rocapulco (shared RP ID ace9x.github.io)
await p.goto(APPS.rigroute); await p.waitForTimeout(3000);
res.rigroute = await p.evaluate(async () => { const { sb } = await import('./js/cloud.js'); const c = await sb(); const PK = await import('./js/passkey.js?t=' + Date.now()); await PK.signIn(c); return (await c.auth.getSession()).data.session?.user?.email; });
await p.goto(APPS.rocapulco + '?nosplash=1'); await p.waitForTimeout(3000);
res.rocapulco = await p.evaluate(async () => { const C = await import('./cloud.js?t=' + Date.now()); await C.passkeyIn(); return (await C.session())?.user?.email; });
// 3) UI buttons visible when signed out
const p2 = await (await b.newContext()).newPage(); await p2.goto(APPS.edgepro + '#tools'); await p2.waitForTimeout(4000);
res.edgeproButton = await p2.locator('[data-act=pkin]').count();
// 4) Tampered assertion rejected
res.replay = await p.evaluate(async () => { const r = await fetch('https://czjwiudbasqwlwvezmaz.supabase.co/functions/v1/passkey', { method: 'POST', headers: { apikey: 'sb_publishable_I9N8lydmQ1h6NQD6JT-jDQ_PQkjsBAK', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'auth-verify', challengeId: crypto.randomUUID(), response: { id: 'x' } }) }); return (await r.json()).error; });
console.log(JSON.stringify(res, null, 1)); await b.close();
