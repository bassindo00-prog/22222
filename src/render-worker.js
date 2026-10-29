import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality
} from '../node_modules/mediabunny/dist/bundles/mediabunny.min.mjs';
import { PlayerRenderer } from './player-renderer.js';

let canceled = false;
let output;
let renderer;
let coverBitmap;
let foregroundBitmap;
let customBackgroundBitmap;
let audioSource;
let videoSource;
let frameState;
let config;
let sourceStarted = false;
let audioEncodeMs = 0;

function sendError(error) {
  self.postMessage({ type: 'error', message: error?.message || 'Browser gagal membuat MP4.' });
}

function createVisualizerSpectrum(time, duration, peaks) {
  const values = new Uint8Array(64);
  if (!peaks?.length) return values;
  const position = Math.min(peaks.length - 1, Math.floor((config.trimStart + time) / config.sourceDuration * peaks.length));
  const level = Math.max(0, Math.min(1, peaks[position] || 0));
  for (let index = 0; index < values.length; index++) {
    const curve = .18 + .82 * Math.abs(Math.sin(index * .43 + time * 2.2)) * (.55 + .45 * Math.abs(Math.sin(index * .13 + time * .8)));
    values[index] = Math.round(255 * level * curve);
  }
  return values;
}

async function start(message) {
  config = message.config;
  if (typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') {
    throw new Error('Browser ini tidak memiliki OffscreenCanvas untuk render lokal.');
  }
  frameState = { current: 0, duration: config.duration, progress: 0, playing: true, volume: 1, spectrum: null };
  const canvas = new OffscreenCanvas(config.width, config.height);
  renderer = new PlayerRenderer(canvas, () => ({
    title: config.title,
    artist: config.artist,
    album: config.album,
    background: config.background,
    color: config.color,
    template: config.template,
    spectrumEnabled: config.spectrumEnabled,
    carouselDepth: config.carouselDepth,
    backgroundIntensity: config.backgroundIntensity,
    blueGlow: config.blueGlow,
    glassOpacity: config.glassOpacity,
    glassBlur: config.glassBlur,
    verifiedBadge: config.verifiedBadge,
    glassTag: config.glassTag,
    foregroundX: config.foregroundX,
    foregroundY: config.foregroundY,
    foregroundScale: config.foregroundScale,
    progress: frameState.progress,
    current: frameState.current,
    duration: frameState.duration,
    playing: true,
    offline: true,
    volume: 1,
    renderSpectrum: frameState.spectrum
  }));
  if (config.template === 'iphone-model') {
    const fixedBackground = await renderer.ensureModelBackground();
    if (!fixedBackground) throw renderer.modelBackgroundError || new Error('Aset latar template iPhone tidak tersedia.');
  }
  coverBitmap = await createImageBitmap(message.cover);
  renderer.setCover(coverBitmap);
  if (message.foreground) {
    foregroundBitmap = await createImageBitmap(message.foreground);
    renderer.setForeground(foregroundBitmap);
  }
  if (message.customBackground) {
    customBackgroundBitmap = await createImageBitmap(message.customBackground);
    renderer.setCustomBackground(customBackgroundBitmap);
  }
  renderer.setSize(config.width, config.height);

  output = new Output({
    format: new Mp4OutputFormat({ fastStart: false }),
    target: new BufferTarget()
  });
  videoSource = new CanvasSource(canvas, {
    codec: 'avc',
    fullCodecString: config.videoCodec,
    quality: new Quality({ bitrate: config.videoBitrate }),
    latencyMode: 'quality',
    hardwareAcceleration: config.hardwareAcceleration,
    keyFrameInterval: 2
  });
  audioSource = new AudioSampleSource({
    codec: 'aac',
    fullCodecString: 'mp4a.40.2',
    quality: new Quality({ bitrate: 160_000 }),
    transform: { numberOfChannels: 2, sampleRate: 48_000 }
  });
  output.addVideoTrack(videoSource, { frameRate: config.fps });
  output.addAudioTrack(audioSource);
  output.setMetadataTags({ title: config.title, artist: config.artist, album: config.album });
  await output.start();
  sourceStarted = true;
  self.postMessage({ type: 'ready' });
}

