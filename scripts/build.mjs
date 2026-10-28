import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';

await mkdir('dist/scripts', { recursive: true });
await build({ entryPoints: ['src/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: 'dist/scripts/main.js', sourcemap: true });
for (const path of ['styles', 'templates', 'lang', 'LICENSE', 'README.md', 'RESEARCH.md', 'docs']) {
  await cp(path, `dist/${path}`, { recursive: true });
}
const manifest = JSON.parse(await readFile('module.json', 'utf8'));
const repository = process.env.GITHUB_REPOSITORY;
if (repository) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid GITHUB_REPOSITORY');
  manifest.url = `https://github.com/${repository}`;
  manifest.manifest = `${manifest.url}/releases/latest/download/module.json`;
  manifest.download = `${manifest.url}/releases/download/v${manifest.version}/pf2e-complete-spellbook.zip`;
}
await writeFile('dist/module.json', JSON.stringify(manifest, null, 2) + '\n');
console.info(`Built ${manifest.id} ${manifest.version}${repository ? ' with release URLs' : ' for local installation'}`);
