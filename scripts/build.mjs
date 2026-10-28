import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputRoot = resolve(projectRoot, 'dist');
if (outputRoot !== resolve(projectRoot, 'dist')) throw new Error('Unexpected production output path.');

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await cp(join(projectRoot, 'index.html'), join(outputRoot, 'index.html'));
await cp(join(projectRoot, 'src'), join(outputRoot, 'src'), { recursive: true });
await cp(join(projectRoot, 'node_modules', 'mediabunny', 'dist'), join(outputRoot, 'node_modules', 'mediabunny', 'dist'), { recursive: true });
await mkdir(join(outputRoot, 'licenses'), { recursive: true });
await cp(join(projectRoot, 'node_modules', 'mediabunny', 'LICENSE'), join(outputRoot, 'licenses', 'mediabunny-MPL-2.0.txt'));
const packageInfo = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
await writeFile(join(outputRoot, 'build-info.json'), JSON.stringify({ name: packageInfo.name, version: packageInfo.version, renderer: 'browser-webcodecs' }, null, 2));
console.log(`Static production build written to ${outputRoot}`);
