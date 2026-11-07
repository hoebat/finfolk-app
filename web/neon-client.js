import { clearInstagramClaimStorage } from './instagram-claim.js';
import { accountToken } from './auth-session.js';
import { createAuthClient } from '@neondatabase/auth';
import { activity } from './activity.js';
const clients = new Map();
export async function createLogbookClient(config) {
  if (clients.has(config.authUrl)) return clients.get(config.authUrl);
  const auth = createAuthClient(config.authUrl),
    listeners = new Set();
  let user = null, backbone = null, application = null;
  function clearBackbone(){if(application)application.clearMember();else backbone?.close();backbone=null;}
  const unwrap = (result) => {
    if (result?.error) throw Error(result.error.message || 'Sign-in failed.');
    return result?.data;
  };
  async function refresh() {
    const data = unwrap(await auth.getSession());
    const previousUid = user?.uid;
    user = data?.user
      ? {
          ...data.user,
          uid: data.user.id,
          emailVerified: data.user.emailVerified,
          providerData: [],
        }
      : null;
    if (previousUid && user?.uid !== previousUid) {clearBackbone();clearInstagramClaimStorage();}
    if(config.backbone){const {createApplicationBackbone}=await import('./next-backbone.js');application ||= createApplicationBackbone(config);application.state('auth',{status:user?'signed-in':'signed-out',id:user?.uid||null});}
    for (const fn of listeners) await fn(user);
    return user;
  }
  async function transportCall(action, values = {}, expectedActor = null) {
    if (!config.apiUrl) throw Error('The account API is not configured yet.');
    const task = activity.begin({
      label: 'Account: ' + action,
      kind: 'Account',
    });
    try {
      const token = await accountToken(auth);
      if(expectedActor && user?.uid!==expectedActor)throw Error('Account changed. Sign in again.');
      if (!token) {
        clearBackbone();user = null;
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
        throw Object.assign(Error(result.error || 'Account operation failed.'),{status:response.status});
      task.finish();
      return result.data;
    } catch (e) {
      if(e.status===401){clearBackbone();user=null;for(const fn of listeners)await fn(null);}
      task.finish({ state: 'error', error: e.message });
      throw e;
    }
  }
  async function actorBackbone(){
    const actor=user?.uid;if(!actor)throw Error('Sign in again.');
    if(!backbone || backbone.actor!==actor){
      const {createApplicationBackbone}=await import('./next-backbone.js');
      if(user?.uid!==actor)throw Error('Account changed. Sign in again.');
      application=createApplicationBackbone(config);
      backbone=application.member(actor,(name,values,options)=>values.__rest ? transportRequest(values.path,{...options,body:values.body},actor) : transportCall(name,values,actor));
    }return backbone;
  }
  async function call(action, values = {}) {
    if(!config.backbone)return transportCall(action,values);
    return (await actorBackbone()).call(action,values);
  }
  async function request(path,options={}){
    if(!config.backbone)return transportRequest(path,options);
    const url=new URL(path,'https://local.invalid');url.searchParams.sort();path=url.pathname+url.search;
    const {restOperation}=await import('./next-backbone.js');
    const spec=restOperation(path,options.method||'GET');
    return (await actorBackbone()).call(spec.name,{__rest:true,path,...(options.body?{body:options.body}:{})},options);
  }
  async function transportRequest(path,{method='GET',body,idempotencyKey,signal}={},expectedActor=null) {
    if(!config.apiUrl)throw Error('The account API is not configured yet.');
    if(!path.startsWith('/v1/'))throw Error('Invalid API path.');
    const token=await accountToken(auth);if(expectedActor && user?.uid!==expectedActor)throw Error('Account changed. Sign in again.');if(!token){clearBackbone();user=null;for(const fn of listeners)await fn(null);clearInstagramClaimStorage();throw Object.assign(Error('Sign in again.'),{status:401});}
    const headers={Authorization:'Bearer '+token};
    if(method!=='GET'){headers['Idempotency-Key']=idempotencyKey || crypto.randomUUID();if(method!=='DELETE')headers['Content-Type']='application/json';}
    const response=await fetch(new URL(path,config.apiUrl),{method,headers,signal,cache:'no-store',...(method!=='GET' && method!=='DELETE'?{body:JSON.stringify(body || {})}:{})});
    const result=await response.json();if(response.status===401){clearBackbone();user=null;for(const fn of listeners)await fn(null);}if(!response.ok)throw Object.assign(Error(result.error?.message || 'Messaging request failed.'),{status:response.status,code:result.error?.code,requestId:result.requestId});
    return result.data;
  }
  async function authWork(kind,work){if(!config.backbone)return work();const {createApplicationBackbone}=await import('./next-backbone.js');application ||= createApplicationBackbone(config);return application.auth(kind,async()=>{const result=await work();if(result?.error)throw Error(result.error.message||'Sign-in failed.');return result;});}
  const api = {
    auth,
    request,
    call,
    async subscribe(action,values,fn){return (await actorBackbone()).subscribe(action,values,fn);},
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
        await authWork(register?'sign-up':'sign-in',()=>register
          ? auth.signUp.email({ email, password, name: email.split('@')[0] })
          : auth.signIn.email({ email, password })),
      );
      await refresh();
    },
    async google() {
      unwrap(
        await authWork('google',()=>auth.signIn.social({
          provider: 'google',
          callbackURL: new URL(new URL(location.href).searchParams.get('tab')==='instagram'?'?view=account&tab=instagram':'?view=account', location.href).href,
        })),
      );
      await refresh();
    },
    async signOut() {
      unwrap(await authWork('sign-out',()=>auth.signOut()));
      clearBackbone();
      clearInstagramClaimStorage();
      user = null;
      for (const fn of listeners) await fn(null);
    },
    async verify() {
      unwrap(
        await authWork('verification-send',()=>auth.emailOtp.sendVerificationOtp({
          email: user.email,
          type: 'email-verification',
        })),
      );
    },
    async verifyCode(otp) {
      unwrap(await authWork('verification',()=>auth.emailOtp.verifyEmail({ email: user.email, otp })));
      await refresh();
    },
    async reset(email) {
      unwrap(
        await authWork('reset-request',()=>auth.requestPasswordReset({
          email,
          redirectTo: new URL('?view=account', location.href).href,
        })),
      );
    },
    async resetPassword(token, newPassword) {
      unwrap(await authWork('reset-password',()=>auth.resetPassword({ token, newPassword })));
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
        unwrap(await authWork('reauthenticate',()=>auth.signIn.email({ email: user.email, password })));
    },
    async deleteAccount(password) {
      await call('deleteAccount');
      unwrap(await authWork('delete-account',()=>auth.deleteUser(password ? { password } : {})));
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
        await authWork('link-google',()=>auth.linkSocial({
          provider: 'google',
          callbackURL: location.href,
        })),
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
