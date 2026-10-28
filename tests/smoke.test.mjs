import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = 4178;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [join(root, 'server.mjs')], {
  cwd: root,
  env: { ...process.env, PORT: String(port), STATIC_ROOT: join(root, 'dist') },
  stdio: ['ignore', 'ignore', 'pipe'],
  windowsHide: true
});
let stderr = '';
server.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-4000); });

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  throw new Error(`Static test server did not start. ${stderr}`);
}

test('production app serves only its local client renderer and static assets', async (t) => {
  try {
    t.after(async () => {
      if (server.exitCode === null) server.kill('SIGTERM');
      await new Promise((resolve) => {
        if (server.exitCode !== null) return resolve();
        server.once('exit', resolve);
        setTimeout(resolve, 3000);
      });
    });

    const page = await waitForServer();
    const html = await page.text();
    assert.match(html, /SonicFrame/);
    assert.match(html, /Kualitas video/);
    assert.match(html, /Media tetap di perangkat/);
    assert.match(html, /Spotify Carousel/);
    assert.match(html, /Minimal Player/);
    assert.match(html, /iPhone Model/);
    assert.match(html, /carousel-depth/);
    assert.match(html, /background-intensity/);
    assert.match(html, /Foto Depan/);
    assert.match(html, /foreground-scale/);

    const appResponse = await fetch(`${baseUrl}/src/app.js`);
    assert.equal(appResponse.status, 200);
    const app = await appResponse.text();
    assert.match(app, /new Worker\(/);
    assert.match(app, /AudioEncoder\.isConfigSupported/);
    assert.doesNotMatch(app, /XMLHttpRequest|captureStream|MediaRecorder|\/api\/audio|\/api\/render|fetch\(/);

    const workerResponse = await fetch(`${baseUrl}/src/render-worker.js`);
    assert.equal(workerResponse.status, 200);
    const worker = await workerResponse.text();
    assert.match(worker, /Mp4OutputFormat/);
    assert.match(worker, /AudioSampleSource/);
    assert.match(worker, /CanvasSource/);
    assert.match(worker, /hardwareAcceleration/);
    assert.match(worker, /spectrumEnabled/);
    assert.match(worker, /carouselDepth/);
    assert.match(worker, /backgroundIntensity/);
    assert.match(worker, /ensureModelBackground/);

    const muxerResponse = await fetch(`${baseUrl}/node_modules/mediabunny/dist/bundles/mediabunny.min.mjs`);
    assert.equal(muxerResponse.status, 200, 'self-hosted MP4 muxer should be available as a static module');
    assert.match(muxerResponse.headers.get('content-type'), /javascript/);
    assert.ok((await muxerResponse.arrayBuffer()).byteLength > 100_000);

    const modelAssetResponse = await fetch(`${baseUrl}/src/assets/iphone-model-background.png`);
    assert.equal(modelAssetResponse.status, 200);
    assert.match(modelAssetResponse.headers.get('content-type'), /image\/png/);
    assert.ok((await modelAssetResponse.arrayBuffer()).byteLength > 100_000);

    for (const path of ['/api/audio', '/api/render', '/node_modules/other/index.js', '/server.mjs']) {
      assert.equal((await fetch(`${baseUrl}${path}`)).status, 404, `${path} should not be exposed by the static server`);
    }
    assert.equal((await fetch(`${baseUrl}/api/render`, { method: 'POST' })).status, 405, 'no server render method exists');

    const [playerRenderer, packageInfo] = await Promise.all([
      readFile(join(root, 'src', 'player-renderer.js'), 'utf8'),
      readFile(join(root, 'package.json'), 'utf8')
    ]);
    assert.match(playerRenderer, /ImageBitmap/);
    assert.match(playerRenderer, /drawSpotify\(/);
    assert.match(playerRenderer, /drawSpotifyCard\(/);
    assert.match(playerRenderer, /drawIphoneModel\(/);
    assert.match(playerRenderer, /iphone-model-background\.png/);
    assert.match(playerRenderer, /IPHONE_SCREEN_CORNERS/);
    assert.match(playerRenderer, /drawPerspectiveImage\(/);
    assert.match(playerRenderer, /drawForegroundPhoto\(/);
    assert.match(playerRenderer, /setForeground\(/);
    assert.match(playerRenderer, /extractCoverPalette\(/);
    assert.doesNotMatch(playerRenderer, /s\.album|coverName|file\.name/);
    assert.match(app, /coverImage = state\.coverFile\.slice\(/);
    assert.match(app, /cover: coverImage/);
    assert.match(app, /foregroundImage = state\.foregroundFile\?\.slice\(/);
    assert.match(app, /foreground: foregroundImage/);
    assert.match(worker, /createImageBitmap\(message\.foreground\)/);
    assert.match(JSON.parse(packageInfo).dependencies.mediabunny, /^\^1\./);
  } finally {
    if (server.exitCode === null) server.kill('SIGTERM');
  }
});
