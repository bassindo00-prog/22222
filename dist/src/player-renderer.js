import { formatTime } from './audio-utils.js';

const TAU = Math.PI * 2;
const DEFAULT_PALETTE = { primary: '#d94746', secondary: '#f1ae4b', deep: '#160c17' };
const IPHONE_FACE_SIZE = { width: 800, height: 1700 };
const IPHONE_FACE_QUAD = [
  { x: -.028, y: .270 }, { x: .496, y: .312 },
  { x: .438, y: .873 }, { x: -.025, y: .835 }
];
// Screen corners traced once from the supplied 9:16 reference composition.
const IPHONE_SCREEN_CORNERS = [
  { x: .023, y: .303 }, { x: .452, y: .323 },
  { x: .437, y: .592 }, { x: .023, y: .570 }
];

export async function loadModelBackground() {
  const response = await fetch(new URL('./assets/iphone-model-background.png', import.meta.url));
  if (!response.ok) throw new Error('Latar template iPhone tidak dapat dimuat dari aset lokal.');
  return createImageBitmap(await response.blob());
}

function makeCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function makeProjector(points) {
  const [p0, p1, p2, p3] = points;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  const divisor = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(dx3) + Math.abs(dy3) < 1e-7 || Math.abs(divisor) < 1e-7 ? 0 : (dx3 * dy2 - dx2 * dy3) / divisor;
  const h = Math.abs(dx3) + Math.abs(dy3) < 1e-7 || Math.abs(divisor) < 1e-7 ? 0 : (dx1 * dy3 - dx3 * dy1) / divisor;
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x, c = p0.x;
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y, f = p0.y;
  return (u, v) => {
    const z = g * u + h * v + 1;
    return { x: (a * u + b * v + c) / z, y: (d * u + e * v + f) / z };
  };
}

function drawMappedTriangle(ctx, image, source, target) {
  const [p0, p1, p2] = source, [q0, q1, q2] = target;
  const det = p0.x * (p1.y - p2.y) + p1.x * (p2.y - p0.y) + p2.x * (p0.y - p1.y);
  if (Math.abs(det) < 1e-8) return;
  const affine = (v0, v1, v2) => [
    (v0 * (p1.y - p2.y) + v1 * (p2.y - p0.y) + v2 * (p0.y - p1.y)) / det,
    (v0 * (p2.x - p1.x) + v1 * (p0.x - p2.x) + v2 * (p1.x - p0.x)) / det,
    (v0 * (p1.x * p2.y - p2.x * p1.y) + v1 * (p2.x * p0.y - p0.x * p2.y) + v2 * (p0.x * p1.y - p1.x * p0.y)) / det
  ];
  const [a, c, e] = affine(q0.x, q1.x, q2.x);
  const [b, d, f] = affine(q0.y, q1.y, q2.y);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.closePath(); ctx.clip();
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

function drawPerspectiveImage(ctx, image, corners, columns = 18, rows = 28) {
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;
  const project = makeProjector(corners);
  for (let row = 0; row < rows; row++) {
    const sy0 = height * row / rows, sy1 = height * (row + 1) / rows;
    for (let column = 0; column < columns; column++) {
      const sx0 = width * column / columns, sx1 = width * (column + 1) / columns;
      const u0 = column / columns, u1 = (column + 1) / columns;
      const v0 = row / rows, v1 = (row + 1) / rows;
      const tl = project(u0, v0), tr = project(u1, v0), br = project(u1, v1), bl = project(u0, v1);
      drawMappedTriangle(ctx, image, [{ x: sx0, y: sy0 }, { x: sx1, y: sy0 }, { x: sx1, y: sy1 }], [tl, tr, br]);
      drawMappedTriangle(ctx, image, [{ x: sx0, y: sy0 }, { x: sx1, y: sy1 }, { x: sx0, y: sy1 }], [tl, br, bl]);
    }
  }
}

function drawQuad(ctx, points, fillStyle, strokeStyle = null, lineWidth = 1) {
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
  if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
  if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, value)); }

function toHex(value) { return `#${value.map((part) => Math.round(part).toString(16).padStart(2, '0')).join('')}`; }

function toRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const color = value.length === 3 ? value.split('').map((part) => parseInt(part + part, 16)) : [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  return `rgba(${color[0] || 0},${color[1] || 0},${color[2] || 0},${clamp(alpha)})`;
}

function hueFor(rgb) {
  const [r, g, b] = rgb.map((part) => part / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (!delta) return 0;
  let hue = max === r ? (g - b) / delta : max === g ? 2 + (b - r) / delta : 4 + (r - g) / delta;
  return ((hue / 6) + 1) % 1;
}

function colorAtHue(hue, saturation = .72, lightness = .58) {
  const h = ((hue % 1) + 1) % 1;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n) => {
    const k = (n + h * 12) % 12;
    const value = lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return value * 255;
  };
  return toHex([channel(0), channel(8), channel(4)]);
}

