import { formatBytes, formatTime, parseTime, readAudioMetadata } from './audio-utils.js';
import { PlayerRenderer } from './player-renderer.js';

const $ = (selector) => document.querySelector(selector);
const refs = {
  coverInput: $('#cover-input'), coverDrop: $('#cover-drop'), coverEmpty: $('#cover-empty'), coverFilled: $('#cover-filled'), coverThumb: $('#cover-thumb'), coverName: $('#cover-name'), coverSize: $('#cover-size'), coverRemove: $('#cover-remove'), coverChange: $('#cover-change'), coverError: $('#cover-error'),
  foregroundControls: $('#foreground-controls'), foregroundInput: $('#foreground-input'), foregroundDrop: $('#foreground-drop'), foregroundEmpty: $('#foreground-empty'), foregroundFilled: $('#foreground-filled'), foregroundThumb: $('#foreground-thumb'), foregroundName: $('#foreground-name'), foregroundSize: $('#foreground-size'), foregroundRemove: $('#foreground-remove'), foregroundChange: $('#foreground-change'), foregroundError: $('#foreground-error'), foregroundX: $('#foreground-x'), foregroundXValue: $('#foreground-x-value'), foregroundY: $('#foreground-y'), foregroundYValue: $('#foreground-y-value'), foregroundScale: $('#foreground-scale'), foregroundScaleValue: $('#foreground-scale-value'),
  audioInput: $('#audio-input'), audioDrop: $('#audio-drop'), audioEmpty: $('#audio-empty'), audioFilled: $('#audio-filled'), audioName: $('#audio-name'), audioSize: $('#audio-size'), audioDuration: $('#audio-duration'), audioRemove: $('#audio-remove'), audioError: $('#audio-error'),
  title: $('#track-title'), artist: $('#track-artist'), album: $('#track-album'), originalDuration: $('#original-duration'), waveformEnd: $('#waveform-end'), waveform: $('#waveform'), trimStart: $('#trim-start'), trimEnd: $('#trim-end'), selectionDuration: $('#selection-duration'), trimError: $('#trim-error'), playSelection: $('#play-selection'), resetTrim: $('#reset-trim'),
  canvas: $('#player-canvas'), previewEmpty: $('#preview-empty'), previewPlay: $('#preview-play'), previewTitle: $('#preview-track-title'), previewArtist: $('#preview-track-artist'), currentTime: $('#current-time'), remainingTime: $('#remaining-time'), previewScrub: $('#preview-scrub'), skipStart: $('#skip-start'), skipEnd: $('#skip-end'), volume: $('#volume-control'), volumeLabel: $('#volume-label'),
  colorRow: $('#color-row'), color: $('#background-color'), colorValue: $('#color-value'), coverBackgroundLabel: $('#cover-background-label'), spectrumToggle: $('#spectrum-toggle'), carouselControls: $('#carousel-controls'), carouselDepth: $('#carousel-depth'), carouselDepthValue: $('#carousel-depth-value'), backgroundIntensity: $('#background-intensity'), backgroundIntensityValue: $('#background-intensity-value'), renderButton: $('#render-button'), cancelRender: $('#cancel-render'), memoryWarning: $('#memory-warning'), renderError: $('#render-error'), stateBadge: $('#render-state-badge'), progressRing: $('#progress-ring'), ringProgress: $('#ring-progress'), progressPercent: $('#progress-percent'), progressTitle: $('#progress-title'), progressDescription: $('#progress-description'), linearProgress: $('#linear-progress'), progressDetail: $('#progress-detail'), resultState: $('#result-state'), resultEmpty: $('#result-empty'), resultContent: $('#result-content'), outputVideo: $('#output-video'), outputFilename: $('#output-filename'), outputMeta: $('#output-meta'), download: $('#download-button')
};

const state = {
  coverFile: null, coverUrl: null, coverSource: null, audioFile: null, audioUrl: null, duration: 0, trimStart: 0, trimEnd: 0, peaks: [],
  foregroundFile: null, foregroundUrl: null, foregroundSeq: 0, foregroundX: .58, foregroundY: .62, foregroundScale: 1,
  ratio: 'portrait', ratioBeforeModel: null, resolution: 1080, quality: 'balanced', background: 'blur', color: '#111116', template: 'minimal', spectrumEnabled: false, carouselDepth: 58, backgroundIntensity: 68, current: 0, playing: false, volume: .8,
  audioContext: null, analyser: null, gain: null, sourceNode: null, frequency: null, rendering: false, renderWorker: null, cancelRenderReject: null, workerWaiters: null, outputUrl: null, cancelRequested: false,
  coverSeq: 0, titleEdited: false, artistEdited: false, albumEdited: false
};

const player = new PlayerRenderer(refs.canvas, () => ({
  title: refs.title.value.trim(), artist: refs.artist.value.trim(), album: refs.album.value.trim(),
  background: state.background, color: state.color, template: state.template,
  foregroundX: state.foregroundX, foregroundY: state.foregroundY, foregroundScale: state.foregroundScale,
  spectrumEnabled: state.spectrumEnabled, carouselDepth: state.carouselDepth, backgroundIntensity: state.backgroundIntensity,
  progress: state.duration ? Math.max(0, Math.min(1, (refs.audio ? refs.audio.currentTime - state.trimStart : state.current - state.trimStart) / (state.trimEnd - state.trimStart || 1))) : 0,
  current: Math.max(0, (refs.audio?.currentTime ?? state.current) - state.trimStart), duration: Math.max(0, state.trimEnd - state.trimStart),
  playing: state.playing, volume: state.volume
}));
refs.audio = $('#source-audio');
player.start();

function setError(element, message = '') {
  element.textContent = message;
  element.hidden = !message;
}

function coverReady() { return Boolean(state.coverUrl); }
function audioReady() { return Boolean(state.audioFile && state.duration > 0); }
function selectedLength() { return state.trimEnd - state.trimStart; }

function syncCanvasSize() {
  let width, height;
  if (state.ratio === 'portrait') { width = state.resolution; height = Math.round(width * 16 / 9); }
  else if (state.ratio === 'square') width = height = state.resolution;
  else { height = state.resolution; width = Math.round(height * 16 / 9); }
  player.setSize(width, height);
  refs.canvas.classList.toggle('ratio-square', state.ratio === 'square');
  refs.canvas.classList.toggle('ratio-landscape', state.ratio === 'landscape');
}

