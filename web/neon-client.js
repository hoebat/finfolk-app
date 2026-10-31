import { clearInstagramClaimStorage } from './instagram-claim.js';
import { accountToken } from './auth-session.js';
import { createAuthClient } from '@neondatabase/auth';
import { activity } from './activity.js';
const clients = new Map();
export async function createLogbookClient(config) {
  if (clients.has(config.authUrl)) return clients.get(config.authUrl);
  const auth = createAuthClient(config.authUrl),
    listeners = new Set();
  let user = null;
  const unwrap = (result) => {
    if (result?.error) throw Error(result.error.message || 'Sign-in failed.');
    return result?.data;
  };
  async function refresh() {
    const data = unwrap(await auth.getSession());
    user = data?.user
      ? {
          ...data.user,
          uid: data.user.id,
          emailVerified: data.user.emailVerified,
          providerData: [],
        }
      : null;
    for (const fn of listeners) await fn(user);
    return user;
  }
  async function call(action, values = {}) {
    if (!config.apiUrl) throw Error('The account API is not configured yet.');
    const task = activity.begin({
      label: 'Account: ' + action,
      kind: 'Account',
    });
    try {
      const token = await accountToken(auth);
      if (!token) {
        user = null;
        for (const fn of listeners) await fn(null);
        throw Error('Your sign-in expired. Sign in again.');
      }
      const response = await fetch(
        new URL(
          'api',
          config.apiUrl.endsWith('/') ? config.apiUrl : config.apiUrl + '/',
        ),
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({ action, ...values }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || 'Account operation failed.');
      task.finish();
      return result.data;
    } catch (e) {
      task.finish({ state: 'error', error: e.message });
      throw e;
    }
  }
  async function request(path,{method='GET',body,idempotencyKey}={}) {
    if(!config.apiUrl)throw Error('The account API is not configured yet.');
    if(!path.startsWith('/v1/'))throw Error('Invalid API path.');
    const token=await accountToken(auth);if(!token)throw Object.assign(Error('Sign in again.'),{status:401});
    const headers={Authorization:'Bearer '+token};
    if(method!=='GET'){headers['Idempotency-Key']=idempotencyKey || crypto.randomUUID();if(method!=='DELETE')headers['Content-Type']='application/json';}
    const response=await fetch(new URL(path,config.apiUrl),{method,headers,cache:'no-store',...(method!=='GET' && method!=='DELETE'?{body:JSON.stringify(body || {})}:{})});
    const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error?.message || 'Messaging request failed.'),{status:response.status,code:result.error?.code,requestId:result.requestId});
    return result.data;
  }
  const api = {
    auth,
    request,
    call,
    get user() {
      return user;
    },
    observe(fn) {
      listeners.add(fn);
      refresh().catch(() => fn(null));
      return () => listeners.delete(fn);
    },
    refresh,
    async email(email, password, register = false) {
      unwrap(
        await (register
          ? auth.signUp.email({ email, password, name: email.split('@')[0] })
          : auth.signIn.email({ email, password })),
      );
      await refresh();
    },
    async google() {
      unwrap(
        await auth.signIn.social({
          provider: 'google',
          callbackURL: new URL(new URL(location.href).searchParams.get('tab')==='instagram'?'?view=account&tab=instagram':'?view=account', location.href).href,
        }),
      );
      await refresh();
    },
    async signOut() {
      unwrap(await auth.signOut());
      clearInstagramClaimStorage();
      user = null;
      for (const fn of listeners) await fn(null);
    },
    async verify() {
      unwrap(
        await auth.emailOtp.sendVerificationOtp({
          email: user.email,
          type: 'email-verification',
        }),
      );
    },
    async verifyCode(otp) {
      unwrap(await auth.emailOtp.verifyEmail({ email: user.email, otp }));
      await refresh();
    },
    async reset(email) {
      unwrap(
        await auth.requestPasswordReset({
          email,
          redirectTo: new URL('?view=account', location.href).href,
        }),
      );
    },
    async resetPassword(token, newPassword) {
      unwrap(await auth.resetPassword({ token, newPassword }));
    },
    ensureProfile: () => call('me'),
    async profile(target) {
      if (target === user?.uid) return (await call('me')).profile;
      return call('profile', { target });
    },
    async saveProfile(values) {
      const me = await call('me');
      if (values.instagram && !values.instagram.startsWith('https://'))
        values.instagram =
          'https://www.instagram.com/' +
          values.instagram.replace(/^@/, '') +
          '/';
      await call('preferences', { profile: { ...me.profile, ...values } });
    },
    list: (values) => call('sessions', values),
    get: (id) => call('session', { id }),
    async save(id, values) {
      return (await call('saveSession', { id, values })).id;
    },
    visibility: (id, visibility) => call('visibility', { id, visibility }),
    deleteSession: (id) => call('deleteSession', { id }),
    async reauthenticate(password) {
      if (password)
        unwrap(await auth.signIn.email({ email: user.email, password }));
    },
    async deleteAccount(password) {
      await call('deleteAccount');
      unwrap(await auth.deleteUser(password ? { password } : {}));
      await refresh();
    },
    instagramPosts: async () => [],
    instagramStatus: async () => null,
    async upload() {
      throw Error(
        'Keep photos on Instagram or TikTok. Add a post link on the beach page.',
      );
    },
    photo: async () => {
      throw Error('Photos are hosted on social platforms.');
    },
    removePhoto: async () => {},
    async linkGoogle() {
      unwrap(
        await auth.linkSocial({
          provider: 'google',
          callbackURL: location.href,
        }),
      );
    },
    async linkPassword() {
      throw Error('Manage sign-in methods through Neon Auth.');
    },
  };
  clients.set(config.authUrl, api);
  await refresh();
  return api;
}
