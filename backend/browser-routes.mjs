// Paths owned by the HTTP API rather than static hosting. Keep this allowlist
// separate from provider webhooks, which are not preview browser routes.
export function isBrowserAPIPath(path){
 return path==='/api' || path==='/health' || path.startsWith('/v1/') ||
  /^\/trips(?:\/[^/]+)?$/.test(path) ||
  /^\/community\/(?:posts|referral)$/.test(path) ||
  /^\/instagram\/posts(?:\/[^/]+\/report)?$/.test(path) || path==='/shop/checkout';
}