function updateButtons() {
  const canPreview = audioReady();
  refs.previewPlay.disabled = !canPreview || state.rendering;
  refs.playSelection.disabled = !canPreview || state.rendering;
  refs.resetTrim.disabled = !canPreview || state.rendering;
  refs.skipStart.disabled = !canPreview || state.rendering;
  refs.skipEnd.disabled = !canPreview || state.rendering;
  refs.previewScrub.disabled = !canPreview || state.rendering;
  refs.renderButton.disabled = !canPreview || !coverReady() || state.rendering || selectedLength() < 1;
  refs.previewEmpty.hidden = canPreview && coverReady();
  document.querySelector('.editor-grid').classList.toggle('is-rendering', state.rendering);
  refs.renderButton.querySelector('span:nth-child(2)').textContent = state.rendering ? 'Sedang merender…' : 'Render MP4 lokal';
  refs.cancelRender.hidden = !state.rendering;
  refs.cancelRender.disabled = state.cancelRequested;
  refs.cancelRender.textContent = state.cancelRequested ? 'Membatalkan…' : 'Batalkan';
  document.querySelector('.editor-grid').inert = state.rendering;
  refs.previewPlay.classList.toggle('is-playing', state.playing);
  refs.previewPlay.querySelector('span').textContent = state.playing ? 'Ⅱ' : '▶';
  refs.playSelection.innerHTML = `<span class="button-play-icon">${state.playing ? 'Ⅱ' : '▶'}</span> ${state.playing ? 'Pause preview' : 'Preview pilihan'}`;
  updateMemoryWarning();
  syncPlaybackUI();
}

function updateMemoryWarning() {
  if (!audioReady() || state.duration < 180) {
    refs.memoryWarning.hidden = true;
    return;
  }
  refs.memoryWarning.textContent = state.resolution >= 1080
    ? 'Audio panjang di 1080p memerlukan memori ekstra saat decode dan ekspor. Pilih 720p bila browser terasa berat.'
    : 'Audio panjang tetap memakai memori saat decode lokal. Tutup tab berat lain bila ekspor gagal.';
  refs.memoryWarning.hidden = false;
}

function syncPlaybackUI() {
  const now = Math.max(0, Math.min(selectedLength(), refs.audio.currentTime - state.trimStart));
  const progress = selectedLength() > 0 ? now / selectedLength() : 0;
  refs.currentTime.textContent = formatTime(now);
  refs.remainingTime.textContent = `−${formatTime(Math.max(0, selectedLength() - now))}`;
  refs.previewScrub.value = String(Math.round(progress * 1000));
  refs.previewScrub.style.setProperty('--fill', `${progress * 100}%`);
}

function syncTrimUI() {
  refs.trimStart.value = formatTime(state.trimStart);
  refs.trimEnd.value = formatTime(state.trimEnd);
  refs.selectionDuration.textContent = formatTime(selectedLength());
  refs.originalDuration.textContent = `${formatTime(state.duration)} total`;
  refs.waveformEnd.textContent = formatTime(state.duration);
  drawWaveform();
  syncPlaybackUI();
}

function syncMetadata() {
  refs.previewTitle.textContent = refs.title.value.trim() || 'Judul lagu Anda';
  refs.previewArtist.textContent = refs.artist.value.trim() || 'Nama artis';
  player.draw();
}

function syncTemplateControls() {
  const carousel = state.template === 'spotify';
  const model = state.template === 'iphone-model';
  refs.carouselControls.hidden = !carousel;
  refs.foregroundControls.hidden = !model;
  refs.coverBackgroundLabel.textContent = model ? 'Fixed scene' : carousel ? 'Cover-derived' : 'Blur';
  document.querySelectorAll('.background-option').forEach((button) => { button.disabled = model; });
  refs.spectrumToggle.closest('.spectrum-toggle-row').hidden = model;
  refs.spectrumToggle.checked = state.spectrumEnabled;
  refs.carouselDepthValue.textContent = `${state.carouselDepth}%`;
  refs.backgroundIntensityValue.textContent = `${state.backgroundIntensity}%`;
}

function syncRatioAvailability() {
  const model = state.template === 'iphone-model';
  document.querySelectorAll('.ratio-button').forEach((button) => {
    button.disabled = model && button.dataset.ratio !== 'portrait';
    button.title = button.disabled ? 'Template iPhone Model menggunakan rasio tetap 9:16.' : '';
  });
}

function drawWaveform() {
  const canvas = refs.waveform;
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width) return;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(bounds.width * scale);
  canvas.height = Math.round(bounds.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const width = bounds.width, height = bounds.height, middle = height * .51;
  ctx.clearRect(0, 0, width, height);
  if (!state.peaks.length || !state.duration) {
    ctx.strokeStyle = '#34323d'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(8, middle); ctx.lineTo(width - 8, middle); ctx.stroke();
    ctx.fillStyle = '#9d80ed'; ctx.font = '8px sans-serif'; ctx.fillText('UPLOAD AUDIO UNTUK MELIHAT GELOMBANG', 10, 13);
    return;
  }
  const startX = state.trimStart / state.duration * width;
  const endX = state.trimEnd / state.duration * width;
  ctx.fillStyle = '#07070b72'; ctx.fillRect(0, 0, startX, height); ctx.fillRect(endX, 0, width - endX, height);
  const barGap = 2;
  const barWidth = Math.max(1, width / state.peaks.length - barGap);
  const halfH = height * .40;
  for (let i = 0; i < state.peaks.length; i++) {
    const x = i * width / state.peaks.length;
    const peak = state.peaks[i];
    const amp = Math.max(2, peak * halfH);
    ctx.fillStyle = x >= startX && x <= endX ? '#a283ff' : '#504b60';
    ctx.globalAlpha = x >= startX && x <= endX ? .9 : .6;
    ctx.fillRect(x, middle - amp, barWidth, amp * 2);
  }
  ctx.globalAlpha = 1;
  const handle = (x, letter) => {
    ctx.fillStyle = '#0d0c12'; ctx.fillRect(x - 5, 0, 10, height);
    ctx.fillStyle = '#b08fff'; ctx.fillRect(x - 1, 0, 2, height);
    ctx.beginPath(); ctx.roundRect(x - 5, 2, 10, 13, 4); ctx.fillStyle = '#a27bff'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '600 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, x, 8.5);
  };
  handle(startX, 'S'); handle(endX, 'E');
  const playX = state.duration ? refs.audio.currentTime / state.duration * width : startX;
  if (state.playing && playX >= startX && playX <= endX) {
    ctx.strokeStyle = '#ffffffa8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(playX, 0); ctx.lineTo(playX, height); ctx.stroke();
  }
}

