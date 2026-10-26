import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {StaticData,cellFor,profileCoordinates,profileCSV,contourLines} from '../web/data-client.js';

// End-to-end: Python prepares known native cells; the browser client reads the
// resulting Pages artifact through mocked static HTTP under a repository prefix.
const temp=await mkdtemp(join(tmpdir(),'shore-static-'));
try{
  const code=String.raw`
from pathlib import Path
from tests.test_core import fixture, metadata
from depth_explorer.acquire import import_rasters
from depth_explorer.static import build
from depth_explorer.store import Store
import sys
root=Path(sys.argv[1]); source=fixture(root/'synthetic.asc')
store=Store(root/'datasets')
import_rasters(store,'bondi',[source],metadata(resolution_m=20))
build(store,root/'site',max_zoom=5)
`;
  execFileSync(process.env.PYTHON||'python3',['-c',code,temp],{cwd:new URL('..',import.meta.url),stdio:'pipe'});
  let requests=0;const urls=[];
  const base=new URL('https://example.test/shore-depth-explorer/');
  const fetcher=async function(url){
    assert.equal(this,globalThis,'Browser fetch requires its Window/global receiver');
    urls.push(url);requests++;const parsed=new URL(url);assert.ok(parsed.pathname.startsWith('/shore-depth-explorer/'),'Every request must retain the Pages repository prefix');const path=parsed.pathname.slice('/shore-depth-explorer/'.length);
    try{return new Response(await readFile(join(temp,'site',path)),{status:200});}catch{return new Response('',{status:404});}
  };
  const client=new StaticData(base,fetcher);
  // Exercise the production constructor path, not just an injected arrow mock.
  const originalFetch=globalThis.fetch;
  try{
    globalThis.fetch=fetcher;
    const defaultClient=new StaticData(base);
    await defaultClient.catalog();
    assert.equal((await defaultClient.sample('bondi',[151.2725,-33.8975])).depth_m,10);
  }finally{globalThis.fetch=originalFetch;}
  await client.catalog();assert.equal(client.region('bondi').status,'raster');
  const values=await client.sampleMany('bondi',[[151.2705,-33.8975],[151.2715,-33.8975],[151.2725,-33.8975],[151.2715,-33.8985],[151.30,-33.9]]);
  assert.deepEqual(values.map(v=>v.depth_m),[-2,0,10,null,null]);
  assert.deepEqual(values.map(v=>v.status),['above-datum','depth','depth','no-data','no-data']);
  const before=requests;await client.sample('bondi',[151.2725,-33.8975]);assert.equal(requests,before,'Native chunks are cached, not repeatedly downloaded');
  const profile=await client.profile('bondi',[[151.2701,-33.8985],[151.2739,-33.8985]]);
  assert.ok(profile.samples.some(s=>s.depth_m===null));assert.ok(profile.samples.some(s=>s.depth_m>0));assert.ok(profile.spacing_m>=20);assert.ok(profile.samples.length<=5000);
  assert.equal(profile.samples[0].distance_m,0);assert.equal(profile.samples.at(-1).distance_m,profile.length_m);
  const csv=profileCSV(profile);assert.ok(csv.includes('"no-data"'));assert.ok(csv.includes('"TEST DATUM"'));assert.ok(csv.includes(',"","no-data",'));
  const meta=client.region('bondi').rasters[0];client.region('bondi').rasters.push({...meta,id:'different',datum:'OTHER'});await assert.rejects(client.profile('bondi',[[151.27,-33.9],[151.28,-33.9]]),/incompatible/);client.region('bondi').rasters.pop();
  const broken=new StaticData(client.base,async url=>url.endsWith('.gz')?new Response('bad chunk'):client.fetcher(url));await broken.catalog();await assert.rejects(broken.sample('bondi',[151.2705,-33.8975]));
  const pointer=new StaticData(client.base,async()=>new Response('version https://git-lfs.github.com/spec/v1\noid sha256:test'));await assert.rejects(pointer.catalog(),/Git LFS/);
  assert.deepEqual(cellFor({transform:[2,0,100,0,-2,200]},[105,195]),[2,2]);
  assert.throws(()=>profileCoordinates([[NaN,0],[1,1]],5));
  const lines=contourLines([0,1],[0,1],[0,10,0,10],5,'TEST');assert.equal(lines.features.length,2);assert.ok(lines.features.every(f=>f.geometry.coordinates.every(p=>Math.abs(p[0]-f.properties.depth_m/10)<1e-9)));
  assert.equal(contourLines([0,1],[0,1],[0,null,0,10],5,'TEST').features.length,0,'Missing cells must not be contoured across');
  console.log('Static checks passed: native Python-to-browser chunks, Pages subpaths, caching, profiles, CSV, gaps, corrupt files, datum compatibility and contours.');
}finally{await rm(temp,{recursive:true,force:true});}
