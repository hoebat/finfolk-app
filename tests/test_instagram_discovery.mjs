import assert from "node:assert/strict";
import {
  matchInstagramBeach,
  normalizeInstagramMedia,
  instagramGraph,
} from "../backend/instagram-discovery.mjs";
assert.equal(matchInstagramBeach("Lovely day at Bondi Beach")[0].id, "bondi");
assert.equal(
  matchInstagramBeach("South Maroubra Beach")[0].id,
  "south-maroubra",
);
assert.equal(matchInstagramBeach("South Maroubra Beach").length, 1);
assert.equal(matchInstagramBeach("Bondi Beach and Clovelly Beach").length, 2);
assert.equal(matchInstagramBeach("#jervisbay").length, 0);
assert.equal(matchInstagramBeach("#bondibeach")[0].id, "bondi");
assert.equal(matchInstagramBeach("MyBondi Beaching").length, 0);
assert.equal(
  normalizeInstagramMedia(
    { id: "12", permalink: "https://evil.test/p/a/" },
    "tags",
  ),
  null,
);
const m = normalizeInstagramMedia(
  {
    id: "12",
    permalink: "https://instagram.com/p/ABC/?tracking=1",
    username: "creator",
    owner: { id: "88" },
    caption: "<script>",
    timestamp: "bad",
  },
  "tags",
);
assert.equal(m.url, "https://www.instagram.com/p/ABC/");
assert.equal(m.authorId, "88");
assert.equal(m.postedAt, null);
let request;
await instagramGraph(
  "123/tags",
  { INSTAGRAM_ACCESS_TOKEN: "test-secret", INSTAGRAM_GRAPH_VERSION: "v26.0" },
  { after: "cursor" },
  async (u, init) => {
    request = { u, init };
    return Response.json({ data: [] });
  },
);
assert.equal(request.u.searchParams.has("access_token"), false);
assert.equal(request.init.headers.Authorization, "Bearer test-secret");
await assert.rejects(
  instagramGraph(
    "123/tags",
    { INSTAGRAM_ACCESS_TOKEN: "test", INSTAGRAM_GRAPH_VERSION: "v26.0" },
    {},
    async () => Response.json({ error: { code: 190 } }, { status: 400 }),
  ),
  (e) => e.providerCode === 190 && !e.message.includes("test"),
);
console.log(
  "INSTAGRAM_DISCOVERY_UNIT_PASS: exact beach matching, ambiguity, canonical URLs, dates, provider errors and bearer-only credentials.",
);
const {collectInstagramSource}=await import('../backend/instagram-collector.mjs');
const savedFetch=globalThis.fetch;
try{
 for(const [code,subcode,hidden]of [[100,33,true],[190,0,false],[4,0,false]]){
  const queries=[];
  const q=async(sql,params=[])=>{queries.push({sql,params});if(sql.includes("status='running'"))return[{key:'recheck',kind:'recheck',failures:0}];if(sql.startsWith('SELECT id,media_id'))return[{id:'test-row',media_id:'22'}];return[];};
  globalThis.fetch=async()=>Response.json({error:{code,error_subcode:subcode}},{status:400});
  await collectInstagramSource('recheck',{INSTAGRAM_DISCOVERY_ENABLED:'true',INSTAGRAM_ACCESS_TOKEN:'fixture',INSTAGRAM_GRAPH_VERSION:'v26.0'},q);
  assert.equal(queries.some(x=>x.sql.includes("state='unavailable'")),hidden);
  if(code===190)assert.ok(queries.some(x=>x.params.includes('access_required')));
  if(code===4)assert.ok(queries.some(x=>x.params.includes('rate_limited')));
 }
}finally{globalThis.fetch=savedFetch;}
console.log('INSTAGRAM_RECHECK_PASS: unavailable media hides; auth and quota failures preserve published content.');