function setProgress(progress, title, description, detail = '') {
  const indeterminate = !Number.isFinite(progress);
  const value = indeterminate ? 0 : Math.max(0, Math.min(100, progress));
  refs.progressRing.classList.toggle('indeterminate', indeterminate);
  refs.linearProgress.parentElement.classList.toggle('is-indeterminate', indeterminate);
  refs.progressRing.setAttribute('aria-valuenow', String(Math.round(value)));
  refs.progressPercent.textContent = indeterminate ? '…' : `${Math.round(value)}%`;
  refs.linearProgress.style.width = `${value}%`;
  refs.ringProgress.style.strokeDashoffset = String(214 - 214 * value / 100);
  refs.progressTitle.textContent = title;
  refs.progressDescription.textContent = description;
  if (detail) refs.progressDetail.textContent = detail;
}

function setRenderState(kind) {
  refs.stateBadge.className = `state-badge ${kind}`;
  refs.stateBadge.textContent = kind === 'running' ? 'MERENDER' : kind === 'done' ? 'SELESAI' : kind === 'error' ? 'GAGAL' : kind === 'cancelled' ? 'DIBATALKAN' : 'SIAP';
}

function loadImageFile(file) {
  setError(refs.coverError);
  if (!file) return;
  const validExt = /\.(jpe?g|png|webp)$/i.test(file.name);
  const validType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (!validExt || (!validType && file.type)) return setError(refs.coverError, 'Pilih gambar JPG, JPEG, PNG, atau WebP.');
  if (file.size > 20 * 1024 * 1024) return setError(refs.coverError, 'Ukuran cover maksimal 20 MB.');
  const sequence = ++state.coverSeq;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    if (sequence !== state.coverSeq) { URL.revokeObjectURL(url); return; }
    if (state.coverUrl) URL.revokeObjectURL(state.coverUrl);
    state.coverUrl = url;
    state.coverFile = file;
    state.coverSource = 'user';
    refs.coverThumb.src = url;
    refs.coverName.textContent = file.name;
    refs.coverSize.textContent = `${formatBytes(file.size)} · ${img.naturalWidth} × ${img.naturalHeight}`;
    refs.coverEmpty.hidden = true;
    refs.coverFilled.hidden = false;
    player.setCover(url);
    updateButtons();
    refs.coverInput.value = '';
  };
  img.onerror = () => { URL.revokeObjectURL(url); setError(refs.coverError, 'Gambar tidak dapat dibaca. Coba file lain.'); };
  img.src = url;
}

function removeCover() {
  state.coverSeq++;
  if (state.coverUrl) URL.revokeObjectURL(state.coverUrl);
  state.coverUrl = null; state.coverFile = null; state.coverSource = null;
  refs.coverThumb.removeAttribute('src'); refs.coverFilled.hidden = true; refs.coverEmpty.hidden = false;
  player.setCover(null); updateButtons();
}

function loadForegroundFile(file) {
  setError(refs.foregroundError);
  if (!file) return;
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);
  const extensionValid = /\.(jpe?g|png|webp|avif|gif)$/i.test(file.name);
  if (!extensionValid || (file.type && !allowed.has(file.type))) return setError(refs.foregroundError, 'Pilih foto JPG, PNG, WebP, AVIF, atau GIF yang dapat dibaca browser.');
  if (file.size > 20 * 1024 * 1024) return setError(refs.foregroundError, 'Ukuran foto depan maksimal 20 MB.');
  const sequence = ++state.foregroundSeq;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if (sequence !== state.foregroundSeq) { URL.revokeObjectURL(url); return; }
    if (state.foregroundUrl) URL.revokeObjectURL(state.foregroundUrl);
    state.foregroundUrl = url;
    state.foregroundFile = file;
    refs.foregroundThumb.src = url;
    refs.foregroundName.textContent = file.name;
    refs.foregroundSize.textContent = `${formatBytes(file.size)} · ${image.naturalWidth} × ${image.naturalHeight}`;
    refs.foregroundEmpty.hidden = true;
    refs.foregroundFilled.hidden = false;
    player.setForeground(url);
    refs.foregroundInput.value = '';
  };
  image.onerror = () => { URL.revokeObjectURL(url); setError(refs.foregroundError, 'Foto depan tidak dapat dibaca. Coba file gambar lain.'); };
  image.src = url;
}

function removeForeground() {
  state.foregroundSeq++;
  if (state.foregroundUrl) URL.revokeObjectURL(state.foregroundUrl);
  state.foregroundUrl = null;
  state.foregroundFile = null;
  refs.foregroundThumb.removeAttribute('src');
  refs.foregroundFilled.hidden = true;
  refs.foregroundEmpty.hidden = false;
  player.setForeground(null);
}

function makePeaks(buffer, count = 460) {
  const data = buffer.getChannelData(0);
  const bins = Math.min(count, Math.max(80, Math.floor(buffer.duration * 130)));
  const peaks = new Array(bins);
  for (let i = 0; i < bins; i++) {
    const start = Math.floor(i * data.length / bins);
    const end = Math.floor((i + 1) * data.length / bins);
    const stride = Math.max(1, Math.floor((end - start) / 90));
    let max = 0;
    for (let j = start; j < end; j += stride) max = Math.max(max, Math.abs(data[j]));
    peaks[i] = max;
  }
  return peaks;
}

function setupAudioGraph() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (state.sourceNode) return;
  if (!AudioContextConstructor) { refs.audio.volume = state.volume; return; }
  try {
    state.audioContext = new AudioContextConstructor();
    state.sourceNode = state.audioContext.createMediaElementSource(refs.audio);
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 128;
    state.frequency = new Uint8Array(state.analyser.frequencyBinCount);
    state.gain = state.audioContext.createGain();
    state.gain.gain.value = state.volume;
    state.sourceNode.connect(state.analyser);
    state.analyser.connect(state.gain);
    state.gain.connect(state.audioContext.destination);
  } catch (error) {
    console.warn('Audio analyzer unavailable; ordinary audio playback remains available.', error);
  }
}

