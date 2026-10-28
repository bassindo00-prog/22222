export const formatTime = (value) => {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

export function parseTime(value) {
  const match = /^\s*(\d{1,4}):([0-5]\d)\s*$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function formatBytes(value) {
  if (!Number.isFinite(value)) return '';
  return value < 1024 * 1024
    ? `${(value / 1024).toFixed(0)} KB`
    : `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function decodeID3Text(bytes) {
  if (!bytes.length) return '';
  const encoding = bytes[0];
  let content = bytes.subarray(1);
  try {
    let decoder;
    if (encoding === 0) decoder = new TextDecoder('windows-1252');
    else if (encoding === 1) decoder = new TextDecoder('utf-16');
    else if (encoding === 2) decoder = new TextDecoder('utf-16be');
    else decoder = new TextDecoder('utf-8');
    return decoder.decode(content).replace(/\0+$/g, '').trim();
  } catch {
    return '';
  }
}

function syncSafe(bytes, offset) {
  return ((bytes[offset] & 0x7f) << 21) | ((bytes[offset + 1] & 0x7f) << 14) | ((bytes[offset + 2] & 0x7f) << 7) | (bytes[offset + 3] & 0x7f);
}

export async function readID3(file) {
  if (!file || !/\.mp3$/i.test(file.name) || file.size < 10) return {};
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 12 * 1024 * 1024)).arrayBuffer());
  if (String.fromCharCode(...bytes.subarray(0, 3)) !== 'ID3') return {};
  const version = bytes[3];
  const tagEnd = Math.min(bytes.length, 10 + syncSafe(bytes, 6));
  const result = {};
  let offset = 10;
  while (offset + 6 <= tagEnd) {
    const idLength = version === 2 ? 3 : 4;
    const id = String.fromCharCode(...bytes.subarray(offset, offset + idLength));
    if (!id.trim() || id.charCodeAt(0) === 0) break;
    const frameHeaderLength = version === 2 ? 6 : 10;
    let size;
    if (version === 2) size = (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5];
    else size = version === 4 ? syncSafe(bytes, offset + 4) : new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, false);
    const frameStart = offset + frameHeaderLength;
    const frameEnd = Math.min(tagEnd, frameStart + size);
    if (size <= 0 || frameEnd <= frameStart) break;
    const frame = bytes.subarray(frameStart, frameEnd);
    if (['TIT2', 'TT2'].includes(id)) result.title = decodeID3Text(frame);
    if (['TPE1', 'TP1'].includes(id)) result.artist = decodeID3Text(frame);
    if (['TALB', 'TAL'].includes(id)) result.album = decodeID3Text(frame);
    if (['APIC', 'PIC'].includes(id) && !result.cover) {
      let cursor = 1;
      if (id === 'PIC') cursor += 3;
      else {
        while (cursor < frame.length && frame[cursor] !== 0) cursor++;
        cursor++;
      }
      if (cursor < frame.length) {
        cursor++;
        const encoding = frame[0];
        if (encoding === 1 || encoding === 2) {
          while (cursor + 1 < frame.length && !(frame[cursor] === 0 && frame[cursor + 1] === 0)) cursor += 2;
          cursor += 2;
        } else {
          while (cursor < frame.length && frame[cursor] !== 0) cursor++;
          cursor++;
        }
        if (cursor < frame.length) {
          let mime = 'image/jpeg';
          if (id === 'PIC') {
            const fmt = String.fromCharCode(...frame.subarray(1, 4)).toLowerCase();
            mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
          } else {
            const mimeEnd = frame.indexOf(0, 1);
            const declared = new TextDecoder().decode(frame.subarray(1, mimeEnd > 0 ? mimeEnd : 1)).toLowerCase();
            if (declared.startsWith('image/')) mime = declared;
          }
          result.cover = new Blob([frame.subarray(cursor)], { type: mime });
        }
      }
    }
    offset = frameEnd;
  }
  return result;
}

export async function readWaveInfo(file) {
  if (!file || !/\.wav$/i.test(file.name) || file.size < 20) return {};
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 12 * 1024 * 1024)).arrayBuffer());
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' || String.fromCharCode(...bytes.subarray(8, 12)) !== 'WAVE') return {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const limit = Math.min(bytes.length, 8 + view.getUint32(4, true));
  const fields = { INAM: 'title', IART: 'artist', IPRD: 'album' };
  const result = {};
  let offset = 12;
  while (offset + 8 <= limit) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = Math.min(limit, start + size);
    if (id === 'LIST' && start + 4 <= end && String.fromCharCode(...bytes.subarray(start, start + 4)) === 'INFO') {
      let item = start + 4;
      while (item + 8 <= end) {
        const key = String.fromCharCode(...bytes.subarray(item, item + 4));
        const itemSize = view.getUint32(item + 4, true);
        const valueStart = item + 8;
        const valueEnd = Math.min(end, valueStart + itemSize);
        if (fields[key] && valueEnd > valueStart) {
          try {
            const value = new TextDecoder('windows-1252').decode(bytes.subarray(valueStart, valueEnd)).replace(/\0+$/g, '').trim();
            if (value) result[fields[key]] = value;
          } catch { /* an unreadable metadata field does not invalidate the audio */ }
        }
        item = valueStart + itemSize + (itemSize & 1);
      }
    }
    offset = start + size + (size & 1);
  }
  return result;
}

export async function readAudioMetadata(file) {
  if (/\.mp3$/i.test(file?.name || '')) return readID3(file);
  if (/\.wav$/i.test(file?.name || '')) return readWaveInfo(file);
  return {};
}
