import {build} from 'esbuild';import {resolve} from 'node:path';
await build({entryPoints:['client/next-backbone.mjs'],outfile:'web/next-backbone.js',bundle:true,format:'esm',target:'es2022',minify:true,legalComments:'inline',plugins:[{name:'vendored-xtalk',setup(b){b.onResolve({filter:/^@xtalk\//},args=>({path:resolve('vendor/xtalk',args.path.slice(7))}));}}]});
console.log('Bundled actual XTalk substrate and database runtime.');