async function loadAudioFile(file) {
  setError(refs.audioError);
  if (!file) return;
  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
  const validType = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'].includes(file.type);
  if (!['mp3', 'wav'].includes(extension) || (!validType && file.type)) return setError(refs.audioError, 'Pilih file berformat MP3 atau WAV.');
  if (file.size > 60 * 1024 * 1024) return setError(refs.audioError, 'Ukuran audio maksimal 60 MB.');
  if (state.coverSource === 'embedded') removeCover();
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  refs.audio.pause(); refs.audio.removeAttribute('src'); refs.audio.load();
  state.audioFile = null; state.duration = 0; state.peaks = []; state.current = 0; state.playing = false;
  refs.audioEmpty.hidden = false; refs.audioFilled.hidden = true; refs.audioRemove.hidden = true;
  const url = URL.createObjectURL(file);
  state.audioUrl = url;
  refs.audio.src = url; refs.audio.load();
  refs.audioName.textContent = file.name;
  refs.audioSize.textContent = formatBytes(file.size);
  refs.audioDuration.textContent = 'Membaca file…';
  refs.audioEmpty.hidden = true; refs.audioFilled.hidden = false; refs.audioRemove.hidden = false;
  try {
    const loaded = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Audio tidak merespons atau file rusak.')), 15000);
      const success = () => { clearTimeout(timeout); cleanup(); resolve(); };
      const failure = () => { clearTimeout(timeout); cleanup(); reject(new Error('File audio tidak dapat dibaca. Coba file MP3 atau WAV yang valid.')); };
      const cleanup = () => { refs.audio.removeEventListener('loadedmetadata', success); refs.audio.removeEventListener('error', failure); };
      refs.audio.addEventListener('loadedmetadata', success, { once: true });
      refs.audio.addEventListener('error', failure, { once: true });
      if (refs.audio.readyState >= 1) success();
    });
    const [metadata] = await Promise.all([readAudioMetadata(file).catch(() => ({})), loaded]);
    if (state.audioUrl !== url) return;
    const duration = refs.audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Durasi audio tidak valid atau file rusak.');
    if (duration > 600) throw new Error('Durasi audio maksimal 10 menit untuk ekspor lokal.');
    state.duration = duration;
    state.trimStart = 0;
    state.trimEnd = Math.floor(duration);
    if (state.trimEnd < 1) throw new Error('Audio harus berdurasi minimal satu detik.');
    state.audioFile = file;
    refs.audioDuration.textContent = formatTime(duration);
    if (!state.titleEdited) refs.title.value = metadata.title || file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    if (!state.artistEdited) refs.artist.value = metadata.artist || '';
    if (!state.albumEdited) refs.album.value = metadata.album || '';
    if (metadata.cover && !state.coverFile) {
      const type = metadata.cover.type === 'image/png' ? 'png' : 'jpg';
      loadAudioEmbeddedCover(new File([metadata.cover], `cover-art.${type}`, { type: metadata.cover.type || 'image/jpeg' }), url);
    }
    // Decoding is only used to draw the waveform; playback itself stays on the native audio element.
    let decoded;
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) throw new Error('Browser ini belum mendukung pemrosesan audio. Gunakan browser modern.');
    const closeDecodeContext = !state.audioContext;
    const decodeContext = state.audioContext || new AudioContextConstructor();
    try {
      const bytes = await file.arrayBuffer();
      decoded = await decodeContext.decodeAudioData(bytes.slice(0));
    } catch {
      throw new Error('Audio dapat dibuka, tetapi gagal membuat waveform. Coba ekspor ulang sebagai MP3 atau WAV standar.');
    } finally {
      if (closeDecodeContext && decodeContext.state !== 'closed') await decodeContext.close().catch(() => {});
    }
    if (state.audioUrl !== url) return;
    state.peaks = makePeaks(decoded);
    syncTrimUI(); syncMetadata(); updateButtons();
    setProgress(0, 'Siap membuat video', 'Atur rentang lagu, lalu cek preview.', 'MP4 · H.264 + AAC');
    setRenderState('idle');
  } catch (error) {
    if (state.audioUrl === url) {
      refs.audio.pause(); refs.audio.removeAttribute('src'); refs.audio.load();
      URL.revokeObjectURL(url); state.audioUrl = null; state.audioFile = null; state.duration = 0; state.peaks = [];
      refs.audioEmpty.hidden = false; refs.audioFilled.hidden = true; refs.audioRemove.hidden = true;
      state.trimStart = 0; state.trimEnd = 0; syncTrimUI(); updateButtons();
      setError(refs.audioError, error.message || 'File audio tidak dapat dibaca.');
    }
  }
}

