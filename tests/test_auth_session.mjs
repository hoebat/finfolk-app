import assert from 'node:assert/strict';
import { accountToken } from '../web/auth-session.js';
const jwt='header.payload.signature';
assert.equal(await accountToken({getSession:async()=>({data:{session:{token:jwt}}}),token:()=>assert.fail('Session JWT must avoid cross-site token request')}),jwt);
assert.equal(await accountToken({getSession:async()=>({data:{session:{token:'opaque-cookie'}}}),token:async()=>({data:{token:jwt}})}),jwt);
assert.equal(await accountToken({getSession:async()=>({data:null}),token:async()=>({data:{token:null}})}),null);
await assert.rejects(()=>accountToken({getSession:async()=>({error:{message:'Session unavailable'}})}),/Session unavailable/);
await assert.rejects(()=>accountToken({getSession:async()=>({data:null}),token:async()=>({error:{message:'Sign in again'}})}),/Sign in again/);
console.log('Auth session checks passed: SDK session JWT, opaque-token rejection, fallback and expiry/errors.');
