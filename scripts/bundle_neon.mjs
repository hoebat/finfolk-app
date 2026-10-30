import { build } from 'esbuild';
const result = await build({
  entryPoints: [new URL('../web/neon-client.js', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2022',
  minify: true,
  external: ['./activity.js'],
  legalComments: 'inline',
});
process.stdout.write(result.outputFiles[0].text);