function loadAudioEmbeddedCover(file, audioUrl) {
  const sequence = ++state.coverSeq;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    if (state.audioUrl !== audioUrl || sequence !== state.coverSeq) { URL.revokeObjectURL(url); return; }
    if (state.coverSource === 'user') { URL.revokeObjectURL(url); return; }
    if (state.coverUrl) URL.revokeObjectURL(state.coverUrl);
    state.coverFile = file; state.coverUrl = url; state.coverSource = 'embedded';
    refs.coverThumb.src = url; refs.coverName.textContent = 'Cover tertanam di audio';
    refs.coverSize.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
    refs.coverEmpty.hidden = true; refs.coverFilled.hidden = false;
    player.setCover(url); updateButtons();
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

function removeAudio() {
  refs.audio.pause();
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  state.audioUrl = null; state.audioFile = null; state.duration = 0; state.trimStart = 0; state.trimEnd = 0; state.peaks = []; state.playing = false;
  refs.audio.removeAttribute('src'); refs.audio.load(); refs.audioEmpty.hidden = false; refs.audioFilled.hidden = true; refs.audioRemove.hidden = true;
  refs.audioInput.value = ''; syncTrimUI(); updateButtons();
  if (state.coverSource === 'embedded') removeCover();
}

function commitTimeInput(kind) {
  const input = kind === 'start' ? refs.trimStart : refs.trimEnd;
  const parsed = parseTime(input.value);
  const invalid = parsed === null || parsed > state.duration || (kind === 'start' ? parsed >= state.trimEnd : parsed <= state.trimStart);
  if (invalid) {
    input.value = formatTime(kind === 'start' ? state.trimStart : state.trimEnd);
    setError(refs.trimError, parsed === null ? 'Gunakan format menit:detik, misalnya 01:25.' : parsed > state.duration ? 'Waktu tidak boleh melewati durasi asli lagu.' : 'Mulai harus sebelum akhir dan pilihan minimal satu detik.');
    return;
  }
  setError(refs.trimError);
  if (kind === 'start') state.trimStart = parsed; else state.trimEnd = parsed;
  syncTrimUI(); updateButtons();
  if (refs.audio.currentTime < state.trimStart || refs.audio.currentTime > state.trimEnd) refs.audio.currentTime = state.trimStart;
}

function commitValidTimeInput(kind) {
  const input = kind === 'start' ? refs.trimStart : refs.trimEnd;
  const parsed = parseTime(input.value);
  const invalid = parsed === null || parsed > state.duration || (kind === 'start' ? parsed >= state.trimEnd : parsed <= state.trimStart);
  if (invalid) return;
  setError(refs.trimError);
  if (kind === 'start') state.trimStart = parsed; else state.trimEnd = parsed;
  syncTrimUI(); updateButtons();
  if (refs.audio.currentTime < state.trimStart || refs.audio.currentTime > state.trimEnd) refs.audio.currentTime = state.trimStart;
}

function setPointerSelection(event) {
  if (!state.duration || state.rendering) return;
  const rect = refs.waveform.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const seconds = Math.max(0, Math.min(Math.floor(state.duration), Math.round(ratio * state.duration)));
  const nearest = Math.abs(seconds - state.trimStart) < Math.abs(seconds - state.trimEnd) ? 'start' : 'end';
  if (state.dragging === 'start' || state.dragging === 'end') {
    const target = state.dragging;
    if (target === 'start') state.trimStart = Math.min(seconds, state.trimEnd - 1);
    else state.trimEnd = Math.max(seconds, state.trimStart + 1);
  } else if (nearest === 'start') state.trimStart = Math.min(seconds, state.trimEnd - 1);
  else state.trimEnd = Math.max(seconds, state.trimStart + 1);
  state.trimStart = Math.max(0, state.trimStart);
  state.trimEnd = Math.min(Math.floor(state.duration), state.trimEnd);
  setError(refs.trimError);
  syncTrimUI(); updateButtons();
}

async function togglePlayback(selection = false) {
  if (!audioReady() || state.rendering) return;
  if (!refs.audio.paused) { refs.audio.pause(); return; }
  if (refs.audio.currentTime < state.trimStart || refs.audio.currentTime >= state.trimEnd || selection && Math.abs(refs.audio.currentTime - state.trimEnd) < .05) refs.audio.currentTime = state.trimStart;
  setupAudioGraph();
  try {
    await state.audioContext?.resume();
    await refs.audio.play();
    state.playing = true; updateButtons();
  } catch {
    setError(refs.audioError, 'Browser tidak dapat memutar file ini. Coba file audio yang valid.');
  }
}

function updateDesignButtons(selector, dataKey, value) {
  document.querySelectorAll(selector).forEach((button) => {
    const selected = button.dataset[dataKey] === value;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function safeFileName() {
  const part = [refs.title.value.trim(), refs.artist.value.trim()].filter(Boolean).join(' - ') || 'music-video';
  return `${part.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'music-video'}.mp4`;
}

function videoBitrate(width, height) {
  const base = { fast: 2_000_000, balanced: 3_500_000, high: 5_500_000 }[state.quality] || 3_500_000;
  return Math.round(base * width * height / (1920 * 1080));
}

async function detectRenderCapabilities(width, height, bitrate) {
  if (!window.isSecureContext) throw new Error('WebCodecs memerlukan HTTPS atau localhost. Buka aplikasi di alamat yang aman.');
  if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) throw new Error('Browser ini belum mendukung worker OffscreenCanvas untuk render lokal. Gunakan Chrome atau Edge versi terbaru.');
  if (!window.VideoEncoder || !window.AudioEncoder) throw new Error('Browser ini belum menyediakan WebCodecs untuk encode audio/video lokal. Coba Chrome atau Edge terbaru.');
  if (!window.AudioContext && !window.webkitAudioContext) throw new Error('Browser ini belum mendukung Web Audio API untuk membaca audio lokal.');

  const levelHex = (width >= 1000 || height >= 1000 ? 0x29 : 0x1f).toString(16).padStart(2, '0');
  const codecs = [`avc1.6400${levelHex}`, `avc1.4d40${levelHex}`, `avc1.4200${levelHex}`];
  let chosenVideo = null;
  for (const codec of codecs) {
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference', 'prefer-software']) {
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec, width, height, bitrate, framerate: 30, latencyMode: 'quality', hardwareAcceleration
        });
        if (support.supported) {
          chosenVideo = {
            codec: support.config.codec || codec,
            hardwareAcceleration: support.config.hardwareAcceleration || hardwareAcceleration
          };
          break;
        }
      } catch {}
    }
    if (chosenVideo) break;
  }
  if (!chosenVideo) throw new Error(`Browser ini tidak dapat meng-encode H.264 pada ${width} × ${height}. Pilih resolusi lain atau browser yang mendukung WebCodecs.`);

  let chosenAudio = null;
  for (const sampleRate of [48_000, 44_100]) {
    try {
      const support = await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate, numberOfChannels: 2, bitrate: 160_000 });
      if (support.supported) { chosenAudio = { codec: support.config.codec || 'mp4a.40.2', sampleRate }; break; }
    } catch {}
  }
  if (!chosenAudio) throw new Error('Browser ini tidak mendukung encoder AAC untuk MP4. File tetap aman di perangkat; gunakan Chrome atau Edge terbaru.');
  return { ...chosenVideo, audioCodec: chosenAudio.codec, audioSampleRate: chosenAudio.sampleRate };
}

function createWorkerController(worker) {
  const pending = new Map();
  let terminalError = null;
  let didCancel = false;
  let resolveCanceled;
  const canceled = new Promise((resolve) => { resolveCanceled = resolve; });
  const keyOf = (type, id = '') => `${type}:${id}`;
  const rejectPending = (error) => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };
  const wait = (type, id = '') => {
    const key = keyOf(type, id);
    if (type === 'cancelled' && didCancel) return canceled.then(() => ({ type: 'cancelled' }));
    if (terminalError) return Promise.reject(terminalError);
    if (didCancel && type !== 'cancelled') return Promise.reject(new DOMException('Render dibatalkan.', 'AbortError'));
    return new Promise((resolve, reject) => pending.set(key, { resolve, reject }));
  };
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      if (data.phase === 'video') {
        setProgress(data.percent, 'Mengodekan frame secara offline…', `${data.done.toLocaleString()} dari ${data.total.toLocaleString()} frame diproses.`, `WebCodecs H.264 · ${state.resolution}p`);
      } else if (data.phase === 'finalize') {
        setProgress(data.percent, 'Menyelesaikan MP4…', 'Muxing lokal tanpa mengunggah media.', 'MP4 · H.264 + AAC');
      }
      return;
    }
    if (data.type === 'error') {
      terminalError = new Error(data.message || 'Worker render gagal.');
      rejectPending(terminalError);
      const errorWaiter = pending.get(keyOf('error'));
      errorWaiter?.reject(terminalError);
      pending.delete(keyOf('error'));
      return;
    }
    if (data.type === 'cancelled') {
      didCancel = true;
      resolveCanceled();
      rejectPending(new DOMException('Render dibatalkan.', 'AbortError'));
      return;
    }
    const key = keyOf(data.type, data.id ?? '');
    const waiter = pending.get(key);
    if (waiter) { pending.delete(key); waiter.resolve(data); }
  };
  worker.onerror = (event) => {
    terminalError = new Error(event.message || 'Worker gagal dijalankan. Muat ulang aplikasi dan coba lagi.');
    rejectPending(terminalError);
  };
  return { wait, canceled };
}

