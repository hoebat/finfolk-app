// Large public survey files are stored compressed to fit the static asset limit.
// Browsers transparently decompress these responses, preserving atlas checksums.
import {isBrowserAPIPath} from './browser-routes.mjs';
export default {
  async fetch(request, env) {
    const route=new URL(request.url);
    if(route.pathname==='/_next/health'){
      route.pathname='/health';return env.NEXT_API.fetch(new Request(route,request));
    }
    if(isBrowserAPIPath(route.pathname))return env.NEXT_API.fetch(request);
    const original = await env.ASSETS.fetch(request);
    if(original.status !== 404 || !['GET','HEAD'].includes(request.method)) return original;
    const url = new URL(request.url);
    if(!url.pathname.startsWith('/data/')) return original;
    url.pathname = '/__compressed' + url.pathname + '.gz';
    const compressed = await env.ASSETS.fetch(new Request(url, {method:request.method}));
    if(!compressed.ok) return original;
    const headers = new Headers(compressed.headers);
    headers.set('Content-Encoding','gzip');
    headers.set('Content-Type',new URL(request.url).pathname.endsWith('.geojson') ? 'application/geo+json' : 'application/octet-stream');
    headers.set('X-Robots-Tag','noindex, nofollow');
    headers.set('Vary','Accept-Encoding');
    return new Response(compressed.body,{status:compressed.status,headers,encodeBody:'manual'});
  }
};
