// Neon injects the API JWT into getSession().data.session.token, including
// OAuth verifier sessions where cross-site cookies cannot serve /token.
export async function accountToken(auth) {
  const session = await auth.getSession();
  if (session.error) throw Error(session.error.message || 'Session could not be restored.');
  const token = session.data?.session?.token;
  if (typeof token === 'string' && token.split('.').length === 3) return token;
  // Never send an opaque session cookie/token to the application's JWT API.
  const result = await auth.token();
  if (result.error) throw Error(result.error.message || 'Sign-in could not be restored.');
  return result.data?.token || null;
}