function abortError() { return new DOMException('Render dibatalkan.', 'AbortError'); }

async function renderLocally(token, controller, worker, renderContext) {
  const context = renderContext.context;
  setProgress(null, 'Mendekodekan audio di perangkat…', 'Membaca file lokal untuk menyiapkan rentang terpilih.', 'Tidak ada file yang dikirim ke server');
  const decodeStart = performance.now();
  const encoded = await state.audioFile.arrayBuffer();
  const decoded = await context.decodeAudioData(encoded);
  const audioDecodeMs = performance.now() - decodeStart;
  if (token.cancelled) throw abortError();
  if (decoded.numberOfChannels > 8) throw new Error('Audio memiliki lebih dari 8 channel; ekspor lokal dibatasi demi penggunaan memori.');
  const sampleRate = decoded.sampleRate;
  const startFrame = Math.max(0, Math.min(decoded.length - 1, Math.round(state.trimStart * sampleRate)));
  const endFrame = Math.max(startFrame + 1, Math.min(decoded.length, Math.round(state.trimEnd * sampleRate)));
  const duration = (endFrame - startFrame) / sampleRate;
  if (!Number.isFinite(duration) || duration < 1) throw new Error('Rentang audio hasil trim harus sedikitnya satu detik.');
  const width = refs.canvas.width;
  const height = refs.canvas.height;
  const bitrate = videoBitrate(width, height);
  const capabilities = await detectRenderCapabilities(width, height, bitrate);
  if (token.cancelled) throw abortError();

  const config = {
    width, height, fps: 30, videoBitrate: bitrate,
    videoCodec: capabilities.codec, audioCodec: capabilities.audioCodec,
    audioSampleRate: capabilities.audioSampleRate,
    hardwareAcceleration: capabilities.hardwareAcceleration,
    duration, sourceDuration: decoded.duration, trimStart: startFrame / sampleRate,
    title: refs.title.value.trim() || 'Judul lagu',
    artist: refs.artist.value.trim() || 'Nama artis',
    album: refs.album.value.trim(),
    background: state.background, color: state.color, template: state.template,
    foregroundX: state.foregroundX, foregroundY: state.foregroundY, foregroundScale: state.foregroundScale,
    spectrumEnabled: state.spectrumEnabled, carouselDepth: state.carouselDepth, backgroundIntensity: state.backgroundIntensity
  };
  const ready = controller.wait('ready');
  const coverImage = state.coverFile.slice(0, state.coverFile.size, state.coverFile.type);
  const foregroundImage = state.foregroundFile?.slice(0, state.foregroundFile.size, state.foregroundFile.type) || null;
  worker.postMessage({ type: 'start', config, cover: coverImage, foreground: foregroundImage });
  await ready;
  if (token.cancelled) throw abortError();

  const framesPerChunk = sampleRate;
  const chunkCount = Math.ceil((endFrame - startFrame) / framesPerChunk);
  let chunkIndex = 0;
  for (let firstFrame = startFrame; firstFrame < endFrame; firstFrame += framesPerChunk) {
    if (token.cancelled) throw abortError();
    const frameCount = Math.min(framesPerChunk, endFrame - firstFrame);
    const channels = decoded.numberOfChannels;
    const planar = new Float32Array(frameCount * channels);
    for (let channel = 0; channel < channels; channel++) {
      planar.set(decoded.getChannelData(channel).subarray(firstFrame, firstFrame + frameCount), channel * frameCount);
    }
    const id = String(chunkIndex++);
    const acknowledged = controller.wait('audio-accepted', id);
    worker.postMessage({
      type: 'audio', id, channels, sampleRate,
      timestamp: (firstFrame - startFrame) / sampleRate,
      data: planar.buffer
    }, [planar.buffer]);
    await acknowledged;
    setProgress(Math.min(4, 4 * chunkIndex / chunkCount), 'Mengodekan audio lokal…', `${chunkIndex} dari ${chunkCount} blok audio diproses.`, 'AAC · WebCodecs');
  }
  if (token.cancelled) throw abortError();
  const result = controller.wait('result');
  worker.postMessage({ type: 'audio-complete', peaks: state.peaks, audioDecodeMs });
  const completed = await result;
  if (token.cancelled) throw abortError();
  return { ...completed, duration, width, height, bitrate };
}

async function cancelRender() {
  if (!state.rendering || state.cancelRequested) return;
  state.cancelRequested = true;
  if (state.renderToken) state.renderToken.cancelled = true;
  refs.cancelRender.disabled = true;
  refs.cancelRender.textContent = 'Membatalkan…';
  state.cancelRenderReject?.(abortError());
}

