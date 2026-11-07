import { build } from 'esbuild';
const result = await build({
  entryPoints: [new URL('../web/neon-client.js', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2022',
  minify: true,
  // Keep the shared dialog cleanup singleton identical to the account page's module.
  external: ['./activity.js', './instagram-claim.js', './next-backbone.js', './app-backbone.js'],
  legalComments: 'inline',
});
process.stdout.write(result.outputFiles[0].text);
