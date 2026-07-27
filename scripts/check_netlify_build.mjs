import { build } from 'esbuild';

const entryPoints = [
  'netlify/functions/api.mjs',
  'netlify/functions/campaign-runner.mjs',
];

for (const entryPoint of entryPoints) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    external: ['express', 'unzipper'],
    write: false,
    logLevel: 'silent',
  });
  const bytes = result.outputFiles.reduce((total, file) => total + file.contents.length, 0);
  console.log(`${entryPoint}: empacotamento validado (${bytes} bytes)`);
}