async function renderVideo() {
  if (!audioReady() || !coverReady() || selectedLength() < 1 || state.rendering) return;
  state.rendering = true;
  state.cancelRequested = false;
  const token = { cancelled: false };
  state.renderToken = token;
  const renderStartedAt = performance.now();
  setError(refs.renderError);
  refs.resultEmpty.hidden = false; refs.resultContent.hidden = true;
  refs.outputVideo.pause(); refs.outputVideo.removeAttribute('src'); refs.outputVideo.load();
  if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
  state.outputUrl = null;
  refs.download.removeAttribute('href');
  refs.resultState.className = 'result-state'; refs.resultState.textContent = 'SEDANG RENDER';
  setRenderState('running'); updateButtons();
  setProgress(null, 'Menyiapkan render lokal…', 'Memeriksa dukungan encoder dan membaca file di browser.', 'H.264 + AAC · lokal');

  let worker;
  let controller;
  let renderContext;
  const cancelPromise = new Promise((_, reject) => { state.cancelRenderReject = () => reject(abortError()); });
  const renderTask = (async () => {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    const context = state.audioContext && state.audioContext.state !== 'closed' ? state.audioContext : new AudioContextConstructor();
    renderContext = { context, owned: context !== state.audioContext };
    worker = new Worker(new URL('./render-worker.js', import.meta.url), { type: 'module', name: 'sonicframe-offline-mp4' });
    state.renderWorker = worker;
    controller = createWorkerController(worker);
    return await renderLocally(token, controller, worker, renderContext);
  })();

  try {
    const result = await Promise.race([renderTask, cancelPromise]);
    const buffer = result.buffer;
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 64) throw new Error('MP4 yang dihasilkan kosong atau rusak.');
    if (new DataView(buffer).getUint32(4) !== 0x66747970) throw new Error('Hasil ekspor tidak memiliki struktur MP4 yang valid.');
    const blob = new Blob([buffer], { type: 'video/mp4' });
    const outputUrl = URL.createObjectURL(blob);
    state.outputUrl = outputUrl;
    const fileName = safeFileName();
    const elapsed = (performance.now() - renderStartedAt) / 1000;
    if (result.metrics) {
      console.info('[SonicFrame Benchmark Results]:', {
        resolution: `${result.width}x${result.height}`,
        durationSeconds: Number(result.duration.toFixed(2)),
        totalFrames: result.metrics.totalFrames,
        effectiveFps: Number(result.metrics.fps?.toFixed(1) || 0),
        audioDecodeMs: Math.round(result.metrics.audioDecodeMs || 0),
        audioEncodeMs: Math.round(result.metrics.audioEncodeMs || 0),
        frameGenerationMs: Math.round(result.metrics.frameGenMs || 0),
        videoEncodeMs: Math.round(result.metrics.videoEncodeMs || 0),
        mp4MuxingMs: Math.round(result.metrics.muxMs || 0),
        totalEncodingWallSec: Number(((result.metrics.totalEncodingWallMs || 0) / 1000).toFixed(2)),
        totalPipelineSec: Number(((result.metrics.totalPipelineMs || 0) / 1000).toFixed(2)),
        videoCodec: result.metrics.videoCodec,
        hardwareAcceleration: result.metrics.hardwareAcceleration
      });
    }
    refs.outputFilename.textContent = fileName;
    refs.outputMeta.textContent = `${result.width} × ${result.height} · ${formatTime(result.duration)} · ${formatBytes(blob.size)} · ${elapsed.toFixed(1)} dtk di perangkat ini`;
    refs.outputVideo.src = outputUrl;
    refs.download.href = outputUrl;
    refs.download.download = fileName;
    refs.resultEmpty.hidden = true; refs.resultContent.hidden = false;
    refs.resultState.className = 'result-state done'; refs.resultState.textContent = 'MP4 SIAP';
    setProgress(100, 'Video berhasil dibuat', `${fileName} · render ${elapsed.toFixed(1)} detik pada perangkat ini.`, 'H.264 + AAC · file tetap lokal');
    setRenderState('done');
  } catch (error) {
    if (state.cancelRequested || error?.name === 'AbortError') {
      setError(refs.renderError);
      setProgress(0, 'Render dibatalkan', 'Data sementara lokal sedang dibersihkan.', 'Tidak ada file yang diunggah');
      setRenderState('cancelled');
      refs.resultState.className = 'result-state'; refs.resultState.textContent = 'DIBATALKAN';
    } else {
      console.error(error);
      setError(refs.renderError, error.message || 'Terjadi kesalahan saat render di browser.');
      setProgress(0, 'Render gagal', error.message || 'Periksa dukungan browser dan ruang memori, lalu coba lagi.', 'File tetap berada di perangkat');
      setRenderState('error');
      refs.resultState.className = 'result-state'; refs.resultState.textContent = 'GAGAL';
    }
  } finally {
    if (state.cancelRequested && worker) {
      try {
        const canceled = controller?.wait('cancelled');
        worker.postMessage({ type: 'cancel' });
        await Promise.race([canceled, new Promise((resolve) => setTimeout(resolve, 1200))]);
      } catch {}
    }
    worker?.terminate();
    if (renderContext?.owned && renderContext.context.state !== 'closed') await renderContext.context.close().catch(() => {});
    state.renderWorker = null; state.renderToken = null; state.cancelRenderReject = null; state.workerWaiters = null;
    state.rendering = false; state.cancelRequested = false;
    updateButtons(); drawWaveform();
  }
}

refs.coverDrop.addEventListener('click', (event) => { if (!event.target.closest('button')) refs.coverInput.click(); });
refs.coverDrop.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); refs.coverInput.click(); } });
refs.coverInput.addEventListener('change', () => loadImageFile(refs.coverInput.files?.[0]));
refs.coverChange.addEventListener('click', (event) => { event.stopPropagation(); refs.coverInput.click(); });
refs.coverRemove.addEventListener('click', (event) => { event.stopPropagation(); removeCover(); });
refs.foregroundDrop.addEventListener('click', (event) => { if (!event.target.closest('button')) refs.foregroundInput.click(); });
refs.foregroundDrop.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); refs.foregroundInput.click(); } });
refs.foregroundInput.addEventListener('change', () => loadForegroundFile(refs.foregroundInput.files?.[0]));
refs.foregroundChange.addEventListener('click', (event) => { event.stopPropagation(); refs.foregroundInput.click(); });
refs.foregroundRemove.addEventListener('click', (event) => { event.stopPropagation(); removeForeground(); });
refs.audioDrop.addEventListener('click', (event) => { if (!event.target.closest('button')) refs.audioInput.click(); });
refs.audioDrop.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); refs.audioInput.click(); } });
refs.audioInput.addEventListener('change', () => loadAudioFile(refs.audioInput.files?.[0]));
refs.audioRemove.addEventListener('click', (event) => { event.stopPropagation(); removeAudio(); });

for (const [zone, input, handler] of [[refs.coverDrop, refs.coverInput, loadImageFile], [refs.foregroundDrop, refs.foregroundInput, loadForegroundFile], [refs.audioDrop, refs.audioInput, loadAudioFile]]) {
  zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (event) => { event.preventDefault(); zone.classList.remove('drag-over'); const file = event.dataTransfer?.files?.[0]; if (file) handler(file); });
}

refs.title.addEventListener('input', () => { state.titleEdited = true; syncMetadata(); });
refs.artist.addEventListener('input', () => { state.artistEdited = true; syncMetadata(); });
refs.album.addEventListener('input', () => { state.albumEdited = true; syncMetadata(); });
refs.trimStart.addEventListener('change', () => commitTimeInput('start'));
refs.trimEnd.addEventListener('change', () => commitTimeInput('end'));
refs.trimStart.addEventListener('input', () => commitValidTimeInput('start'));
refs.trimEnd.addEventListener('input', () => commitValidTimeInput('end'));
for (const input of [refs.trimStart, refs.trimEnd]) input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); input.blur(); } });