async function addAudio(message) {
  const data = new Float32Array(message.data);
  const sample = new AudioSample({
    data,
    format: 'f32-planar',
    numberOfChannels: message.channels,
    sampleRate: message.sampleRate,
    timestamp: message.timestamp
  });
  const t0 = performance.now();
  try {
    if (canceled) throw new DOMException('Render dibatalkan.', 'AbortError');
    await audioSource.add(sample);
  } finally {
    audioEncodeMs += (performance.now() - t0);
    sample.close();
  }
  self.postMessage({ type: 'audio-accepted', id: message.id });
}

async function finish(message) {
  const peaks = message.peaks || [];
  const audioDecodeMs = message.audioDecodeMs || 0;
  const totalFrames = Math.ceil(config.duration * config.fps);
  const startedAt = performance.now();
  let frameGenMs = 0;
  let videoEncodeMs = 0;

  for (let frame = 0; frame < totalFrames; frame++) {
    if (canceled) throw new DOMException('Render dibatalkan.', 'AbortError');
    const time = frame / config.fps;
    frameState.current = Math.min(time, config.duration);
    frameState.progress = Math.min(1, time / config.duration);
    frameState.spectrum = config.spectrumEnabled
      ? createVisualizerSpectrum(time, config.duration, peaks)
      : null;

    const tDraw = performance.now();
    renderer.draw();
    frameGenMs += (performance.now() - tDraw);

    const frameDuration = Math.min(1 / config.fps, config.duration - time);
    const tEnc = performance.now();
    await videoSource.add(time, frameDuration > 0 ? frameDuration : 1 / config.fps, { keyFrame: frame === 0 });
    videoEncodeMs += (performance.now() - tEnc);

    if (frame % 30 === 29 || frame === totalFrames - 1) {
      self.postMessage({
        type: 'progress', phase: 'video', done: frame + 1, total: totalFrames,
        percent: Math.min(97, Math.round((frame + 1) / totalFrames * 97)),
        elapsed: (performance.now() - startedAt) / 1000,
        fps: ((frame + 1) / ((performance.now() - startedAt) / 1000)).toFixed(1)
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  if (canceled) throw new DOMException('Render dibatalkan.', 'AbortError');
  self.postMessage({ type: 'progress', phase: 'finalize', percent: 98, done: totalFrames, total: totalFrames });

  const tMux = performance.now();
  await output.finalize();
  const muxMs = performance.now() - tMux;

  if (canceled) throw new DOMException('Render dibatalkan.', 'AbortError');
  const result = output.target.buffer;
  const bytes = result instanceof Uint8Array
    ? result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength)
    : result;
  const view = new DataView(bytes);
  const validMp4 = bytes.byteLength > 16
    && view.getUint32(4) === 0x66747970; // ftyp
  if (!validMp4) throw new Error('Encoder selesai, tetapi hasilnya bukan file MP4 yang valid.');

  const totalEncodingWallMs = performance.now() - startedAt;
  const totalPipelineMs = totalEncodingWallMs + audioDecodeMs + audioEncodeMs;

  const metrics = {
    audioDecodeMs,
    audioEncodeMs,
    frameGenMs,
    videoEncodeMs,
    muxMs,
    totalEncodingWallMs,
    totalPipelineMs,
    totalFrames,
    fps: (totalFrames / (totalEncodingWallMs / 1000)),
    videoCodec: config.videoCodec,
    hardwareAcceleration: config.hardwareAcceleration,
    width: config.width,
    height: config.height
  };

  self.postMessage({ type: 'result', buffer: bytes, duration: config.duration, metrics }, [bytes]);
  await dispose();
}

async function dispose() {
  if (output?.state === 'started' || output?.state === 'finalizing') {
    try { await output.cancel(); } catch {}
  }
  try { audioSource?.close(); } catch {}
  try { videoSource?.close(); } catch {}
  try { coverBitmap?.close(); } catch {}
  try { foregroundBitmap?.close(); } catch {}
  try { customBackgroundBitmap?.close(); } catch {}
  try { renderer?.modelBackground?.close(); } catch {}
  audioSource = null; videoSource = null; coverBitmap = null; foregroundBitmap = null; customBackgroundBitmap = null; renderer = null; output = null;
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'start') return await start(data);
    if (data.type === 'audio') return await addAudio(data);
    if (data.type === 'audio-complete') return await finish(data);
    if (data.type === 'cancel') {
      canceled = true;
      if (!sourceStarted) {
        await dispose();
        self.postMessage({ type: 'cancelled' });
      }
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError' || canceled) {
      await dispose();
      self.postMessage({ type: 'cancelled' });
    } else {
      await dispose();
      sendError(error);
    }
  }
};
