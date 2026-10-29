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

export const PHONE_AESTHETIC_DEFAULTS = {
  tl: { x: 0.4905, y: 0.4517 },
  tr: { x: 0.6927, y: 0.4746 },
  br: { x: 0.6137, y: 0.7300 },
  bl: { x: 0.4002, y: 0.7061 }
};

export async function loadModelBackground() {
  const response = await fetch(new URL('./assets/iphone-model-background.png', import.meta.url));
  if (!response.ok) throw new Error('Latar template iPhone tidak dapat dimuat dari aset lokal.');
  return createImageBitmap(await response.blob());
}

export async function loadPhoneAestheticBackground() {
  const response = await fetch(new URL('./assets/phone-aesthetic-clean.jpg', import.meta.url));
  if (!response.ok) throw new Error('Latar template Phone Music Aesthetic tidak dapat dimuat dari aset lokal.');
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

function tracePerspectiveRoundedRect(ctx, project, ru = 0.082, rv = 0.038) {
  ctx.beginPath();
  const steps = 8;
  ctx.moveTo(project(ru, 0).x, project(ru, 0).y);
  ctx.lineTo(project(1 - ru, 0).x, project(1 - ru, 0).y);
  for (let i = 1; i <= steps; i++) {
    const angle = -Math.PI / 2 + (Math.PI / 2) * (i / steps);
    const pt = project(1 - ru + ru * Math.cos(angle), rv + rv * Math.sin(angle));
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.lineTo(project(1, 1 - rv).x, project(1, 1 - rv).y);
  for (let i = 1; i <= steps; i++) {
    const angle = (Math.PI / 2) * (i / steps);
    const pt = project(1 - ru + ru * Math.cos(angle), 1 - rv + rv * Math.sin(angle));
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.lineTo(project(ru, 1).x, project(ru, 1).y);
  for (let i = 1; i <= steps; i++) {
    const angle = Math.PI / 2 + (Math.PI / 2) * (i / steps);
    const pt = project(ru + ru * Math.cos(angle), 1 - rv + rv * Math.sin(angle));
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.lineTo(project(0, rv).x, project(0, rv).y);
  for (let i = 1; i <= steps; i++) {
    const angle = Math.PI + (Math.PI / 2) * (i / steps);
    const pt = project(ru + ru * Math.cos(angle), rv + rv * Math.sin(angle));
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.closePath();
}

function drawPerspectiveImage(ctx, image, corners, columns = 12, rows = 22) {
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

function isImageDrawable(img) {
  if (!img) return false;
  const w = img.naturalWidth || img.width || 0;
  const h = img.naturalHeight || img.height || 0;
  if (!w || !h) return false;
  if ('complete' in img && !img.complete) return false;
  return true;
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

function drawMarqueeText(ctx, text, boxX, boxY, boxW, boxH, font, color, time, { speed = 45, enableMarquee = true, pauseTime = 1.8 } = {}) {
  const value = String(text || '');
  if (!value) return;
  ctx.save();
  ctx.font = font;
  const textW = ctx.measureText(value).width;
  ctx.beginPath();
  ctx.rect(boxX, boxY - 12, boxW, boxH + 24);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  if (textW <= boxW || !enableMarquee) {
    ctx.fillText(value, boxX, boxY + boxH / 2);
    ctx.restore();
    return;
  }

  const overflow = textW - boxW;
  const scrollDuration = overflow / speed;
  const cycle = scrollDuration + pauseTime * 2;
  const t = Math.max(0, time) % cycle;

  let offset = 0;
  if (t < pauseTime) {
    offset = 0;
  } else if (t < pauseTime + scrollDuration) {
    offset = (t - pauseTime) * speed;
  } else {
    offset = overflow;
  }

  ctx.fillText(value, boxX - offset, boxY + boxH / 2);
  ctx.restore();
}

function getPointOnRoundedRect(x, y, w, h, r, d) {
  const radius = Math.min(r, w / 2, h / 2);
  const L1 = w - 2 * radius;
  const A1 = Math.PI * radius / 2;
  const L2 = h - 2 * radius;
  const A2 = A1;
  const L3 = L1;
  const A3 = A1;
  const L4 = L2;
  const A4 = A1;
  const P = 2 * (L1 + L2) + 4 * A1;
  let dist = ((d % P) + P) % P;

  if (dist < L1) return { x: x + radius + dist, y };
  dist -= L1;
  if (dist < A1) {
    const th = -Math.PI / 2 + (dist / A1) * (Math.PI / 2);
    return { x: x + w - radius + radius * Math.cos(th), y: y + radius + radius * Math.sin(th) };
  }
  dist -= A1;
  if (dist < L2) return { x: x + w, y: y + radius + dist };
  dist -= L2;
  if (dist < A2) {
    const th = (dist / A2) * (Math.PI / 2);
    return { x: x + w - radius + radius * Math.cos(th), y: y + h - radius + radius * Math.sin(th) };
  }
  dist -= A2;
  if (dist < L3) return { x: x + w - radius - dist, y: y + h };
  dist -= L3;
  if (dist < A3) {
    const th = Math.PI / 2 + (dist / A3) * (Math.PI / 2);
    return { x: x + radius + radius * Math.cos(th), y: y + h - radius + radius * Math.sin(th) };
  }
  dist -= A3;
  if (dist < L4) return { x, y: y + h - radius - dist };
  dist -= L4;
  const th = Math.PI + (dist / A4) * (Math.PI / 2);
  return { x: x + radius + radius * Math.cos(th), y: y + radius + radius * Math.sin(th) };
}

function drawAnimatedBorderLight(ctx, x, y, w, h, r, s, animTime) {
  if (s.borderLightEnabled === false) return;

  const hexColor = s.borderLightColor || '#ffffff';
  const thickness = Math.max(0.5, Number(s.borderLightThickness) || 1.5);
  const duration = Math.max(1, Number(s.borderLightDuration) || 6);
  const glow = clamp(Number(s.borderLightGlow ?? 60) / 100, 0, 1);
  const trailRatio = clamp(Number(s.borderLightTrail ?? 15) / 100, 0.04, 0.40);
  const clockwise = s.borderLightDirection !== 'ccw';

  const radius = Math.min(r, w / 2, h / 2);
  const P = 2 * (w + h) - (4 - Math.PI) * 2 * radius;
  if (P <= 0) return;

  let progress = (animTime / duration) % 1;
  if (progress < 0) progress += 1;
  if (!clockwise) progress = 1 - progress;

  const headDist = progress * P;
  const trailLen = P * trailRatio;

  const N = 20;
  const sliceLen = (trailLen / N) * 1.08;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < N; i++) {
    const f = (i + 1) / N; // 0..1 (0 = tail, 1 = head)
    const sliceDist = headDist - trailLen + i * (trailLen / N);
    const alpha = Math.pow(f, 2.4) * 0.95;
    const lw = thickness * (0.75 + 0.5 * f);

    ctx.lineWidth = lw;
    ctx.strokeStyle = toRgba(hexColor, alpha);
    ctx.setLineDash([sliceLen, P - sliceLen]);
    ctx.lineDashOffset = -sliceDist;

    if (i >= N - 5 && glow > 0.02) {
      ctx.shadowColor = toRgba(hexColor, 0.85 * glow);
      ctx.shadowBlur = Math.max(3, thickness * 5 * glow * f);
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    roundedRect(ctx, x, y, w, h, radius);
    ctx.stroke();
  }

  // Draw bright glowing head spark
  const headPoint = getPointOnRoundedRect(x, y, w, h, radius, headDist);
  const spotRadius = Math.max(1.8, thickness * 2.2);
  const spotGrad = ctx.createRadialGradient(
    headPoint.x, headPoint.y, 0,
    headPoint.x, headPoint.y, spotRadius * (1 + 2.2 * glow)
  );
  spotGrad.addColorStop(0, toRgba(hexColor, 1));
  spotGrad.addColorStop(0.35, toRgba(hexColor, 0.85 * glow));
  spotGrad.addColorStop(1, toRgba(hexColor, 0));

  ctx.setLineDash([]);
  ctx.fillStyle = spotGrad;
  ctx.shadowColor = toRgba(hexColor, 0.9 * glow);
  ctx.shadowBlur = spotRadius * (2 + 4 * glow);
  ctx.beginPath();
  ctx.arc(headPoint.x, headPoint.y, spotRadius * (1 + 2.2 * glow), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
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
    this.minimalBaseKey = null;
    this.minimalBaseCanvas = null;
    this.spotifyBgKey = null;
    this.spotifyBgCanvas = null;
    this.customBackground = null;
    this.phoneAestheticBackground = null;
    this.phoneAestheticBackgroundReady = null;
    this.phoneCustomBackground = null;
    this.phoneCustomBgVersion = 0;
    this.phoneBgKey = null;
    this.phoneBgCanvas = null;
    this.phoneBgCoords = null;
    this.phoneScreenCanvas = null;
  }

  ensurePhoneAestheticBackground() {
    if (!this.phoneAestheticBackgroundReady) {
      this.phoneAestheticBackgroundReady = loadPhoneAestheticBackground().then((image) => {
        this.phoneAestheticBackground = image;
        this.phoneBgKey = null;
        this.draw();
        return image;
      }).catch((error) => {
        this.phoneAestheticBackgroundError = error;
        return null;
      });
    }
    return this.phoneAestheticBackgroundReady;
  }

  setPhoneCustomBackground(url) {
    this.phoneCustomBgVersion = (this.phoneCustomBgVersion || 0) + 1;
    this.phoneBgKey = null;
    if (url && typeof ImageBitmap !== 'undefined' && url instanceof ImageBitmap) {
      this.phoneCustomBackground = url;
      this.draw();
      return;
    }
    this.phoneCustomBackground = null;
    if (url && typeof Image !== 'undefined') {
      const image = new Image();
      image.onload = () => { if (this.phoneCustomBackground === image) { this.phoneBgKey = null; this.draw(); } };
      image.onerror = () => { if (this.phoneCustomBackground === image) { this.phoneCustomBackground = null; this.phoneBgKey = null; } };
      this.phoneCustomBackground = image;
      image.src = url;
    }
    this.draw();
  }

  ensurePhoneBgCanvas(s, W, H, bgImg, imgW, imgH, landscape, portrait, userScale, userOffsetX, userOffsetY, brightness, saturation, blurPx) {
    const isCustom = bgImg === this.phoneCustomBackground;
    const key = [
      W, H,
      isCustom ? 'custom' : 'default',
      isCustom ? (this.phoneCustomBgVersion || 0) : 0,
      landscape, portrait, userScale, userOffsetX, userOffsetY,
      brightness, saturation, blurPx
    ].join('|');

    if (key === this.phoneBgKey && this.phoneBgCanvas) {
      return this.phoneBgCanvas;
    }

    const canvas = makeCanvas(W, H);
    const bCtx = canvas.getContext('2d');

    let scale, bx, by, bw, bh;
    if (portrait) {
      scale = Math.max(W / imgW, H / imgH) * userScale;
      bw = imgW * scale;
      bh = imgH * scale;
      bx = (W - bw) / 2 + userOffsetX;
      by = (H - bh) / 2 + userOffsetY;
    } else if (landscape) {
      scale = (H / imgH) * 1.15 * userScale;
      bw = imgW * scale;
      bh = imgH * scale;
      bx = (W - bw) / 2 + userOffsetX;
      by = (H - bh) / 2 + userOffsetY;
    } else {
      scale = Math.max(W / imgW, H / imgH) * 1.12 * userScale;
      bw = imgW * scale;
      bh = imgH * scale;
      bx = (W - bw) / 2 + userOffsetX;
      by = H * 0.5 - 0.58 * bh + userOffsetY;
    }

    if (landscape) {
      bCtx.save();
      bCtx.filter = `blur(32px) brightness(${brightness * 0.72}%) saturate(${saturation}%)`;
      const fillScale = Math.max(W / imgW, H / imgH) * 1.05;
      const fbw = imgW * fillScale;
      const fbh = imgH * fillScale;
      bCtx.drawImage(bgImg, (W - fbw) / 2, (H - fbh) / 2, fbw, fbh);
      bCtx.restore();
    }

    bCtx.save();
    const filterParts = [];
    if (brightness !== 100) filterParts.push(`brightness(${brightness}%)`);
    if (saturation !== 100) filterParts.push(`saturate(${saturation}%)`);
    if (blurPx > 0) filterParts.push(`blur(${blurPx}px)`);
    if (filterParts.length > 0) bCtx.filter = filterParts.join(' ');
    bCtx.drawImage(bgImg, bx, by, bw, bh);
    bCtx.restore();

    this.phoneBgKey = key;
    this.phoneBgCanvas = canvas;
    this.phoneBgCoords = { bx, by, bw, bh };
    return canvas;
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
    this.minimalBaseKey = null;
    this.spotifyBgKey = null;
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

  setCustomBackground(url) {
    if (url && typeof ImageBitmap !== 'undefined' && url instanceof ImageBitmap) {
      this.customBackground = url;
      this.draw();
      return;
    }
    this.customBackground = null;
    if (url && typeof Image !== 'undefined') {
      const image = new Image();
      image.onload = () => { if (this.customBackground === image) this.draw(); };
      image.onerror = () => { if (this.customBackground === image) this.customBackground = null; };
      this.customBackground = image;
      image.src = url;
    }
    this.draw();
  }

  setSize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.modelSceneKey = null;
    this.minimalBaseKey = null;
    this.spotifyBgKey = null;
    this.draw();
  }

  setSpectrum(data) { this.spectrum = data; }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = (timestamp) => {
      if (!this.running) return;
      this.draw(timestamp ? timestamp / 1000 : 0);
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

  ensureMinimalBase(s, W, H) {
    const key = [W, H, this.coverVersion, s.title, s.artist, s.background, s.color, s.spectrumEnabled, s.volume, s.playing].join('|');
    if (key === this.minimalBaseKey && this.minimalBaseCanvas) return this.minimalBaseCanvas;

    const baseCanvas = makeCanvas(W, H);
    const baseCtx = baseCanvas.getContext('2d');

    const imageWidth = this.image?.naturalWidth || this.image?.width || 0;
    const imageHeight = this.image?.naturalHeight || this.image?.height || 0;
    if (s.background === 'blur' && imageWidth && imageHeight) {
      const scale = Math.max(W / imageWidth, H / imageHeight) * 1.2;
      const sw = W / scale, sh = H / scale;
      baseCtx.save(); baseCtx.filter = 'blur(32px) brightness(.48) saturate(.78)';
      baseCtx.drawImage(this.image, (imageWidth - sw) / 2, (imageHeight - sh) / 2, sw, sh, -25, -25, W + 50, H + 50); baseCtx.restore();
      const shade = baseCtx.createLinearGradient(0, 0, W * .1, H);
      shade.addColorStop(0, '#08080a66'); shade.addColorStop(.5, '#08080a22'); shade.addColorStop(1, '#08080a99');
      baseCtx.fillStyle = shade; baseCtx.fillRect(0, 0, W, H);
    } else if (s.background === 'gradient') {
      const g = baseCtx.createLinearGradient(W * .08, H * .05, W * .92, H * .96);
      g.addColorStop(0, '#6676a1'); g.addColorStop(.45, '#37334e'); g.addColorStop(1, '#292b75');
      baseCtx.fillStyle = g; baseCtx.fillRect(0, 0, W, H);
      const glow = baseCtx.createRadialGradient(W * .75, H * .22, 5, W * .75, H * .22, W * .8);
      glow.addColorStop(0, '#bdadff36'); glow.addColorStop(1, '#7661d000'); baseCtx.fillStyle = glow; baseCtx.fillRect(0, 0, W, H);
    } else {
      baseCtx.fillStyle = s.background === 'solid' ? (s.color || '#111116') : '#101015';
      baseCtx.fillRect(0, 0, W, H);
      const glow = baseCtx.createRadialGradient(W * .5, H * .1, 0, W * .5, H * .1, H * .9);
      glow.addColorStop(0, '#ffffff0b'); glow.addColorStop(1, '#ffffff00'); baseCtx.fillStyle = glow; baseCtx.fillRect(0, 0, W, H);
    }

    const { vertical, landscape, cardW, cardH, cardX, cardY } = this.compositionLayout();
    const radius = Math.min(W, H) * .065;
    baseCtx.save();
    baseCtx.shadowColor = '#0009'; baseCtx.shadowBlur = Math.min(W, H) * .045; baseCtx.shadowOffsetY = Math.min(W, H) * .018;
    roundedRect(baseCtx, cardX, cardY, cardW, cardH, radius); baseCtx.fillStyle = '#0b0b0cf4'; baseCtx.fill();
    baseCtx.restore();
    roundedRect(baseCtx, cardX, cardY, cardW, cardH, radius); baseCtx.strokeStyle = '#ffffff0d'; baseCtx.lineWidth = Math.max(1, W * .0013); baseCtx.stroke();

    if (landscape) {
      const pad = cardW * .065;
      const cover = Math.min(cardH * .69, cardW * .37);
      const coverX = cardX + pad;
      const coverY = cardY + (cardH - cover) / 2;
      cropImage(baseCtx, this.image, coverX, coverY, cover, cover, cover * .035);
      const rightX = coverX + cover + pad * .65;
      const rightW = cardX + cardW - pad - rightX;
      const metaY = cardY + cardH * .30;
      baseCtx.textAlign = 'left'; baseCtx.textBaseline = 'alphabetic';
      baseCtx.fillStyle = '#9b83df'; baseCtx.font = `600 ${H * .021}px sans-serif`; baseCtx.fillText('NOW PLAYING', rightX, metaY);
      baseCtx.fillStyle = '#f7f6fa'; baseCtx.font = `700 ${H * .06}px sans-serif`;
      baseCtx.fillText(fitText(baseCtx, s.title, rightW, baseCtx.font, 'Judul lagu'), rightX, metaY + cardH * .09);
      baseCtx.fillStyle = '#a6a3ad'; baseCtx.font = `400 ${H * .038}px sans-serif`;
      baseCtx.fillText(fitText(baseCtx, s.artist, rightW, baseCtx.font, 'Nama artis'), rightX, metaY + cardH * .16);
      this.drawControls(rightX + rightW * .5, cardY + cardH * .84, Math.min(cardW * .13, rightW * .25), s.playing, H, baseCtx);
      this.drawVolume(rightX, cardY + cardH * .94, rightW, s.volume, H, baseCtx);
    } else {
      const pad = cardW * .075;
      const cover = Math.min(cardW * .73, cardH * .46, (cardH - pad * 2) * .48);
      const coverX = cardX + (cardW - cover) / 2;
      const coverY = cardY + cardH * (vertical ? .08 : .075);
      cropImage(baseCtx, this.image, coverX, coverY, cover, cover, Math.min(cover * .025, 13));
      const visualizer = Boolean(s.spectrumEnabled);
      const metaY = coverY + cover + (visualizer ? cardH * .095 : cardH * .075);
      const titleSize = W * (vertical ? .037 : .042);
      const artistSize = W * (vertical ? .027 : .03);
      baseCtx.textAlign = 'left'; baseCtx.textBaseline = 'alphabetic';
      baseCtx.fillStyle = '#8b8992'; baseCtx.font = `500 ${W * .018}px sans-serif`; baseCtx.fillText('NOW PLAYING', cardX + pad, metaY);
      baseCtx.fillStyle = '#f8f7fa'; baseCtx.font = `700 ${titleSize}px sans-serif`;
      const title = fitText(baseCtx, s.title, cardW - pad * 2, baseCtx.font, 'Judul lagu');
      baseCtx.fillText(title, cardX + pad, metaY + cardH * (visualizer ? .038 : .052));
      baseCtx.fillStyle = '#a6a3ad'; baseCtx.font = `400 ${artistSize}px sans-serif`;
      baseCtx.fillText(fitText(baseCtx, s.artist, cardW - pad * 2, baseCtx.font, 'Nama artis'), cardX + pad, metaY + cardH * (visualizer ? .075 : .091));
      const controlsY = cardY + cardH * .80;
      this.drawControls(cardX + cardW * .5, controlsY, cardW * .17, s.playing, W, baseCtx);
      const volumeY = cardY + cardH * .91;
      this.drawVolume(cardX + pad, volumeY, cardW - pad * 2, s.volume, W, baseCtx);
    }

    this.minimalBaseKey = key;
    this.minimalBaseCanvas = baseCanvas;
    return baseCanvas;
  }

  ensureSpotifyBg(s, W, H, palette, intensity) {
    const key = [W, H, this.coverVersion, intensity, palette.deep].join('|');
    if (key === this.spotifyBgKey && this.spotifyBgCanvas) return this.spotifyBgCanvas;

    const bgCanvas = makeCanvas(W, H);
    const bgCtx = bgCanvas.getContext('2d');
    bgCtx.fillStyle = palette.deep;
    bgCtx.fillRect(0, 0, W, H);
    const imageWidth = this.image?.naturalWidth || this.image?.width || 0;
    const imageHeight = this.image?.naturalHeight || this.image?.height || 0;
    if (imageWidth && imageHeight) {
      const scale = Math.max(W / imageWidth, H / imageHeight);
      const sw = W / scale, sh = H / scale;
      bgCtx.save();
      bgCtx.filter = `blur(${Math.round(Math.min(W, H) * .035)}px) saturate(1.35) brightness(.45)`;
      bgCtx.drawImage(this.image, (imageWidth - sw) / 2, (imageHeight - sh) / 2, sw, sh, -24, -24, W + 48, H + 48);
      bgCtx.restore();
    }
    bgCtx.fillStyle = toRgba(palette.deep, .52 - intensity * .2);
    bgCtx.fillRect(0, 0, W, H);

    this.spotifyBgKey = key;
    this.spotifyBgCanvas = bgCanvas;
    return bgCanvas;
  }

  draw(time = 0) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const s = this.getState();
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);

    if (s.template === 'purple-glass') {
      this.drawPurpleGlass(s, W, H, time);
      return;
    }
    if (s.template === 'glass') {
      this.drawGlass(s, W, H, time);
      return;
    }
    if (s.template === 'phone-aesthetic') {
      this.drawPhoneAesthetic(s, W, H, time);
      return;
    }
    if (s.template === 'spotify') {
      this.drawSpotify(s, W, H);
      return;
    }
    if (s.template === 'iphone-model') {
      this.drawIphoneModel(s, W, H);
      return;
    }

    const base = this.ensureMinimalBase(s, W, H);
    ctx.drawImage(base, 0, 0);

    const { vertical, landscape, cardW, cardH, cardX, cardY } = this.compositionLayout();
    if (landscape) {
      const pad = cardW * .065;
      const cover = Math.min(cardH * .69, cardW * .37);
      const rightX = cardX + pad + cover + pad * .65;
      const rightW = cardX + cardW - pad - rightX;
      const metaY = cardY + cardH * .30;
      if (s.spectrumEnabled && !s.hideWaveform) this.drawVisualizer(rightX, metaY + cardH * .25, rightW * .86, cardH * .12, s.progress, s.playing);
      const progY = cardY + cardH * .68;
      this.drawProgress(rightX, progY, rightW, s.progress, s.current, s.duration, H);
    } else {
      const pad = cardW * .075;
      const cover = Math.min(cardW * .73, cardH * .46, (cardH - pad * 2) * .48);
      const coverX = cardX + (cardW - cover) / 2;
      const coverY = cardY + cardH * (vertical ? .08 : .075);
      const visualizer = Boolean(s.spectrumEnabled);
      if (visualizer && !s.hideWaveform) this.drawVisualizer(coverX + cover * .04, coverY + cover + cardH * .02, cover * .92, cardH * .065, s.progress, s.playing);
      const progY = cardY + cardH * .69;
      this.drawProgress(cardX + pad, progY, cardW - pad * 2, s.progress, s.current, s.duration, W);
    }
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
      const bg = this.ensureSpotifyBg(s, W, H, palette, intensity);
      ctx.drawImage(bg, 0, 0);
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

  drawBrandMark(W, H, palette) {}

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

  drawControls(cx, cy, gap, playing, unit, ctx = this.ctx) {
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

  drawVolume(x, y, width, volume, unit, ctx = this.ctx) {
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

  drawSignature(W, H) {}

  drawGlass(s, W, H, time = 0) {
    const ctx = this.ctx;
    const portrait = H > W * 1.2;
    const landscape = W > H * 1.25;
    const nowTime = time || (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
    const scrollTime = s.offline ? (s.current || 0) : nowTime;
    const blueGlow = clamp((s.blueGlow ?? 75) / 100, 0, 1);
    const glassOpacity = clamp((s.glassOpacity ?? 70) / 100, 0.1, 1);
    const glowPulse = 1 + Math.sin(nowTime * 0.8) * 0.05;

    // 1. Background
    if (isImageDrawable(this.customBackground)) {
      cropImage(ctx, this.customBackground, 0, 0, W, H, 0);
      const bgBlur = clamp((s.glassBlur ?? 60) / 100, 0, 1);
      ctx.fillStyle = `rgba(2, 10, 18, ${0.35 + bgBlur * 0.4})`;
      ctx.fillRect(0, 0, W, H);
    } else if (s.background === 'blur' && isImageDrawable(this.image)) {
      cropImage(ctx, this.image, 0, 0, W, H, 0);
      ctx.fillStyle = 'rgba(2, 12, 22, 0.72)';
      ctx.fillRect(0, 0, W, H);
    } else if (s.background === 'solid') {
      ctx.fillStyle = s.color || '#041824';
      ctx.fillRect(0, 0, W, H);
    } else {
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#041e2e');
      bgGrad.addColorStop(0.35, '#062940');
      bgGrad.addColorStop(0.70, '#031726');
      bgGrad.addColorStop(1, '#020910');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);
    }

    // Organic luminous blue glow spots
    if (blueGlow > 0.01) {
      const orb1X = W * 0.94 + Math.sin(nowTime * 0.5) * W * 0.03;
      const orb1Y = H * (portrait ? 0.36 : 0.32) + Math.cos(nowTime * 0.4) * H * 0.03;
      const orb1R = Math.min(W, H) * 0.70;
      const orb1 = ctx.createRadialGradient(orb1X, orb1Y, 0, orb1X, orb1Y, orb1R);
      orb1.addColorStop(0, `rgba(0, 185, 255, ${0.48 * blueGlow * glowPulse})`);
      orb1.addColorStop(0.32, `rgba(2, 132, 199, ${0.28 * blueGlow})`);
      orb1.addColorStop(0.68, `rgba(3, 75, 115, ${0.12 * blueGlow})`);
      orb1.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = orb1;
      ctx.fillRect(0, 0, W, H);

      const orb2X = W * 0.06 + Math.cos(nowTime * 0.6) * W * 0.02;
      const orb2Y = H * (portrait ? 0.66 : 0.72) + Math.sin(nowTime * 0.5) * H * 0.03;
      const orb2R = Math.min(W, H) * 0.62;
      const orb2 = ctx.createRadialGradient(orb2X, orb2Y, 0, orb2X, orb2Y, orb2R);
      orb2.addColorStop(0, `rgba(0, 210, 255, ${0.36 * blueGlow})`);
      orb2.addColorStop(0.45, `rgba(0, 119, 182, ${0.18 * blueGlow})`);
      orb2.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = orb2;
      ctx.fillRect(0, 0, W, H);

      const orb3X = W / 2;
      const orb3Y = H * (portrait ? 0.52 : 0.50);
      const orb3R = Math.min(W, H) * 0.52;
      const orb3 = ctx.createRadialGradient(orb3X, orb3Y, 0, orb3X, orb3Y, orb3R);
      orb3.addColorStop(0, `rgba(14, 165, 233, ${0.25 * blueGlow})`);
      orb3.addColorStop(0.65, `rgba(2, 132, 199, ${0.08 * blueGlow})`);
      orb3.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = orb3;
      ctx.fillRect(0, 0, W, H);
    }

    // 2. Top Navigation (Typography  Story  Music   •••)
    if (portrait || H >= W * 0.9) {
      const navY = H * 0.098;
      const navSpacing = Math.min(W * 0.15, 125);
      const navCenterX = W * 0.43;
      const navFontBase = Math.min(W, H) * 0.021;
      ctx.font = `500 ${navFontBase}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fillText('Typography', navCenterX - navSpacing, navY);
      ctx.fillText('Story', navCenterX, navY);
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 ${navFontBase}px sans-serif`;
      ctx.fillText('Music', navCenterX + navSpacing, navY);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.font = `700 ${navFontBase * 1.1}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText('•••', W * 0.89, navY);
    }

    // 3. Glass Music Player Card
    const cardW = Math.min(W * (portrait ? 0.86 : landscape ? 0.48 : 0.78), 820);
    const cardH = cardW * 0.50;
    const cardX = (W - cardW) / 2;
    const cardY = H * (portrait ? 0.52 : landscape ? 0.50 : 0.51) - cardH / 2;
    const cardR = cardW * 0.075;

    // Soft drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.52)';
    ctx.shadowBlur = cardW * 0.085;
    ctx.shadowOffsetY = cardW * 0.032;
    roundedRect(ctx, cardX, cardY, cardW, cardH, cardR);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
    ctx.fill();
    ctx.restore();

    // Frost base tint
    roundedRect(ctx, cardX, cardY, cardW, cardH, cardR);
    ctx.fillStyle = `rgba(10, 36, 54, ${0.58 * glassOpacity})`;
    ctx.fill();

    // Subtle glass sheen
    const glassGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
    glassGrad.addColorStop(0, `rgba(255, 255, 255, ${0.20 * glassOpacity})`);
    glassGrad.addColorStop(0.25, `rgba(255, 255, 255, ${0.08 * glassOpacity})`);
    glassGrad.addColorStop(0.75, `rgba(255, 255, 255, ${0.04 * glassOpacity})`);
    glassGrad.addColorStop(1, `rgba(255, 255, 255, ${0.14 * glassOpacity})`);
    ctx.fillStyle = glassGrad;
    roundedRect(ctx, cardX, cardY, cardW, cardH, cardR);
    ctx.fill();

    // Ultra-thin white glass border
    const borderGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
    borderGrad.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
    borderGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.14)');
    borderGrad.addColorStop(1, 'rgba(255, 255, 255, 0.28)');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = Math.max(1, cardW * 0.0022);
    roundedRect(ctx, cardX, cardY, cardW, cardH, cardR);
    ctx.stroke();

    // 4. Content Inside Card
    const pad = cardW * 0.068;

    // Artwork
    const artSize = cardH * 0.44;
    const artX = cardX + pad;
    const artY = cardY + pad;
    const artR = artSize * 0.18;

    if (isImageDrawable(this.image)) {
      cropImage(ctx, this.image, artX, artY, artSize, artSize, artR);
    } else {
      ctx.save();
      roundedRect(ctx, artX, artY, artSize, artSize, artR);
      ctx.clip();
      ctx.fillStyle = '#0f293a';
      ctx.fillRect(artX, artY, artSize, artSize);
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${artSize * 0.42}px sans-serif`;
      ctx.fillText('♫', artX + artSize / 2, artY + artSize / 2);
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    roundedRect(ctx, artX, artY, artSize, artSize, artR);
    ctx.stroke();

    // Verification Badge
    const showBadge = s.verifiedBadge !== false;
    const badgeR = artSize * 0.17;
    const badgeX = cardX + cardW - pad - badgeR;
    const badgeY = artY + artSize * 0.38;

    if (showBadge) {
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = '#0ea5e9';
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, badgeR * 0.26);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(badgeX - badgeR * 0.45, badgeY);
      ctx.lineTo(badgeX - badgeR * 0.10, badgeY + badgeR * 0.38);
      ctx.lineTo(badgeX + badgeR * 0.45, badgeY - badgeR * 0.32);
      ctx.stroke();
      ctx.restore();
    }

    // Title & Artist with smooth Marquee Scrolling
    const textX = artX + artSize + pad * 0.75;
    const maxTextW = (showBadge ? badgeX - badgeR * 1.6 : cardX + cardW - pad) - textX;
    const marqueeOpts = {
      speed: s.marqueeSpeed || 45,
      enableMarquee: s.marqueeEnabled !== false,
      pauseTime: 1.8
    };

    const titleH = artSize * 0.38;
    const titleY = artY + artSize * 0.08;
    drawMarqueeText(
      ctx,
      s.title || 'Judul lagu',
      textX,
      titleY,
      maxTextW,
      titleH,
      `700 ${artSize * 0.31}px sans-serif`,
      '#ffffff',
      scrollTime,
      marqueeOpts
    );

    const artistH = artSize * 0.32;
    const artistY = artY + artSize * 0.52;
    drawMarqueeText(
      ctx,
      s.artist || 'Nama artis',
      textX,
      artistY,
      maxTextW,
      artistH,
      `500 ${artSize * 0.24}px sans-serif`,
      'rgba(255, 255, 255, 0.65)',
      scrollTime,
      marqueeOpts
    );

    // 5. Progress Bar & Time
    const barY = artY + artSize + pad * 0.48;
    const timeFont = `500 ${cardW * 0.024}px sans-serif`;
    ctx.font = timeFont;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.textBaseline = 'middle';

    const timeStrLeft = formatTime(s.current || 0);
    ctx.textAlign = 'left';
    ctx.fillText(timeStrLeft, cardX + pad, barY);
    const leftTimeW = ctx.measureText(timeStrLeft).width;

    const timeStrRight = formatTime(s.duration || 0);
    ctx.textAlign = 'right';
    ctx.fillText(timeStrRight, cardX + cardW - pad, barY);
    const rightTimeW = ctx.measureText(timeStrRight).width;

    const trackGap = cardW * 0.022;
    const trackX = cardX + pad + leftTimeW + trackGap;
    const trackW = (cardX + cardW - pad - rightTimeW - trackGap) - trackX;
    const trackH = Math.max(3, cardW * 0.007);
    const trackY = barY - trackH / 2;

    roundedRect(ctx, trackX, trackY, trackW, trackH, trackH / 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fill();

    const prog = clamp(s.duration > 0 ? (s.current / s.duration) : (s.progress || 0), 0, 1);
    const fillW = Math.max(trackH, trackW * prog);
    const progGrad = ctx.createLinearGradient(trackX, 0, trackX + fillW, 0);
    progGrad.addColorStop(0, '#00b4d8');
    progGrad.addColorStop(1, '#38bdf8');
    roundedRect(ctx, trackX, trackY, fillW, trackH, trackH / 2);
    ctx.fillStyle = progGrad;
    ctx.fill();

    const thumbX = trackX + fillW;
    const thumbR = trackH * 1.5;
    ctx.save();
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = thumbR * 2.5;
    ctx.beginPath();
    ctx.arc(thumbX, barY, thumbR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    // 6. Controls (Volume, Prev, Play/Pause, Next, Note, + Creativestyle)
    const ctrlY = barY + cardH * 0.20;
    const btnR = cardW * 0.038;
    const spacing = btnR * 2.45;
    const startBtnX = cardX + pad + btnR;

    const buttons = ['volume', 'prev', 'play_pause', 'next', 'note'];
    for (let i = 0; i < buttons.length; i++) {
      const bx = startBtnX + i * spacing;
      this.drawGlassControlBtn(ctx, bx, ctrlY, btnR, buttons[i], s.playing);
    }

    const pillH = btnR * 2.05;
    const pillW = cardW * 0.25;
    const pillX = cardX + cardW - pad - pillW;
    const pillY = ctrlY - pillH / 2;

    roundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    const pillGrad = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0);
    pillGrad.addColorStop(0, '#0284c7');
    pillGrad.addColorStop(1, '#0ea5e9');
    ctx.fillStyle = pillGrad;
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${pillH * 0.38}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.glassTag || '+ Creativestyle', pillX + pillW / 2, ctrlY);

    // Animated Glass Border Light
    drawAnimatedBorderLight(ctx, cardX, cardY, cardW, cardH, cardR, s, scrollTime);
  }

  drawGlassControlBtn(ctx, x, y, r, type, playing) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.11)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const s = r * 0.44;
    if (type === 'volume') {
      ctx.beginPath();
      ctx.moveTo(x - s * 0.8, y - s * 0.4);
      ctx.lineTo(x - s * 0.35, y - s * 0.4);
      ctx.lineTo(x + s * 0.1, y - s * 0.85);
      ctx.lineTo(x + s * 0.1, y + s * 0.85);
      ctx.lineTo(x - s * 0.35, y + s * 0.4);
      ctx.lineTo(x - s * 0.8, y + s * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + s * 0.1, y, s * 0.65, -0.6, 0.6);
      ctx.lineWidth = Math.max(1.5, r * 0.12);
      ctx.stroke();
    } else if (type === 'prev') {
      ctx.fillRect(x - s * 0.7, y - s * 0.75, s * 0.28, s * 1.5);
      ctx.beginPath();
      ctx.moveTo(x + s * 0.7, y - s * 0.75);
      ctx.lineTo(x - s * 0.35, y);
      ctx.lineTo(x + s * 0.7, y + s * 0.75);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'play_pause') {
      if (playing) {
        const bw = s * 0.32;
        ctx.fillRect(x - s * 0.5, y - s * 0.75, bw, s * 1.5);
        ctx.fillRect(x + s * 0.18, y - s * 0.75, bw, s * 1.5);
      } else {
        ctx.beginPath();
        ctx.moveTo(x - s * 0.4, y - s * 0.8);
        ctx.lineTo(x + s * 0.7, y);
        ctx.lineTo(x - s * 0.4, y + s * 0.8);
        ctx.closePath();
        ctx.fill();
      }
    } else if (type === 'next') {
      ctx.beginPath();
      ctx.moveTo(x - s * 0.7, y - s * 0.75);
      ctx.lineTo(x + s * 0.35, y);
      ctx.lineTo(x - s * 0.7, y + s * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x + s * 0.42, y - s * 0.75, s * 0.28, s * 1.5);
    } else if (type === 'note') {
      ctx.beginPath();
      ctx.arc(x - s * 0.25, y + s * 0.45, s * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - s * 0.05, y - s * 0.7, s * 0.20, s * 1.15);
      ctx.beginPath();
      ctx.moveTo(x + s * 0.15, y - s * 0.7);
      ctx.quadraticCurveTo(x + s * 0.7, y - s * 0.4, x + s * 0.65, y + s * 0.1);
      ctx.lineWidth = Math.max(1.5, r * 0.14);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPurpleGlass(s, W, H, time = 0) {
    const ctx = this.ctx;
    const portrait = H > W * 1.2;
    const landscape = W > H * 1.25;
    const nowTime = time || (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
    const scrollTime = s.offline ? (s.current || 0) : nowTime;
    const purpleGlow = clamp((s.purpleGlow ?? 80) / 100, 0, 1);
    const glassOpacity = clamp((s.purpleGlassOpacity ?? 75) / 100, 0.1, 1);
    const glowPulse = 1 + Math.sin(nowTime * 0.75) * 0.05;

    // 1. Background
    if (isImageDrawable(this.customBackground)) {
      cropImage(ctx, this.customBackground, 0, 0, W, H, 0);
      ctx.fillStyle = 'rgba(25, 10, 40, 0.42)';
      ctx.fillRect(0, 0, W, H);
    } else if (s.background === 'blur' && isImageDrawable(this.image)) {
      cropImage(ctx, this.image, 0, 0, W, H, 0);
      ctx.fillStyle = 'rgba(32, 12, 50, 0.75)';
      ctx.fillRect(0, 0, W, H);
    } else if (s.background === 'solid') {
      ctx.fillStyle = s.color || '#24143d';
      ctx.fillRect(0, 0, W, H);
    } else {
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#211239');
      bgGrad.addColorStop(0.24, '#3b1958');
      bgGrad.addColorStop(0.46, '#5a226d');
      bgGrad.addColorStop(0.68, '#8e3266');
      bgGrad.addColorStop(0.85, '#bf4749');
      bgGrad.addColorStop(1, '#db6235');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);
    }

    // Warm Sunset & Violet Ambient Glow Orbs
    if (purpleGlow > 0.01) {
      const topOrb = ctx.createRadialGradient(W * 0.25, H * 0.18, 0, W * 0.25, H * 0.18, Math.min(W, H) * 0.65);
      topOrb.addColorStop(0, `rgba(168, 85, 247, ${0.28 * purpleGlow * glowPulse})`);
      topOrb.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = topOrb;
      ctx.fillRect(0, 0, W, H);

      const botOrb = ctx.createRadialGradient(W * 0.5, H * 0.95, 0, W * 0.5, H * 0.95, Math.min(W, H) * 0.70);
      botOrb.addColorStop(0, `rgba(249, 115, 22, ${0.40 * purpleGlow * glowPulse})`);
      botOrb.addColorStop(0.45, `rgba(225, 29, 72, ${0.22 * purpleGlow})`);
      botOrb.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = botOrb;
      ctx.fillRect(0, 0, W, H);
    }

    // 2. Main Liquid Glass Music Player Card (Centered)
    const cardW = Math.min(W * (portrait ? 0.88 : landscape ? 0.52 : 0.82), 860);
    const cardH = cardW * 0.46;
    const cardX = (W - cardW) / 2;
    const cardY = (H - cardH) / 2;
    const cardR = cardW * 0.075;

    // Drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = cardW * 0.085;
    ctx.shadowOffsetY = cardW * 0.035;
    roundedRect(ctx, cardX, cardY, cardW, cardH, cardR);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();
    ctx.restore();

    // Dark purple liquid tint base
    roundedRect(ctx, cardX, cardY, cardW, cardH, cardR);
    ctx.fillStyle = `rgba(50, 18, 76, ${0.45 * glassOpacity})`;
    ctx.fill();

    // Frosted liquid glass gradient sheen
    const glassGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
    glassGrad.addColorStop(0, `rgba(255, 255, 255, ${0.22 * glassOpacity})`);
    glassGrad.addColorStop(0.3, `rgba(255, 255, 255, ${0.06 * glassOpacity})`);
    glassGrad.addColorStop(0.8, `rgba(255, 255, 255, ${0.02 * glassOpacity})`);
    glassGrad.addColorStop(1, `rgba(255, 255, 255, ${0.14 * glassOpacity})`);
    ctx.fillStyle = glassGrad;
    roundedRect(ctx, cardX, cardY, cardW, cardH, cardR);
    ctx.fill();

    // Glowing purple border
    const borderGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
    borderGrad.addColorStop(0, 'rgba(232, 195, 255, 0.48)');
    borderGrad.addColorStop(0.5, 'rgba(192, 132, 252, 0.22)');
    borderGrad.addColorStop(1, 'rgba(216, 180, 254, 0.38)');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = Math.max(1.5, cardW * 0.0028);
    roundedRect(ctx, cardX, cardY, cardW, cardH, cardR);
    ctx.stroke();

    // Inside elements
    const mPad = cardW * 0.055;
    const artSize = cardH - mPad * 2;
    const artX = cardX + mPad;
    const artY = cardY + mPad;
    const artR = artSize * 0.16;

    // Album Artwork
    if (isImageDrawable(this.image)) {
      cropImage(ctx, this.image, artX, artY, artSize, artSize, artR);
    } else {
      ctx.save();
      roundedRect(ctx, artX, artY, artSize, artSize, artR);
      ctx.clip();
      ctx.fillStyle = '#34154c';
      ctx.fillRect(artX, artY, artSize, artSize);
      ctx.fillStyle = '#d8b4fe';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${artSize * 0.40}px sans-serif`;
      ctx.fillText('♫', artX + artSize / 2, artY + artSize / 2);
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1;
    roundedRect(ctx, artX, artY, artSize, artSize, artR);
    ctx.stroke();

    // Airplay / device badge on the right
    const rightX = artX + artSize + mPad * 0.85;
    const badgeW = artSize * 0.30;
    const badgeH = artSize * 0.42;
    const badgeX = cardX + cardW - mPad - badgeW;
    const badgeY = artY + artSize * 0.04;

    roundedRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeW * 0.45);
    ctx.fillStyle = 'rgba(147, 95, 212, 0.36)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    roundedRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeW * 0.45);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(badgeX + badgeW / 2, badgeY + badgeH * 0.38, badgeW * 0.10, 0, Math.PI * 2);
    ctx.arc(badgeX + badgeW / 2, badgeY + badgeH * 0.62, badgeW * 0.10, 0, Math.PI * 2);
    ctx.fill();

    const marqueeOpts = {
      speed: s.marqueeSpeed || 45,
      enableMarquee: s.marqueeEnabled !== false,
      pauseTime: 1.8
    };

    const textBoxW = badgeX - rightX - mPad * 0.35;

    // Refined smaller font sizes for Title & Artist
    const titleH = artSize * 0.20;
    const titleY = artY + artSize * 0.05;
    drawMarqueeText(
      ctx,
      s.title || 'Hold On',
      rightX,
      titleY,
      textBoxW,
      titleH,
      `700 ${artSize * 0.17}px sans-serif`,
      '#ffffff',
      scrollTime,
      marqueeOpts
    );

    const artistH = artSize * 0.16;
    const artistY = titleY + titleH + artSize * 0.03;
    drawMarqueeText(
      ctx,
      s.artist || 'Kygo & Emmit Fenn',
      rightX,
      artistY,
      textBoxW,
      artistH,
      `500 ${artSize * 0.13}px sans-serif`,
      'rgba(216, 180, 254, 0.85)',
      scrollTime,
      marqueeOpts
    );

    // Controls (Previous, Play/Pause, Next)
    const ctrlW = cardX + cardW - mPad - rightX;
    const ctrlCenterX = rightX + ctrlW * 0.45;
    const ctrlCenterY = artistY + artistH + artSize * 0.22;
    const ctrlSpacing = artSize * 0.36;

    this.drawPurpleControls(ctx, ctrlCenterX, ctrlCenterY, ctrlSpacing, artSize * 0.17, s.playing);

    // Progress bar
    const trackX = rightX;
    const trackW = cardX + cardW - mPad - rightX;
    const trackH = Math.max(3.5, cardW * 0.007);
    const trackY = artY + artSize - trackH - artSize * 0.02;

    roundedRect(ctx, trackX, trackY, trackW, trackH, trackH / 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fill();

    const prog = clamp(s.duration > 0 ? (s.current / s.duration) : (s.progress || 0), 0, 1);
    const fillW = Math.max(trackH, trackW * prog);

    roundedRect(ctx, trackX, trackY, fillW, trackH, trackH / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.save();
    ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
    ctx.shadowBlur = trackH * 2;
    ctx.beginPath();
    ctx.arc(trackX + fillW, trackY + trackH / 2, trackH * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    // Animated Glass Border Light
    drawAnimatedBorderLight(ctx, cardX, cardY, cardW, cardH, cardR, s, scrollTime);
  }

  drawPurpleControls(ctx, cx, cy, spacing, iconSize, playing) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    const s = iconSize;

    const pX = cx - spacing;
    ctx.beginPath();
    ctx.fillRect(pX - s * 0.7, cy - s * 0.6, s * 0.25, s * 1.2);
    ctx.moveTo(pX + s * 0.6, cy - s * 0.6);
    ctx.lineTo(pX - s * 0.35, cy);
    ctx.lineTo(pX + s * 0.6, cy + s * 0.6);
    ctx.closePath();
    ctx.fill();

    if (playing) {
      const bw = s * 0.28;
      ctx.fillRect(cx - s * 0.4, cy - s * 0.65, bw, s * 1.3);
      ctx.fillRect(cx + s * 0.15, cy - s * 0.65, bw, s * 1.3);
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.35, cy - s * 0.65);
      ctx.lineTo(cx + s * 0.6, cy);
      ctx.lineTo(cx - s * 0.35, cy + s * 0.65);
      ctx.closePath();
      ctx.fill();
    }

    const nX = cx + spacing;
    ctx.beginPath();
    ctx.moveTo(nX - s * 0.6, cy - s * 0.6);
    ctx.lineTo(nX + s * 0.35, cy);
    ctx.lineTo(nX - s * 0.6, cy + s * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(nX + s * 0.45, cy - s * 0.6, s * 0.25, s * 1.2);

    ctx.restore();
  }

  drawPhoneAesthetic(s, W, H, time = 0) {
    const ctx = this.ctx;
    if (!this.phoneCustomBackground && !this.phoneAestheticBackground) {
      this.ensurePhoneAestheticBackground();
      ctx.fillStyle = '#1c1514';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    const bgImg = isImageDrawable(this.phoneCustomBackground) ? this.phoneCustomBackground : this.phoneAestheticBackground;
    if (!isImageDrawable(bgImg)) {
      ctx.fillStyle = '#1c1514';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    const imgW = bgImg.naturalWidth || bgImg.width || 576;
    const imgH = bgImg.naturalHeight || bgImg.height || 1024;
    const userScale = Math.max(0.4, Math.min(2.5, (Number(s.phoneBgScale) || 100) / 100));
    const userOffsetX = ((Number(s.phoneBgPosX) || 0) / 100) * W;
    const userOffsetY = ((Number(s.phoneBgPosY) || 0) / 100) * H;
    const portrait = H > W * 1.2;
    const landscape = W > H * 1.25;

    const brightness = clamp(Number(s.phoneBgBrightness ?? 100), 20, 200);
    const saturation = clamp(Number(s.phoneBgSaturation ?? 100), 0, 250);
    const blurPx = Math.max(0, Math.min(30, Number(s.phoneBgBlur ?? 0)));

    const bgCanvas = this.ensurePhoneBgCanvas(
      s, W, H, bgImg, imgW, imgH, landscape, portrait,
      userScale, userOffsetX, userOffsetY,
      brightness, saturation, blurPx
    );
    ctx.drawImage(bgCanvas, 0, 0);

    const { bx, by, bw, bh } = this.phoneBgCoords;
    const tlU = Number(s.phoneScreenTLX ?? PHONE_AESTHETIC_DEFAULTS.tl.x);
    const tlV = Number(s.phoneScreenTLY ?? PHONE_AESTHETIC_DEFAULTS.tl.y);
    const trU = Number(s.phoneScreenTRX ?? PHONE_AESTHETIC_DEFAULTS.tr.x);
    const trV = Number(s.phoneScreenTRY ?? PHONE_AESTHETIC_DEFAULTS.tr.y);
    const brU = Number(s.phoneScreenBRX ?? PHONE_AESTHETIC_DEFAULTS.br.x);
    const brV = Number(s.phoneScreenBRY ?? PHONE_AESTHETIC_DEFAULTS.br.y);
    const blU = Number(s.phoneScreenBLX ?? PHONE_AESTHETIC_DEFAULTS.bl.x);
    const blV = Number(s.phoneScreenBLY ?? PHONE_AESTHETIC_DEFAULTS.bl.y);

    const pTL = { x: bx + tlU * bw, y: by + tlV * bh };
    const pTR = { x: bx + trU * bw, y: by + trV * bh };
    const pBR = { x: bx + brU * bw, y: by + brV * bh };
    const pBL = { x: bx + blU * bw, y: by + blV * bh };
    const corners = [pTL, pTR, pBR, pBL];

    const glowIntensity = clamp(Number(s.phoneScreenGlow ?? 40) / 100, 0, 1);
    if (glowIntensity > 0.01) {
      const gcx = (pTL.x + pTR.x + pBR.x + pBL.x) / 4;
      const gcy = (pTL.y + pTR.y + pBR.y + pBL.y) / 4;
      const gRadius = Math.hypot(pBR.x - pTL.x, pBR.y - pTL.y) * 0.85;
      const glowGrad = ctx.createRadialGradient(gcx, gcy, gRadius * 0.25, gcx, gcy, gRadius);
      const glowCol = s.phonePlayerBg || '#d32626';
      glowGrad.addColorStop(0, toRgba(glowCol, 0.26 * glowIntensity));
      glowGrad.addColorStop(0.5, toRgba(glowCol, 0.08 * glowIntensity));
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(gcx, gcy, gRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (!this.phoneScreenCanvas) this.phoneScreenCanvas = makeCanvas(540, 1170);
    const sCtx = this.phoneScreenCanvas.getContext('2d');
    sCtx.clearRect(0, 0, 540, 1170);

    let playerBg = s.phonePlayerBg || '#d32626';
    let playerText = s.phonePlayerText || '#ffffff';
    let progressColor = s.phoneProgressColor || '#ffffff';

    const theme = s.phonePlayerTheme || 'red';
    if (theme === 'red') {
      playerBg = s.phonePlayerBg || '#d32626';
      playerText = s.phonePlayerText || '#ffffff';
      progressColor = s.phoneProgressColor || '#ffffff';
    } else if (theme === 'dark') {
      playerBg = '#0e0f14';
      playerText = '#f2f3f7';
      progressColor = '#ffffff';
    } else if (theme === 'cover' && this.palette) {
      playerBg = this.palette.deep || '#1a1018';
      playerText = '#ffffff';
      progressColor = this.palette.primary || '#ffffff';
    } else if (theme === 'retro') {
      playerBg = '#2c1c11';
      playerText = '#f7e7c4';
      progressColor = '#e6a147';
    }

    sCtx.save();
    roundedRect(sCtx, 0, 0, 540, 1170, 46);
    sCtx.clip();

    const bgGrad = sCtx.createLinearGradient(0, 0, 0, 1170);
    bgGrad.addColorStop(0, playerBg);
    bgGrad.addColorStop(0.72, toRgba(playerBg, 0.94));
    bgGrad.addColorStop(1, toRgba(playerBg, 0.86));
    sCtx.fillStyle = bgGrad;
    sCtx.fillRect(0, 0, 540, 1170);

    // Status Bar
    sCtx.fillStyle = playerText;
    sCtx.font = '600 24px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    sCtx.textAlign = 'left';
    sCtx.textBaseline = 'middle';
    sCtx.fillText('11:33', 52, 42);

    // Dynamic Island
    sCtx.fillStyle = '#000000';
    roundedRect(sCtx, 270 - 66, 26, 132, 34, 17);
    sCtx.fill();
    sCtx.fillStyle = '#0a0a14';
    sCtx.beginPath();
    sCtx.arc(270 + 35, 43, 5, 0, Math.PI * 2);
    sCtx.fill();

    // Signal Bars
    for (let b = 0; b < 4; b++) {
      const bh = 5 + b * 3.5;
      roundedRect(sCtx, 540 - 146 + b * 6.5, 49 - bh, 3.8, bh, 1.2);
      sCtx.fillStyle = playerText;
      sCtx.fill();
    }

    // Wifi Icon
    sCtx.strokeStyle = playerText;
    sCtx.lineWidth = 2;
    sCtx.lineCap = 'round';
    sCtx.beginPath(); sCtx.arc(540 - 105, 48, 10, -Math.PI * 0.75, -Math.PI * 0.25); sCtx.stroke();
    sCtx.beginPath(); sCtx.arc(540 - 105, 48, 6.5, -Math.PI * 0.75, -Math.PI * 0.25); sCtx.stroke();
    sCtx.beginPath(); sCtx.arc(540 - 105, 48, 3, -Math.PI * 0.75, -Math.PI * 0.25); sCtx.stroke();
    sCtx.beginPath(); sCtx.arc(540 - 105, 47, 1.5, 0, Math.PI * 2); sCtx.fillStyle = playerText; sCtx.fill();

    // Battery Icon
    sCtx.strokeStyle = toRgba(playerText, 0.85);
    sCtx.lineWidth = 1.8;
    roundedRect(sCtx, 540 - 82, 34, 28, 16, 4);
    sCtx.stroke();
    sCtx.fillStyle = toRgba(playerText, 0.85);
    roundedRect(sCtx, 540 - 79, 37, 18, 10, 2);
    sCtx.fill();
    roundedRect(sCtx, 540 - 53, 39, 2.2, 6, 1);
    sCtx.fill();

    // Top Header: Downward chevron, playlist header, options
    sCtx.strokeStyle = toRgba(playerText, 0.7);
    sCtx.lineWidth = 2.5;
    sCtx.lineCap = 'round';
    sCtx.lineJoin = 'round';
    sCtx.beginPath();
    sCtx.moveTo(52, 92);
    sCtx.lineTo(60, 100);
    sCtx.lineTo(68, 92);
    sCtx.stroke();

    sCtx.fillStyle = toRgba(playerText, 0.6);
    sCtx.font = '600 12px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText('PLAYING FROM PLAYLIST', 270, 88);
    sCtx.fillStyle = toRgba(playerText, 0.95);
    sCtx.font = '700 14px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    sCtx.fillText('Favorites', 270, 104);

    sCtx.fillStyle = toRgba(playerText, 0.75);
    for (let d = -1; d <= 1; d++) {
      sCtx.beginPath();
      sCtx.arc(540 - 60 + d * 7, 98, 2.2, 0, Math.PI * 2);
      sCtx.fill();
    }

    // Album cover
    const artX = 65, artY = 136, artSize = 410;
    sCtx.save();
    sCtx.shadowColor = 'rgba(0, 0, 0, 0.42)';
    sCtx.shadowBlur = 24;
    sCtx.shadowOffsetY = 12;
    roundedRect(sCtx, artX, artY, artSize, artSize, 26);
    sCtx.fillStyle = '#1c1524';
    sCtx.fill();
    sCtx.restore();

    cropImage(sCtx, this.image, artX, artY, artSize, artSize, 26);

    sCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    sCtx.lineWidth = 1.5;
    roundedRect(sCtx, artX, artY, artSize, artSize, 26);
    sCtx.stroke();

    // Title and Artist
    const scrollTime = s.offline ? (s.current || 0) : (time || 0);
    const titleY = 574;
    const titleBoxW = 350;
    const marqueeEnabled = s.phoneMarqueeEnabled !== false;
    const marqueeSpeed = Number(s.phoneMarqueeSpeed) || 45;

    sCtx.save();
    sCtx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    sCtx.shadowBlur = 4;
    sCtx.shadowOffsetY = 1.5;

    drawMarqueeText(
      sCtx,
      s.title || 'Judul Lagu',
      artX,
      titleY,
      titleBoxW,
      36,
      '800 34px system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      '#ffffff',
      scrollTime,
      { speed: marqueeSpeed, enableMarquee: marqueeEnabled }
    );

    // Heart icon
    this.drawPhoneHeartIcon(sCtx, 540 - 72, titleY + 18, 22, toRgba(playerText, 0.85));

    // Artist
    const artistY = 616;
    drawMarqueeText(
      sCtx,
      s.artist || 'Nama Artis',
      artX,
      artistY,
      titleBoxW,
      26,
      '600 24px system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      toRgba(playerText, 0.92),
      scrollTime,
      { speed: marqueeSpeed * 0.9, enableMarquee: marqueeEnabled }
    );
    sCtx.restore();

    // Audio Spectrum on phone screen
    const spectrumEnabled = s.phoneSpectrumEnabled !== false;
    if (spectrumEnabled) {
      const specY = 652;
      const specH = 30;
      const specW = artSize;
      const specX = artX;
      const count = 30;
      const gap = 3.5;
      const barW = (specW - gap * (count - 1)) / count;
      const animTime = s.offline ? (s.current || 0) : (time || (typeof performance !== 'undefined' ? performance.now() / 1000 : 0));
      const spectrum = s.renderSpectrum || this.spectrum;
      const isPlaying = Boolean(s.playing);

      sCtx.save();
      for (let i = 0; i < count; i++) {
        const sampleIdx = Math.floor((i / count) * (spectrum?.length || 32));
        const dataVal = spectrum?.length ? (spectrum[sampleIdx] / 255) : 0.16;
        const wave1 = Math.sin(i * 0.44 + animTime * (isPlaying ? 4.2 : 0.6));
        const wave2 = Math.cos(i * 0.30 - animTime * (isPlaying ? 3.2 : 0.4));
        const wave = 0.22 + 0.38 * Math.abs(wave1) + 0.22 * Math.abs(wave2);

        const activeFactor = isPlaying ? (dataVal * 0.68 + wave * 0.52) : (wave * 0.28);
        const bh = Math.max(3.5, specH * Math.min(1, activeFactor));
        const bx = specX + i * (barW + gap);
        const by = specY + specH - bh;

        const barGrad = sCtx.createLinearGradient(0, by + bh, 0, by);
        barGrad.addColorStop(0, toRgba(progressColor, 0.45));
        barGrad.addColorStop(0.55, toRgba(progressColor, 0.85));
        barGrad.addColorStop(1, '#ffffff');

        sCtx.fillStyle = barGrad;
        sCtx.shadowColor = toRgba(progressColor, 0.45);
        sCtx.shadowBlur = isPlaying ? 5 : 2;
        roundedRect(sCtx, bx, by, barW, bh, barW / 2);
        sCtx.fill();
      }
      sCtx.restore();
    }

    // Progress bar
    const progY = 700;
    const progW = artSize;
    const progH = 6;
    const progress = clamp(s.duration > 0 ? (s.current / s.duration) : (s.progress || 0), 0, 1);

    sCtx.fillStyle = toRgba(playerText, 0.22);
    roundedRect(sCtx, artX, progY, progW, progH, 3);
    sCtx.fill();

    if (progress > 0) {
      sCtx.fillStyle = progressColor;
      roundedRect(sCtx, artX, progY, Math.max(progH, progW * progress), progH, 3);
      sCtx.fill();
    }

    const thumbX = artX + progW * progress;
    sCtx.save();
    sCtx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    sCtx.shadowBlur = 6;
    sCtx.fillStyle = progressColor;
    sCtx.beginPath();
    sCtx.arc(thumbX, progY + progH / 2, 7, 0, Math.PI * 2);
    sCtx.fill();
    sCtx.restore();

    // Timers
    if (s.phoneTimerEnabled !== false) {
      sCtx.font = '500 18px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      sCtx.fillStyle = toRgba(playerText, 0.65);
      sCtx.textBaseline = 'alphabetic';
      sCtx.textAlign = 'left';
      sCtx.fillText(formatTime(s.current || 0), artX, 730);
      sCtx.textAlign = 'right';
      sCtx.fillText(`-${formatTime(Math.max(0, (s.duration || 0) - (s.current || 0)))}`, artX + progW, 730);
    }

    // Controls
    if (s.phoneControlsEnabled !== false) {
      const ctrlCenterY = 798;
      const playBtnRadius = 38;

      // Shuffle icon
      this.drawPhoneShuffleIcon(sCtx, 95, ctrlCenterY, 20, toRgba(playerText, 0.7));

      // Previous button
      sCtx.fillStyle = playerText;
      this.drawPhoneSkipIcon(sCtx, 178, ctrlCenterY, 22, -1);

      // Play/Pause button
      sCtx.fillStyle = playerText;
      sCtx.beginPath();
      sCtx.arc(270, ctrlCenterY, playBtnRadius, 0, Math.PI * 2);
      sCtx.fill();

      // Icon inside button
      sCtx.fillStyle = playerBg;
      if (s.playing) {
        const pbw = 6, pbh = 24, pgap = 7;
        roundedRect(sCtx, 270 - pgap / 2 - pbw, ctrlCenterY - pbh / 2, pbw, pbh, 2.5);
        sCtx.fill();
        roundedRect(sCtx, 270 + pgap / 2, ctrlCenterY - pbh / 2, pbw, pbh, 2.5);
        sCtx.fill();
      } else {
        sCtx.beginPath();
        const ptw = 20, pth = 24;
        sCtx.moveTo(270 - ptw * 0.38, ctrlCenterY - pth / 2);
        sCtx.lineTo(270 + ptw * 0.62, ctrlCenterY);
        sCtx.lineTo(270 - ptw * 0.38, ctrlCenterY + pth / 2);
        sCtx.closePath();
        sCtx.fill();
      }

      // Next button
      sCtx.fillStyle = playerText;
      this.drawPhoneSkipIcon(sCtx, 362, ctrlCenterY, 22, 1);

      // Repeat icon
      this.drawPhoneRepeatIcon(sCtx, 445, ctrlCenterY, 20, toRgba(playerText, 0.7));

      // Volume slider
      const volY = 878;
      this.drawPhoneSpeakerIcon(sCtx, 75, volY, 15, 0, toRgba(playerText, 0.6));
      sCtx.fillStyle = toRgba(playerText, 0.22);
      roundedRect(sCtx, 100, volY - 2, 340, 4, 2);
      sCtx.fill();
      sCtx.fillStyle = toRgba(playerText, 0.7);
      roundedRect(sCtx, 100, volY - 2, 340 * clamp(s.volume ?? 0.8), 4, 2);
      sCtx.fill();
      this.drawPhoneSpeakerIcon(sCtx, 465, volY, 15, 2, toRgba(playerText, 0.75));
    }

    // "About the artist" card preview peeking from bottom
    const cardPeekY = 938;
    roundedRect(sCtx, 52, cardPeekY, 436, 180, 22);
    sCtx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    sCtx.fill();
    sCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    sCtx.lineWidth = 1;
    roundedRect(sCtx, 52, cardPeekY, 436, 180, 22);
    sCtx.stroke();

    sCtx.fillStyle = playerText;
    sCtx.font = '700 17px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    sCtx.textAlign = 'left';
    sCtx.textBaseline = 'alphabetic';
    sCtx.fillText('About the artist', 74, cardPeekY + 34);

    sCtx.fillStyle = toRgba(playerText, 0.75);
    sCtx.font = '500 14px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    sCtx.fillText(s.artist || 'Artist', 74, cardPeekY + 60);

    // Home indicator
    sCtx.fillStyle = toRgba(playerText, 0.85);
    roundedRect(sCtx, (540 - 160) / 2, 1170 - 22, 160, 5, 2.5);
    sCtx.fill();

    // Realistic glass sheen
    const glassGrad = sCtx.createLinearGradient(0, 0, 540 * 0.85, 1170);
    glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    glassGrad.addColorStop(0.2, 'rgba(255, 255, 255, 0.04)');
    glassGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.0)');
    glassGrad.addColorStop(0.85, 'rgba(255, 255, 255, 0.02)');
    glassGrad.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
    sCtx.fillStyle = glassGrad;
    sCtx.fillRect(0, 0, 540, 1170);

    sCtx.restore();

    const project = makeProjector(corners);

    // 1. Fill solid screen background with perspective rounded corners (prevents hairline seams)
    ctx.save();
    tracePerspectiveRoundedRect(ctx, project, 0.082, 0.038);
    ctx.fillStyle = playerBg;
    ctx.fill();
    ctx.restore();

    // 2. Perspective Projection onto Quad with perspective rounded screen corners
    ctx.save();
    tracePerspectiveRoundedRect(ctx, project, 0.082, 0.038);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    drawPerspectiveImage(ctx, this.phoneScreenCanvas, corners, 5, 9);
    ctx.restore();

    // Subtle inner glass bezel shadow / stroke
    ctx.save();
    tracePerspectiveRoundedRect(ctx, project, 0.082, 0.038);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = Math.max(1.2, Math.min(W, H) * 0.0022);
    ctx.stroke();
    ctx.restore();

    if (s.phoneCalibrating) {
      this.drawCalibrationGuides(ctx, corners);
    }
  }

  drawPhoneHeartIcon(ctx, cx, cy, size, color) {
    ctx.save();
    ctx.translate(cx, cy);
    const s = size / 20;
    ctx.beginPath();
    ctx.moveTo(0, s * 4.5);
    ctx.bezierCurveTo(-s * 0.5, s * 3.5, -s * 9, -s * 2, -s * 9, -s * 5.5);
    ctx.bezierCurveTo(-s * 9, -s * 9, -s * 4.5, -s * 10, 0, -s * 5.5);
    ctx.bezierCurveTo(s * 4.5, -s * 10, s * 9, -s * 9, s * 9, -s * 5.5);
    ctx.bezierCurveTo(s * 9, -s * 2, s * 0.5, s * 3.5, 0, s * 4.5);
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  drawPhoneShuffleIcon(ctx, cx, cy, size, color) {
    ctx.save();
    ctx.translate(cx, cy);
    const s = size / 18;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 7, -s * 5);
    ctx.lineTo(-s * 2, -s * 5);
    ctx.lineTo(s * 3, s * 5);
    ctx.lineTo(s * 7, s * 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 4.5, s * 2.5);
    ctx.lineTo(s * 7.5, s * 5);
    ctx.lineTo(s * 4.5, s * 7.5);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-s * 7, s * 5);
    ctx.lineTo(-s * 2, s * 5);
    ctx.lineTo(s * 0.5, s * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 1.5, -s * 1.5);
    ctx.lineTo(s * 3, -s * 5);
    ctx.lineTo(s * 7, -s * 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 4.5, -s * 7.5);
    ctx.lineTo(s * 7.5, -s * 5);
    ctx.lineTo(s * 4.5, -s * 2.5);
    ctx.stroke();
    ctx.restore();
  }

  drawPhoneRepeatIcon(ctx, cx, cy, size, color) {
    ctx.save();
    ctx.translate(cx, cy);
    const s = size / 18;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, s * 6, -Math.PI * 0.78, Math.PI * 0.78);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 2, s * 5);
    ctx.lineTo(s * 6, s * 6.5);
    ctx.lineTo(s * 5.5, s * 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawPhoneSpeakerIcon(ctx, cx, cy, size, waves, color) {
    ctx.save();
    ctx.translate(cx, cy);
    const s = size / 16;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-s * 6, -s * 3.5);
    ctx.lineTo(-s * 2.5, -s * 3.5);
    ctx.lineTo(s * 2, -s * 7);
    ctx.lineTo(s * 2, s * 7);
    ctx.lineTo(-s * 2.5, s * 3.5);
    ctx.lineTo(-s * 6, s * 3.5);
    ctx.closePath();
    ctx.fill();
    if (waves > 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(s * 0.5, 0, s * 4.5, -Math.PI * 0.35, Math.PI * 0.35);
      ctx.stroke();
      if (waves > 1) {
        ctx.beginPath();
        ctx.arc(s * 0.5, 0, s * 8, -Math.PI * 0.38, Math.PI * 0.38);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawPhoneSkipIcon(ctx, cx, cy, size, direction) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(direction < 0 ? -1 : 1, 1);
    const w = size, h = size * 1.1;
    ctx.beginPath();
    ctx.moveTo(-w * 0.45, -h * 0.48);
    ctx.lineTo(0, 0);
    ctx.lineTo(-w * 0.45, h * 0.48);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, -h * 0.48);
    ctx.lineTo(w * 0.45, 0);
    ctx.lineTo(0, h * 0.48);
    ctx.closePath();
    ctx.fill();

    ctx.fillRect(w * 0.48, -h * 0.48, w * 0.14, h * 0.96);
    ctx.restore();
  }

  drawCalibrationGuides(ctx, corners) {
    const [tl, tr, br, bl] = corners;
    ctx.save();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    tracePerspectiveRoundedRect(ctx, makeProjector(corners), 0.082, 0.038);
    ctx.stroke();
    ctx.setLineDash([]);
    corners.forEach((pt, i) => {
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[i], pt.x, pt.y - 16);
    });
    ctx.restore();
  }

}
