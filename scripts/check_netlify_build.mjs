import { build } from 'esbuild';
import Module from 'node:module';
import path from 'node:path';

const entryPoints = [
  'netlify/functions/api.cjs',
  'netlify/functions/campaign-runner.cjs',
];

for (const entryPoint of entryPoints) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['express', 'unzipper'],
    write: false,
    logLevel: 'silent',
  });
  const bytes = result.outputFiles.reduce((total, file) => total + file.contents.length, 0);
  const compiled = new Module(path.resolve(entryPoint));
  compiled.filename = path.resolve(entryPoint);
  compiled.paths = Module._nodeModulePaths(process.cwd());
  compiled._compile(result.outputFiles[0].text, compiled.filename);
  if (typeof compiled.exports.handler !== 'function') {
    throw new Error(`${entryPoint} não exportou uma função handler CommonJS.`);
  }
  console.log(`${entryPoint}: empacotamento validado (${bytes} bytes)`);
}