function extractCoverPalette(image) {
  try {
    const sample = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(32, 32)
      : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: 32, height: 32 }) : null;
    const context = sample?.getContext('2d', { willReadFrequently: true });
    if (!context) return DEFAULT_PALETTE;
    context.drawImage(image, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    const buckets = Array.from({ length: 12 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
    let neutral = [0, 0, 0], neutralWeight = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const rgb = [pixels[index], pixels[index + 1], pixels[index + 2]];
      if (pixels[index + 3] < 180) continue;
      neutral = neutral.map((value, channel) => value + rgb[channel]);
      neutralWeight++;
      const max = Math.max(...rgb), min = Math.min(...rgb);
      const saturation = max ? (max - min) / max : 0;
      if (saturation < .12 || max < 30) continue;
      const bucket = buckets[Math.floor(hueFor(rgb) * buckets.length) % buckets.length];
      const weight = saturation * (.45 + .55 * max / 255);
      bucket.weight += weight;
      bucket.r += rgb[0] * weight; bucket.g += rgb[1] * weight; bucket.b += rgb[2] * weight;
    }
    const ranked = buckets.filter((bucket) => bucket.weight > 0).sort((a, b) => b.weight - a.weight);
    if (!ranked.length) {
      const average = neutralWeight ? neutral.map((value) => value / neutralWeight) : [95, 80, 106];
      const hue = hueFor(average);
      return { primary: colorAtHue(hue, .42, .48), secondary: colorAtHue(hue + .12, .68, .62), deep: '#130d17' };
    }
    const first = ranked[0];
    const primaryRgb = [first.r, first.g, first.b].map((value) => value / first.weight);
    const second = ranked.find((bucket) => bucket !== first && bucket.weight > first.weight * .16);
    const secondary = second
      ? toHex([second.r / second.weight, second.g / second.weight, second.b / second.weight])
      : colorAtHue(hueFor(primaryRgb) + .12, .78, .62);
    return { primary: toHex(primaryRgb), secondary, deep: toHex(primaryRgb.map((value) => value * .17)) };
  } catch {
    return DEFAULT_PALETTE;
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function cropImage(ctx, image, x, y, width, height, radius) {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.save();
  ctx.clip();
  const imageWidth = image?.naturalWidth || image?.width || 0;
  const imageHeight = image?.naturalHeight || image?.height || 0;
  if (imageWidth && imageHeight) {
    const scale = Math.max(width / imageWidth, height / imageHeight);
    const sw = width / scale;
    const sh = height / scale;
    ctx.drawImage(image, (imageWidth - sw) / 2, (imageHeight - sh) / 2, sw, sh, x, y, width, height);
  } else {
    const g = ctx.createLinearGradient(x, y, x + width, y + height);
    g.addColorStop(0, '#34313d'); g.addColorStop(.55, '#191820'); g.addColorStop(1, '#5d4f69');
    ctx.fillStyle = g; ctx.fillRect(x, y, width, height);
    ctx.fillStyle = '#c6b3ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `500 ${Math.min(width, height) * .2}px sans-serif`; ctx.fillText('♫', x + width / 2, y + height / 2);
  }
  ctx.restore();
}

function fitText(ctx, text, maxWidth, font, fallback = '') {
  const value = text || fallback;
  ctx.font = font;
  if (ctx.measureText(value).width <= maxWidth) return value;
  let trimmed = value;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) trimmed = trimmed.slice(0, -1);
  return `${trimmed}…`;
}

export class PlayerRenderer {
  constructor(canvas, getState) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.getState = getState;
    this.image = typeof Image === 'undefined' ? null : new Image();
    this.frame = 0;
    this.running = false;
    this.spectrum = null;
    this.palette = DEFAULT_PALETTE;
    this.modelBackground = null;
    this.modelBackgroundReady = null;
    this.foreground = null;
    this.coverVersion = 0;
    this.modelSceneKey = null;
    this.modelSceneCanvas = null;
    this.modelCoverCanvas = null;
    this.modelOverlayCanvas = null;
    this.modelTimeCanvas = null;
  }

  ensureModelBackground() {
    if (!this.modelBackgroundReady) this.modelBackgroundReady = loadModelBackground().then((image) => {
      this.modelBackground = image;
      this.modelSceneKey = null;
      this.draw();
      return image;
    }).catch((error) => {
      this.modelBackgroundError = error;
      return null;
    });
    return this.modelBackgroundReady;
  }

  setCover(url) {
    this.coverVersion++;
    this.modelSceneKey = null;
    if (url && typeof ImageBitmap !== 'undefined' && url instanceof ImageBitmap) {
      this.image = url;
      this.palette = extractCoverPalette(url);
      return;
    }
    this.image = typeof Image === 'undefined' ? null : new Image();
    this.palette = DEFAULT_PALETTE;
    if (url && this.image) {
      const image = this.image;
      image.onload = () => {
        if (this.image !== image) return;
        this.palette = extractCoverPalette(image);
        this.modelSceneKey = null;
        this.draw();
      };
      image.src = url;
    }
  }

  setForeground(url) {
    if (url && typeof ImageBitmap !== 'undefined' && url instanceof ImageBitmap) {
      this.foreground = url;
      this.draw();
      return;
    }
    this.foreground = null;
    if (url && typeof Image !== 'undefined') {
      const image = new Image();
      image.onload = () => { if (this.foreground === image) this.draw(); };
      image.onerror = () => { if (this.foreground === image) this.foreground = null; };
      this.foreground = image;
      image.src = url;
    }
    this.draw();
  }

  setSize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.modelSceneKey = null;
    this.draw();
  }

  setSpectrum(data) { this.spectrum = data; }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.draw();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  compositionLayout() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const vertical = W / H < .78;
    const landscape = W / H > 1.28;
    const cardW = W * (vertical ? .83 : .86);
    const cardH = H * (vertical ? .85 : landscape ? .78 : .85);
    const cardX = (W - cardW) / 2;
    const cardY = (H - cardH) / 2;
    return { W, H, vertical, landscape, cardW, cardH, cardX, cardY };
  }

  getProgressLayout() {
    const { W, H, landscape, vertical, cardW, cardH, cardX, cardY } = this.compositionLayout();
    let x, width, baseline, unit;
    if (landscape) {
      const pad = cardW * .065;
      const cover = Math.min(cardH * .69, cardW * .37);
      const coverX = cardX + pad;
      x = coverX + cover + pad * .65;
      const rightW = cardX + cardW - pad - x;
      width = rightW;
      baseline = cardY + cardH * .68;
      unit = H;
    } else {
      const pad = cardW * .075;
      x = cardX + pad;
      width = cardW - pad * 2;
      baseline = cardY + cardH * .69;
      unit = W;
    }
    const fontSize = unit * .018;
    return {
      x, width, y: baseline + unit * .022, height: Math.max(3, unit * .0055),
      elapsedX: x, elapsedY: baseline - fontSize * .12,
      remainingX: x + width, remainingY: baseline - fontSize * .12,
      fontSize, maskY: baseline - fontSize * 1.08, maskHeight: fontSize * 1.35,
      elapsedMaskWidth: fontSize * 3.5, remainingMaskWidth: fontSize * 4.1,
      cardColor: '#0b0b0c'
    };
  }

  getVisualizerLayout() {
    const { W, H, landscape, vertical, cardW, cardH, cardX, cardY } = this.compositionLayout();
    if (landscape) {
      const pad = cardW * .065;
      const cover = Math.min(cardH * .69, cardW * .37);
      const rightX = cardX + pad + cover + pad * .65;
      const rightW = cardX + cardW - pad - rightX;
      const metaY = cardY + cardH * .30;
      return { x: rightX, y: metaY + cardH * .25, width: rightW * .86, height: cardH * .12 };
    }
    const pad = cardW * .075;
    const cover = Math.min(cardW * .73, cardH * .46, (cardH - pad * 2) * .48);
    const coverX = cardX + (cardW - cover) / 2;
    const coverY = cardY + cardH * (vertical ? .08 : .075);
    return { x: coverX + cover * .04, y: coverY + cover + cardH * .043, width: cover * .92, height: cardH * .075 };
  }

  draw() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const s = this.getState();
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);

    if (s.template === 'spotify') {
      this.drawSpotify(s, W, H);
      this.drawSignature(W, H);
      return;
    }
    if (s.template === 'iphone-model') {
      this.drawIphoneModel(s, W, H);
      return;
    }

    const imageWidth = this.image?.naturalWidth || this.image?.width || 0;
    const imageHeight = this.image?.naturalHeight || this.image?.height || 0;
    if (s.background === 'blur' && imageWidth && imageHeight) {
      const scale = Math.max(W / imageWidth, H / imageHeight) * 1.2;
      const sw = W / scale, sh = H / scale;
      ctx.save(); ctx.filter = 'blur(32px) brightness(.48) saturate(.78)';
      ctx.drawImage(this.image, (imageWidth - sw) / 2, (imageHeight - sh) / 2, sw, sh, -25, -25, W + 50, H + 50); ctx.restore();
      const shade = ctx.createLinearGradient(0, 0, W * .1, H);
      shade.addColorStop(0, '#08080a66'); shade.addColorStop(.5, '#08080a22'); shade.addColorStop(1, '#08080a99');
      ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
    } else if (s.background === 'gradient') {
      const g = ctx.createLinearGradient(W * .08, H * .05, W * .92, H * .96);
      g.addColorStop(0, '#6676a1'); g.addColorStop(.45, '#37334e'); g.addColorStop(1, '#292b75');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W * .75, H * .22, 5, W * .75, H * .22, W * .8);
      glow.addColorStop(0, '#bdadff36'); glow.addColorStop(1, '#7661d000'); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = s.background === 'solid' ? (s.color || '#111116') : '#101015';
      ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W * .5, H * .1, 0, W * .5, H * .1, H * .9);
      glow.addColorStop(0, '#ffffff0b'); glow.addColorStop(1, '#ffffff00'); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    }

    const { vertical, landscape, cardW, cardH, cardX, cardY } = this.compositionLayout();
    const radius = Math.min(W, H) * .065;
    ctx.save();
    ctx.shadowColor = '#0009'; ctx.shadowBlur = Math.min(W, H) * .045; ctx.shadowOffsetY = Math.min(W, H) * .018;
    roundedRect(ctx, cardX, cardY, cardW, cardH, radius); ctx.fillStyle = '#0b0b0cf4'; ctx.fill();
    ctx.restore();
    roundedRect(ctx, cardX, cardY, cardW, cardH, radius); ctx.strokeStyle = '#ffffff0d'; ctx.lineWidth = Math.max(1, W * .0013); ctx.stroke();

    if (landscape) this.drawLandscape(s, cardX, cardY, cardW, cardH, W, H);
    else this.drawPortrait(s, cardX, cardY, cardW, cardH, W, H, vertical);
    this.drawSignature(W, H);
  }

  drawIphoneModel(s, W, H) {
    const ctx = this.ctx;
    if (!this.modelBackground) {
      this.ensureModelBackground();
      ctx.fillStyle = '#08090d';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    this.ensureIphoneModelLayers(s, W, H);
    ctx.drawImage(this.modelSceneCanvas, 0, 0);
    if (this.modelCoverCanvas) ctx.drawImage(this.modelCoverCanvas, 0, 0);
    if (this.modelOverlayCanvas) ctx.drawImage(this.modelOverlayCanvas, 0, 0);
    this.drawIphoneProgress(s, W, H);
    this.drawForegroundPhoto(s, W, H);
  }

  ensureIphoneModelLayers(s, W, H) {
    const key = [W, H, this.coverVersion, s.title, s.artist, s.playing, s.volume].join('|');
    if (key === this.modelSceneKey) return;
    this.modelSceneKey = key;

    const scene = makeCanvas(W, H);
    const sceneCtx = scene.getContext('2d');
    cropImage(sceneCtx, this.modelBackground, 0, 0, W, H, 0);

    const { width: faceW, height: faceH } = IPHONE_FACE_SIZE;
    const face = makeCanvas(faceW, faceH);
    const faceCtx = face.getContext('2d');
    faceCtx.save();
    faceCtx.shadowColor = 'rgba(0,0,0,.6)'; faceCtx.shadowBlur = 32; faceCtx.shadowOffsetX = 4; faceCtx.shadowOffsetY = 16;
    roundedRect(faceCtx, 0, 0, faceW, faceH, 42);
    faceCtx.fillStyle = 'rgba(5,7,10,.79)'; faceCtx.fill();
    faceCtx.restore();
    roundedRect(faceCtx, 0, 0, faceW, faceH, 42);
    faceCtx.strokeStyle = 'rgba(235,239,246,.21)'; faceCtx.lineWidth = 5; faceCtx.stroke();
    const sheen = faceCtx.createLinearGradient(0, 0, faceW, faceH);
    sheen.addColorStop(0, 'rgba(255,255,255,.12)'); sheen.addColorStop(.18, 'rgba(255,255,255,.015)'); sheen.addColorStop(1, 'rgba(0,0,0,.08)');
    roundedRect(faceCtx, 2, 2, faceW - 4, faceH - 4, 40); faceCtx.fillStyle = sheen; faceCtx.fill();
    drawPerspectiveImage(sceneCtx, face, IPHONE_FACE_QUAD.map(({ x, y }) => ({ x: x * W, y: y * H })), 18, 28);
    this.modelSceneCanvas = scene;

    const cover = makeCanvas(704, 850);
    const coverCtx = cover.getContext('2d');
    cropImage(coverCtx, this.image, 0, 0, cover.width, cover.height, 26);
    roundedRect(coverCtx, 1.5, 1.5, cover.width - 3, cover.height - 3, 26);
    coverCtx.strokeStyle = 'rgba(255,255,255,.17)'; coverCtx.lineWidth = 3; coverCtx.stroke();
    const coverLayer = makeCanvas(W, H);
    drawPerspectiveImage(coverLayer.getContext('2d'), cover, IPHONE_SCREEN_CORNERS.map(({ x, y }) => ({ x: x * W, y: y * H })), 14, 18);
    this.modelCoverCanvas = coverLayer;

    const overlay = makeCanvas(faceW, faceH);
    const overlayCtx = overlay.getContext('2d');
    const textX = 43, textW = 680;
    overlayCtx.textAlign = 'left'; overlayCtx.textBaseline = 'alphabetic';
    overlayCtx.fillStyle = 'rgba(255,255,255,.67)';
    overlayCtx.font = '500 27px sans-serif'; overlayCtx.fillText('iPhone', textX, 1008);
    overlayCtx.fillStyle = '#f8f7fa'; overlayCtx.font = '700 54px sans-serif';
    overlayCtx.fillText(fitText(overlayCtx, s.title, textW, overlayCtx.font, 'Judul lagu'), textX, 1070);
    overlayCtx.fillStyle = 'rgba(245,244,248,.78)'; overlayCtx.font = '400 45px sans-serif';
    overlayCtx.fillText(fitText(overlayCtx, s.artist, textW, overlayCtx.font, 'Nama artis'), textX, 1129);

    // Familiar playback symbols and volume rail are part of the player layer.
    const cy = 1430;
    const triangle = (points) => { overlayCtx.beginPath(); overlayCtx.moveTo(points[0][0], points[0][1]); for (const point of points.slice(1)) overlayCtx.lineTo(point[0], point[1]); overlayCtx.closePath(); overlayCtx.fill(); };
    overlayCtx.fillStyle = '#f7f6fa';
    triangle([[145, cy], [202, cy - 38], [202, cy + 38]]); triangle([[190, cy], [247, cy - 38], [247, cy + 38]]);
    if (s.playing) {
      overlayCtx.fillRect(365, cy - 44, 25, 88); overlayCtx.fillRect(410, cy - 44, 25, 88);
    } else triangle([[368, cy - 48], [368, cy + 48], [447, cy]]);
    triangle([[520, cy - 38], [520, cy + 38], [577, cy]]); triangle([[563, cy - 38], [563, cy + 38], [620, cy]]);
    overlayCtx.globalAlpha = .62; overlayCtx.fillRect(84, 1590, 637, 11); overlayCtx.globalAlpha = 1;
    overlayCtx.fillStyle = '#f6f5f9'; overlayCtx.beginPath(); overlayCtx.arc(84 + 637 * clamp(s.volume), 1595.5, 12, 0, TAU); overlayCtx.fill();
    overlayCtx.font = '500 28px sans-serif'; overlayCtx.fillStyle = 'rgba(255,255,255,.75)'; overlayCtx.fillText('◀', 42, 1605);
    overlayCtx.textAlign = 'right'; overlayCtx.fillText('))', 760, 1605);

    const overlayLayer = makeCanvas(W, H);
    drawPerspectiveImage(overlayLayer.getContext('2d'), overlay, IPHONE_FACE_QUAD.map(({ x, y }) => ({ x: x * W, y: y * H })), 18, 28);
    this.modelOverlayCanvas = overlayLayer;
  }

  drawIphoneProgress(s, W, H) {
    const ctx = this.ctx;
    const face = IPHONE_FACE_SIZE;
    const project = makeProjector(IPHONE_FACE_QUAD.map(({ x, y }) => ({ x: x * W, y: y * H })));
    const point = (x, y) => project(x / face.width, y / face.height);
    const left = 76, right = 724, y = 1247, height = 13;
    const fill = Math.max(0, Math.min(1, s.progress || 0));
    const bar = (end, color) => drawQuad(ctx, [point(left, y), point(end, y), point(end, y + height), point(left, y + height)], color);
    bar(right, 'rgba(225,224,228,.42)');
    if (fill > 0) bar(left + (right - left) * fill, '#f4f3f6');

    const time = makeCanvas(704, 54);
    const timeCtx = time.getContext('2d');
    timeCtx.font = '500 26px sans-serif'; timeCtx.fillStyle = 'rgba(255,255,255,.8)'; timeCtx.textBaseline = 'alphabetic';
    timeCtx.textAlign = 'left'; timeCtx.fillText(formatTime(s.current), 0, 40);
    timeCtx.textAlign = 'right'; timeCtx.fillText(`−${formatTime(Math.max(0, s.duration - s.current))}`, time.width, 40);
    const corners = [point(43, 1172), point(747, 1172), point(747, 1226), point(43, 1226)];
    drawPerspectiveImage(ctx, time, corners, 2, 1);
  }

  drawForegroundPhoto(s, W, H) {
    const image = this.foreground;
    const iw = image?.naturalWidth || image?.width || 0;
    const ih = image?.naturalHeight || image?.height || 0;
    if (!iw || !ih) return;
    const scale = Math.max(.35, Math.min(1.55, Number(s.foregroundScale) || 1));
    const maxHeight = H * .62 * scale, maxWidth = W * .49 * scale;
    const fit = Math.min(maxWidth / iw, maxHeight / ih);
    const width = iw * fit, height = ih * fit;
    const centerX = W * Math.max(.2, Math.min(.9, Number(s.foregroundX) || .58));
    const centerY = H * Math.max(.2, Math.min(.9, Number(s.foregroundY) || .62));
    const ctx = this.ctx;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.48)'; ctx.shadowBlur = Math.min(W, H) * .012; ctx.shadowOffsetY = Math.min(W, H) * .006;
    ctx.drawImage(image, centerX - width / 2, centerY - height / 2, width, height);
    ctx.restore();
  }

  drawPortrait(s, x, y, w, h, W, H, vertical) {
    const ctx = this.ctx;
    const pad = w * .075;
    const cover = Math.min(w * .73, h * .46, (h - pad * 2) * .48);
    const coverX = x + (w - cover) / 2;
    const coverY = y + h * (vertical ? .08 : .075);
    cropImage(ctx, this.image, coverX, coverY, cover, cover, Math.min(cover * .025, 13));
    const visualizer = Boolean(s.spectrumEnabled);
    if (visualizer && !s.hideWaveform) this.drawVisualizer(coverX + cover * .04, coverY + cover + h * .02, cover * .92, h * .065, s.progress, s.playing);

    const metaY = coverY + cover + (visualizer ? h * .095 : h * .075);
    const titleSize = W * (vertical ? .037 : .042);
    const artistSize = W * (vertical ? .027 : .03);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#8b8992'; ctx.font = `500 ${W * .018}px sans-serif`; ctx.fillText('NOW PLAYING', x + pad, metaY);
    ctx.fillStyle = '#f8f7fa'; ctx.font = `700 ${titleSize}px sans-serif`;
    const title = fitText(ctx, s.title, w - pad * 2, ctx.font, 'Judul lagu');
    ctx.fillText(title, x + pad, metaY + h * (visualizer ? .038 : .052));
    ctx.fillStyle = '#a6a3ad'; ctx.font = `400 ${artistSize}px sans-serif`;
    ctx.fillText(fitText(ctx, s.artist, w - pad * 2, ctx.font, 'Nama artis'), x + pad, metaY + h * (visualizer ? .075 : .091));

    const progY = y + h * .69;
    this.drawProgress(x + pad, progY, w - pad * 2, s.progress, s.current, s.duration, W);
    const controlsY = y + h * .80;
    this.drawControls(x + w * .5, controlsY, w * .17, s.playing, W);
    const volumeY = y + h * .91;
    this.drawVolume(x + pad, volumeY, w - pad * 2, s.volume, W);
  }

  drawLandscape(s, x, y, w, h, W, H) {
    const ctx = this.ctx;
    const pad = w * .065;
    const cover = Math.min(h * .69, w * .37);
    const coverX = x + pad;
    const coverY = y + (h - cover) / 2;
    cropImage(ctx, this.image, coverX, coverY, cover, cover, cover * .035);
    const rightX = coverX + cover + pad * .65;
    const rightW = x + w - pad - rightX;
    const metaY = y + h * .30;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#9b83df'; ctx.font = `600 ${H * .021}px sans-serif`; ctx.fillText('NOW PLAYING', rightX, metaY);
    ctx.fillStyle = '#f7f6fa'; ctx.font = `700 ${H * .06}px sans-serif`;
    ctx.fillText(fitText(ctx, s.title, rightW, ctx.font, 'Judul lagu'), rightX, metaY + h * .09);
    ctx.fillStyle = '#a6a3ad'; ctx.font = `400 ${H * .038}px sans-serif`;
    ctx.fillText(fitText(ctx, s.artist, rightW, ctx.font, 'Nama artis'), rightX, metaY + h * .16);
    if (s.spectrumEnabled && !s.hideWaveform) this.drawVisualizer(rightX, metaY + h * .25, rightW * .86, h * .12, s.progress, s.playing);
    const progY = y + h * .68;
    this.drawProgress(rightX, progY, rightW, s.progress, s.current, s.duration, H);
    this.drawControls(rightX + rightW * .5, y + h * .84, Math.min(w * .13, rightW * .25), s.playing, H);
    this.drawVolume(rightX, y + h * .94, rightW, s.volume, H);
  }

  drawSpotify(s, W, H) {
    const ctx = this.ctx;
    const palette = this.palette || DEFAULT_PALETTE;
    const portrait = H > W * 1.2;
    const landscape = W > H * 1.25;
    const intensity = clamp((s.backgroundIntensity ?? 68) / 100);
    const depth = clamp((s.carouselDepth ?? 58) / 100);
    const time = s.offline ? s.current : performance.now() / 1000;
    const glowAlpha = .12 + intensity * .28;

    if (s.background === 'solid') {
      ctx.fillStyle = s.color || '#111116';
      ctx.fillRect(0, 0, W, H);
    } else if (s.background === 'gradient') {
      const drift = Math.sin(time * .18) * W * .08;
      const gradient = ctx.createLinearGradient(W * .12 + drift, H * .08, W * .88 - drift, H * .94);
      gradient.addColorStop(0, palette.primary);
      gradient.addColorStop(.48, palette.deep);
      gradient.addColorStop(1, palette.secondary);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = palette.deep;
      ctx.fillRect(0, 0, W, H);
      const imageWidth = this.image?.naturalWidth || this.image?.width || 0;
      const imageHeight = this.image?.naturalHeight || this.image?.height || 0;
      if (imageWidth && imageHeight) {
        const scale = Math.max(W / imageWidth, H / imageHeight);
        const sw = W / scale, sh = H / scale;
        ctx.save();
        ctx.filter = `blur(${Math.round(Math.min(W, H) * .035)}px) saturate(1.35) brightness(.45)`;
        ctx.drawImage(this.image, (imageWidth - sw) / 2, (imageHeight - sh) / 2, sw, sh, -24, -24, W + 48, H + 48);
        ctx.restore();
      }
      ctx.fillStyle = toRgba(palette.deep, .52 - intensity * .2);
      ctx.fillRect(0, 0, W, H);
    }

    const glowX = W * (.22 + .56 * ((Math.sin(time * .16) + 1) / 2));
    const glowY = H * (.2 + .08 * Math.sin(time * .12 + .8));
    const radius = Math.max(W, H) * .64;
    const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, radius);
    glow.addColorStop(0, toRgba(palette.primary, glowAlpha));
    glow.addColorStop(.5, toRgba(palette.secondary, glowAlpha * .34));
    glow.addColorStop(1, toRgba(palette.deep, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(5,4,9,.1)');
    shade.addColorStop(.72, 'rgba(5,4,9,.04)');
    shade.addColorStop(1, 'rgba(5,4,9,.42)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);

    this.drawBrandMark(W, H, palette);

    const cardWidth = Math.min(W * (portrait ? .52 : landscape ? .42 : .56), H * (portrait ? .29 : .42));
    const cardHeight = cardWidth * 1.30;
    const centerY = H * (portrait ? .49 : landscape ? .44 : .46);
    const nearOffset = cardWidth * (.58 + depth * .26);
    const farOffset = nearOffset * 1.43;
    const drift = Math.sin(time * .62) * cardWidth * .012;
    const bob = Math.sin(time * .72) * cardWidth * .006;
    const cards = [
      { x: W / 2 - farOffset + drift * 1.3, y: centerY + cardHeight * .035, scale: .72, rotate: -.16, tint: palette.secondary, selected: false, mirror: true },
      { x: W / 2 + farOffset - drift * 1.3, y: centerY + cardHeight * .025, scale: .72, rotate: .16, tint: palette.primary, selected: false, mirror: false },
      { x: W / 2 - nearOffset - drift, y: centerY + cardHeight * .012, scale: .91, rotate: -.075, tint: palette.primary, selected: false, mirror: false },
      { x: W / 2 + nearOffset + drift, y: centerY + cardHeight * .008, scale: .91, rotate: .075, tint: palette.secondary, selected: false, mirror: true }
    ];
    for (const card of cards) this.drawSpotifyCard(s, card, cardWidth, cardHeight, palette, time);
    this.drawSpotifyCard(s, { x: W / 2, y: centerY + bob, scale: 1 + Math.sin(time * 1.15) * .006, rotate: 0, selected: true, mirror: false }, cardWidth, cardHeight, palette, time);
    this.drawSpotifyPlayerBar(s, W, H, palette, portrait, landscape, time);
  }

  drawBrandMark(W, H, palette) {
    const ctx = this.ctx;
    const centerX = W / 2;
    const centerY = H * (H > W * 1.2 ? .115 : .105);
    const unit = Math.min(W, H);
    ctx.save();
    ctx.fillStyle = toRgba(palette.primary, .92);
    for (let index = 0; index < 4; index++) {
      const barHeight = unit * (.009 + ((index + 1) % 3) * .004);
      roundedRect(ctx, centerX - unit * .072 + index * unit * .009, centerY - barHeight / 2, unit * .004, barHeight, unit * .002);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.font = `600 ${unit * .018}px sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('SONICFRAME', centerX - unit * .027, centerY);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.font = `500 ${unit * .009}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('YOUR SOUND · YOUR SCENE', centerX, centerY + unit * .028);
    ctx.restore();
  }

  drawSpotifyCard(s, card, cardWidth, cardHeight, palette, time) {
    const ctx = this.ctx;
    const size = cardWidth * card.scale;
    const left = -cardWidth / 2;
    const top = -cardHeight / 2;
    const radius = cardWidth * .065;
    ctx.save();
    ctx.translate(card.x, card.y);
    ctx.rotate(card.rotate);
    ctx.scale(card.scale, card.scale);
    ctx.shadowColor = card.selected ? 'rgba(0,0,0,.52)' : 'rgba(0,0,0,.32)';
    ctx.shadowBlur = card.selected ? size * .095 : size * .07;
    ctx.shadowOffsetY = size * .035;
    roundedRect(ctx, left, top, cardWidth, cardHeight, radius);
    ctx.fillStyle = card.selected ? 'rgba(35,29,40,.9)' : 'rgba(44,35,47,.82)';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = card.selected ? 'rgba(255,255,255,.64)' : 'rgba(255,255,255,.32)';
    ctx.lineWidth = Math.max(1, size * .006);
    roundedRect(ctx, left, top, cardWidth, cardHeight, radius);
    ctx.stroke();

    const padding = cardWidth * .045;
    const coverSize = cardWidth - padding * 2;
    const coverX = left + padding;
    const coverY = top + padding;
    if (card.mirror) {
      ctx.save();
      ctx.translate(coverX * 2 + coverSize, 0);
      ctx.scale(-1, 1);
      cropImage(ctx, this.image, coverX, coverY, coverSize, coverSize, radius * .65);
      ctx.restore();
    } else cropImage(ctx, this.image, coverX, coverY, coverSize, coverSize, radius * .65);
    if (!card.selected) {
      roundedRect(ctx, coverX, coverY, coverSize, coverSize, radius * .65);
      ctx.fillStyle = toRgba(card.tint, .14);
      ctx.fill();
    }

    if (card.selected) {
      const titleSize = cardWidth * .047;
      const artistSize = cardWidth * .032;
      const textX = left + padding * 1.15;
      const titleY = coverY + coverSize + cardWidth * .105;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(255,255,255,.96)';
      ctx.font = `700 ${titleSize}px sans-serif`;
      ctx.fillText(fitText(ctx, s.title, cardWidth - padding * 2.3, ctx.font, 'Judul lagu'), textX, titleY);
      ctx.fillStyle = 'rgba(255,255,255,.68)';
      ctx.font = `400 ${artistSize}px sans-serif`;
      ctx.fillText(fitText(ctx, s.artist, cardWidth - padding * 2.3, ctx.font, 'Nama artis'), textX, titleY + cardWidth * .064);
      ctx.fillStyle = toRgba(palette.primary, .96);
      ctx.font = `700 ${cardWidth * .016}px sans-serif`;
      ctx.fillText('NOW PLAYING', textX, top + cardHeight - cardWidth * .032);
    } else {
      const lineY = coverY + coverSize + cardWidth * .1;
      ctx.fillStyle = 'rgba(255,255,255,.48)';
      roundedRect(ctx, left + padding, lineY, cardWidth * .38, cardWidth * .014, cardWidth * .007); ctx.fill();
      roundedRect(ctx, left + padding, lineY + cardWidth * .035, cardWidth * .24, cardWidth * .01, cardWidth * .005); ctx.fill();
    }
    ctx.restore();
  }

  drawTransportIcon(cx, cy, size, direction) {
    const ctx = this.ctx;
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.82)';
    const sign = direction < 0 ? -1 : 1;
    ctx.translate(cx, cy); ctx.scale(sign, 1);
    ctx.beginPath(); ctx.moveTo(-size * .43, -size * .34); ctx.lineTo(0, 0); ctx.lineTo(-size * .43, size * .34); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-size * .02, -size * .34); ctx.lineTo(size * .41, 0); ctx.lineTo(-size * .02, size * .34); ctx.closePath(); ctx.fill();
    ctx.fillRect(size * .47, -size * .34, size * .075, size * .68);
    ctx.restore();
  }

  drawSpotifyPlayerBar(s, W, H, palette, portrait, landscape, time) {
    const ctx = this.ctx;
    const barWidth = W * (portrait ? .9 : landscape ? .84 : .9);
    const barHeight = Math.max(H * (portrait ? .084 : .12), Math.min(152, H * .14));
    const barX = (W - barWidth) / 2;
    const barY = H * (portrait ? .755 : landscape ? .79 : .785);
    const radius = barHeight / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.38)'; ctx.shadowBlur = barHeight * .28; ctx.shadowOffsetY = barHeight * .08;
    roundedRect(ctx, barX, barY, barWidth, barHeight, radius);
    ctx.fillStyle = 'rgba(232,225,241,.18)'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,.26)'; ctx.lineWidth = Math.max(1, H * .0012);
    roundedRect(ctx, barX, barY, barWidth, barHeight, radius); ctx.stroke();

    const midY = barY + barHeight * .48;
    const unit = Math.min(W, H);
    this.drawTransportIcon(barX + barWidth * .09, midY, barHeight * .23, -1);
    this.drawPlayPause(barX + barWidth * .17, midY, barHeight * .25, s.playing);
    this.drawTransportIcon(barX + barWidth * .25, midY, barHeight * .23, 1);

    const playerX = barX + barWidth * .31;
    const playerWidth = barWidth * .42;
    const playerY = barY + barHeight * .12;
    const playerHeight = barHeight * .76;
    roundedRect(ctx, playerX, playerY, playerWidth, playerHeight, playerHeight * .17);
    ctx.fillStyle = 'rgba(13,10,16,.76)'; ctx.fill();
    const thumbSize = playerHeight * .72;
    const thumbX = playerX + playerHeight * .12;
    const thumbY = playerY + (playerHeight - thumbSize) / 2;
    cropImage(ctx, this.image, thumbX, thumbY, thumbSize, thumbSize, thumbSize * .12);
    const textX = thumbX + thumbSize + playerHeight * .12;
    const textW = playerX + playerWidth - textX - playerHeight * .12;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.font = `650 ${playerHeight * .17}px sans-serif`;
    ctx.fillText(fitText(ctx, s.title, textW, ctx.font, 'Judul lagu'), textX, playerY + playerHeight * .43);
    ctx.fillStyle = 'rgba(255,255,255,.64)'; ctx.font = `400 ${playerHeight * .135}px sans-serif`;
    ctx.fillText(fitText(ctx, s.artist, textW, ctx.font, 'Nama artis'), textX, playerY + playerHeight * .64);
    const progressX = textX;
    const progressY = playerY + playerHeight * .79;
    const progressW = Math.max(1, playerX + playerWidth - playerHeight * .12 - progressX);
    roundedRect(ctx, progressX, progressY, progressW, Math.max(2, playerHeight * .025), playerHeight * .02);
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill();
    if (s.progress > 0) {
      roundedRect(ctx, progressX, progressY, progressW * clamp(s.progress), Math.max(2, playerHeight * .025), playerHeight * .02);
      ctx.fillStyle = toRgba(palette.primary, .98); ctx.fill();
    }

    if (s.spectrumEnabled) this.drawMiniSpectrum(s, barX + barWidth * .765, barY + barHeight * .24, barWidth * .085, barHeight * .5, time, palette);
    else this.drawAirplayGlyph(barX + barWidth * .81, midY, barHeight * .21);
    this.drawVolume(barX + barWidth * .88, midY, barWidth * .075, s.volume, H * .56);
    ctx.restore();
  }

  drawPlayPause(cx, cy, size, playing) {
    const ctx = this.ctx;
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.94)';
    if (playing) {
      roundedRect(ctx, cx - size * .42, cy - size * .5, size * .28, size, size * .08); ctx.fill();
      roundedRect(ctx, cx + size * .14, cy - size * .5, size * .28, size, size * .08); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(cx - size * .36, cy - size * .55); ctx.lineTo(cx + size * .56, cy); ctx.lineTo(cx - size * .36, cy + size * .55); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  drawAirplayGlyph(cx, cy, size) {
    const ctx = this.ctx;
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = Math.max(1, size * .075);
    ctx.beginPath(); ctx.arc(cx, cy - size * .03, size * .35, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy - size * .03, size * .56, Math.PI * 1.17, Math.PI * 1.83); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.beginPath(); ctx.moveTo(cx, cy + size * .1); ctx.lineTo(cx - size * .24, cy + size * .42); ctx.lineTo(cx + size * .24, cy + size * .42); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  drawMiniSpectrum(s, x, y, width, height, time, palette) {
    const ctx = this.ctx;
    const values = s.renderSpectrum || this.spectrum;
    const count = 11;
    const gap = width * .085;
    const barWidth = (width - gap * (count - 1)) / count;
    for (let index = 0; index < count; index++) {
      const audio = values?.length ? values[Math.floor(index * values.length / count)] / 255 : .22;
      const motion = .18 + .32 * Math.abs(Math.sin(index * .75 + time * 2.1)) + .22 * Math.abs(Math.sin(index * .31 + time * .75));
      const barHeight = height * clamp(.18 + audio * .55 + motion * .42, .12, .94);
      const gradient = ctx.createLinearGradient(0, y + height, 0, y);
      gradient.addColorStop(0, palette.primary); gradient.addColorStop(1, palette.secondary);
      roundedRect(ctx, x + index * (barWidth + gap), y + (height - barHeight) / 2, barWidth, barHeight, barWidth / 2);
      ctx.fillStyle = gradient; ctx.fill();
    }
  }

  drawProgress(x, y, width, progress, current, duration, unit) {
    const ctx = this.ctx;
    const barY = y + unit * .022;
    const barH = Math.max(3, unit * .0055);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillStyle = '#a5a3ae'; ctx.font = `400 ${unit * .018}px sans-serif`;
    ctx.fillText(formatTime(current), x, y);
    ctx.textAlign = 'right'; ctx.fillText(`−${formatTime(Math.max(0, duration - current))}`, x + width, y);
    roundedRect(ctx, x, barY, width, barH, barH / 2); ctx.fillStyle = '#4a4950'; ctx.fill();
    if (progress > 0) { roundedRect(ctx, x, barY, Math.max(barH, width * progress), barH, barH / 2); ctx.fillStyle = '#dedde3'; ctx.fill(); }
    ctx.beginPath(); ctx.arc(x + Math.max(0, Math.min(1, progress)) * width, barY + barH / 2, unit * .006, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
  }

  drawControls(cx, cy, gap, playing, unit) {
    const ctx = this.ctx;
    const big = unit * .044;
    const side = unit * .023;
    ctx.fillStyle = '#f4f3f6'; ctx.strokeStyle = '#f4f3f6'; ctx.lineWidth = unit * .004; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Previous track
    ctx.beginPath(); ctx.moveTo(cx - gap * 1.7, cy); ctx.lineTo(cx - gap * 1.1, cy - side); ctx.lineTo(cx - gap * 1.1, cy + side); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - gap * 1.1, cy); ctx.lineTo(cx - gap * .5, cy - side); ctx.lineTo(cx - gap * .5, cy + side); ctx.closePath(); ctx.fill();
    // Play / pause
    if (playing) {
      roundedRect(ctx, cx - big * .42, cy - big * .72, big * .32, big * 1.44, big * .12); ctx.fill();
      roundedRect(ctx, cx + big * .1, cy - big * .72, big * .32, big * 1.44, big * .12); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(cx - big * .35, cy - big * .66); ctx.lineTo(cx + big * .65, cy); ctx.lineTo(cx - big * .35, cy + big * .66); ctx.closePath(); ctx.fill();
    }
    // Next track
    ctx.beginPath(); ctx.moveTo(cx + gap * .5, cy - side); ctx.lineTo(cx + gap * 1.1, cy); ctx.lineTo(cx + gap * .5, cy + side); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + gap * 1.1, cy - side); ctx.lineTo(cx + gap * 1.7, cy); ctx.lineTo(cx + gap * 1.1, cy + side); ctx.closePath(); ctx.fill();
  }

  drawVolume(x, y, width, volume, unit) {
    const ctx = this.ctx;
    const icon = unit * .015;
    const trackH = Math.max(3, unit * .005);
    ctx.fillStyle = '#77747f';
    ctx.beginPath(); ctx.moveTo(x, y - icon * .35); ctx.lineTo(x + icon * .48, y - icon * .35); ctx.lineTo(x + icon * .95, y - icon); ctx.lineTo(x + icon * .95, y + icon); ctx.lineTo(x + icon * .48, y + icon * .35); ctx.lineTo(x, y + icon * .35); ctx.closePath(); ctx.fill();
    roundedRect(ctx, x + icon * 1.6, y - icon * .75, width - icon * 3.8, trackH, trackH / 2); ctx.fillStyle = '#4a4950'; ctx.fill();
    roundedRect(ctx, x + icon * 1.6, y - icon * .75, (width - icon * 3.8) * volume, trackH, trackH / 2); ctx.fillStyle = '#b4b1bb'; ctx.fill();
    ctx.strokeStyle = '#77747f'; ctx.lineWidth = Math.max(1, unit * .0022);
    for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(x + width - icon * 1.3, y, icon * (.58 + i * .38), -Math.PI * .42, Math.PI * .42); ctx.stroke(); }
  }

  drawVisualizer(x, y, width, height, progress, playing) {
    const ctx = this.ctx;
    const state = this.getState();
    const count = 44;
    const gap = width * .006;
    const barW = (width - gap * (count - 1)) / count;
    const now = performance.now() / 1000;
    for (let i = 0; i < count; i++) {
      const spectrum = state.renderSpectrum || this.spectrum;
      const dataValue = spectrum?.length ? spectrum[Math.floor(i * spectrum.length / count)] / 255 : .16;
      const animationTime = state.offline ? state.current : now;
      const wave = .15 + .3 * Math.abs(Math.sin(i * .44 + progress * 8)) + .25 * Math.abs(Math.sin(i * .18 + animationTime * (playing ? 2 : .18)));
      const h = Math.max(height * .1, height * Math.min(.92, dataValue * .52 + wave * .56));
      const gradient = ctx.createLinearGradient(0, y + height, 0, y + height - h);
      gradient.addColorStop(0, '#6746cb'); gradient.addColorStop(1, '#bc9cff');
      roundedRect(ctx, x + i * (barW + gap), y + height / 2 - h / 2, barW, h, barW / 2);
      ctx.fillStyle = gradient; ctx.globalAlpha = playing ? .92 : .65; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawSignature(W, H) {
    const ctx = this.ctx;
    ctx.fillStyle = '#ffffff48'; ctx.font = `500 ${Math.min(W, H) * .012}px sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('SONICFRAME', W * .96, H * .973);
  }
}
