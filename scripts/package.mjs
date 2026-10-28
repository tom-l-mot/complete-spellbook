import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { zipSync, unzipSync } from 'fflate';

const files = {};
async function collect(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${item.name}`;
    if (item.isDirectory()) await collect(path);
    else files[path.slice(5)] = new Uint8Array(await readFile(path));
  }
}
await collect('dist');
const archive = zipSync(files, { level: 6 });
const unpacked = unzipSync(archive);
const manifest = JSON.parse(new TextDecoder().decode(unpacked['module.json']));
assert.equal(manifest.id, 'pf2e-complete-spellbook');
for (const path of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map(l => l.path), 'templates/spellbook.hbs', 'LICENSE']) {
  assert.ok(unpacked[path]?.length, `Missing release file ${path}`);
}
assert.ok(!Object.keys(unpacked).some(p => p.includes('node_modules') || p.includes('..')));
await mkdir('build', { recursive: true });
await writeFile('build/pf2e-complete-spellbook.zip', archive);
await writeFile('build/module.json', JSON.stringify(manifest, null, 2) + '\n');
console.info(`ZIP verified: ${Object.keys(unpacked).length} files, ${archive.length} bytes`);