refs.waveform.addEventListener('pointerdown', (event) => {
  if (!state.duration || state.rendering) return;
  const rect = refs.waveform.getBoundingClientRect();
  const t = (event.clientX - rect.left) / rect.width * state.duration;
  state.dragging = Math.abs(t - state.trimStart) < Math.abs(t - state.trimEnd) ? 'start' : 'end';
  refs.waveform.setPointerCapture(event.pointerId); setPointerSelection(event);
});
refs.waveform.addEventListener('pointermove', (event) => { if (state.dragging) setPointerSelection(event); });
refs.waveform.addEventListener('pointerup', () => { state.dragging = null; });
refs.waveform.addEventListener('pointercancel', () => { state.dragging = null; });
refs.playSelection.addEventListener('click', () => togglePlayback(true));
refs.previewPlay.addEventListener('click', () => togglePlayback());
refs.resetTrim.addEventListener('click', () => { state.trimStart = 0; state.trimEnd = Math.floor(state.duration); setError(refs.trimError); syncTrimUI(); updateButtons(); });
refs.skipStart.addEventListener('click', () => { refs.audio.currentTime = state.trimStart; if (refs.audio.paused) syncPlaybackUI(); else refs.audio.play().catch(() => {}); });
refs.skipEnd.addEventListener('click', () => { refs.audio.currentTime = state.trimEnd; refs.audio.pause(); });
refs.previewScrub.addEventListener('input', () => {
  if (!audioReady()) return;
  const ratio = Number(refs.previewScrub.value) / 1000;
  refs.audio.currentTime = state.trimStart + ratio * selectedLength(); syncPlaybackUI();
  refs.previewScrub.style.setProperty('--fill', `${ratio * 100}%`);
});
refs.volume.addEventListener('input', () => {
  state.volume = Number(refs.volume.value) / 100;
  refs.volume.style.setProperty('--fill', `${state.volume * 100}%`);
  refs.volumeLabel.textContent = `${Math.round(state.volume * 100)}%`;
  if (state.gain) state.gain.gain.value = state.volume;
  else refs.audio.volume = state.volume;
  player.draw();
});

refs.foregroundX.addEventListener('input', () => { state.foregroundX = Number(refs.foregroundX.value) / 100; refs.foregroundXValue.textContent = `${refs.foregroundX.value}%`; player.draw(); });
refs.foregroundY.addEventListener('input', () => { state.foregroundY = Number(refs.foregroundY.value) / 100; refs.foregroundYValue.textContent = `${refs.foregroundY.value}%`; player.draw(); });
refs.foregroundScale.addEventListener('input', () => { state.foregroundScale = Number(refs.foregroundScale.value) / 100; refs.foregroundScaleValue.textContent = `${refs.foregroundScale.value}%`; player.draw(); });

document.querySelectorAll('.ratio-button').forEach((button) => button.addEventListener('click', () => {
  state.ratio = button.dataset.ratio;
  updateDesignButtons('.ratio-button', 'ratio', state.ratio); syncCanvasSize();
}));
document.querySelectorAll('.background-option').forEach((button) => button.addEventListener('click', () => {
  state.background = button.dataset.background;
  refs.colorRow.hidden = state.background !== 'solid';
  updateDesignButtons('.background-option', 'background', state.background); player.draw();
}));
document.querySelectorAll('.template-option').forEach((button) => button.addEventListener('click', () => {
  const nextTemplate = button.dataset.template;
  if (state.template !== 'iphone-model' && nextTemplate === 'iphone-model') {
    state.ratioBeforeModel = state.ratio;
    state.ratio = 'portrait';
  } else if (state.template === 'iphone-model' && nextTemplate !== 'iphone-model') {
    state.ratio = state.ratioBeforeModel || 'portrait';
    state.ratioBeforeModel = null;
  }
  state.template = nextTemplate;
  updateDesignButtons('.template-option', 'template', state.template);
  updateDesignButtons('.ratio-button', 'ratio', state.ratio);
  syncRatioAvailability(); syncCanvasSize(); syncTemplateControls(); player.draw();
}));
refs.spectrumToggle.addEventListener('change', () => { state.spectrumEnabled = refs.spectrumToggle.checked; player.draw(); });
refs.carouselDepth.addEventListener('input', () => { state.carouselDepth = Number(refs.carouselDepth.value); syncTemplateControls(); player.draw(); });
refs.backgroundIntensity.addEventListener('input', () => { state.backgroundIntensity = Number(refs.backgroundIntensity.value); syncTemplateControls(); player.draw(); });
document.querySelectorAll('.resolution-option').forEach((button) => button.addEventListener('click', () => {
  state.resolution = Number(button.dataset.resolution);
  updateDesignButtons('.resolution-option', 'resolution', String(state.resolution)); syncCanvasSize(); updateMemoryWarning();
}));
document.querySelectorAll('.quality-option').forEach((button) => button.addEventListener('click', () => {
  state.quality = button.dataset.quality;
  updateDesignButtons('.quality-option', 'quality', state.quality);
}));
refs.color.addEventListener('input', () => { state.color = refs.color.value; refs.colorValue.textContent = state.color.toUpperCase(); player.draw(); });
refs.renderButton.addEventListener('click', renderVideo);
refs.cancelRender.addEventListener('click', cancelRender);

refs.audio.addEventListener('play', () => { state.playing = true; player.start(); updateButtons(); });
refs.audio.addEventListener('pause', () => { state.playing = false; updateButtons(); });
refs.audio.addEventListener('timeupdate', () => {
  state.current = refs.audio.currentTime;
  syncPlaybackUI();
  if (!refs.audio.paused && refs.audio.currentTime >= state.trimEnd) {
    refs.audio.pause(); refs.audio.currentTime = state.trimStart;
  }
  if (!state.dragging) drawWaveform();
});
refs.audio.addEventListener('ended', () => {
  refs.audio.currentTime = state.trimStart; syncPlaybackUI();
});

const spectrumLoop = () => {
  if (state.analyser && state.frequency) {
    state.analyser.getByteFrequencyData(state.frequency);
    player.setSpectrum(state.frequency);
  }
  requestAnimationFrame(spectrumLoop);
};
requestAnimationFrame(spectrumLoop);

const resizeObserver = new ResizeObserver(() => drawWaveform());
resizeObserver.observe(refs.waveform);
window.addEventListener('pagehide', () => {
  player.stop(); resizeObserver.disconnect();
  try { player.modelBackground?.close(); } catch {}
  try { player.image?.close?.(); } catch {}
  try { player.foreground?.close?.(); } catch {}
  if (state.coverUrl) URL.revokeObjectURL(state.coverUrl);
  if (state.foregroundUrl) URL.revokeObjectURL(state.foregroundUrl);
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  if (state.renderToken) state.renderToken.cancelled = true;
  state.renderWorker?.terminate();
  if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
  if (state.audioContext && state.audioContext.state !== 'closed') state.audioContext.close().catch(() => {});
});

syncTemplateControls();
syncRatioAvailability();
syncCanvasSize();
refs.volume.style.setProperty('--fill', '80%');
drawWaveform(); updateButtons();
