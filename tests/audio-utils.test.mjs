import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatTime, parseTime, readAudioMetadata } from '../src/audio-utils.js';

test('time and file-size formatting validates the editor inputs', () => {
  assert.equal(formatTime(199), '03:19');
  assert.equal(formatTime(-1), '00:00');
  assert.equal(parseTime('01:30'), 90);
  assert.equal(parseTime('5:07'), 307);
  assert.equal(parseTime('1:60'), null);
  assert.equal(parseTime('nope'), null);
  assert.equal(formatBytes(1024 * 1024), '1.0 MB');
});

function wavChunk(id, data) {
  const header = Buffer.alloc(8);
  header.write(id, 0, 4, 'ascii');
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data, data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
}

test('reads MP3 ID3 and WAV INFO fields when metadata exists', async () => {
  const frame = (id, value) => {
    const body = Buffer.concat([Buffer.from([3]), Buffer.from(value, 'utf8')]);
    const header = Buffer.alloc(10);
    header.write(id, 0, 4, 'ascii'); header.writeUInt32BE(body.length, 4);
    return Buffer.concat([header, body]);
  };
  const tag = Buffer.concat([frame('TIT2', 'Night Drive'), frame('TPE1', 'Test Artist'), frame('TALB', 'City Lights')]);
  const mp3Header = Buffer.alloc(10);
  mp3Header.write('ID3', 0, 3, 'ascii'); mp3Header[3] = 3;
  mp3Header[6] = (tag.length >> 21) & 0x7f; mp3Header[7] = (tag.length >> 14) & 0x7f;
  mp3Header[8] = (tag.length >> 7) & 0x7f; mp3Header[9] = tag.length & 0x7f;
  const mp3 = Object.assign(new Blob([mp3Header, tag]), { name: 'tagged.mp3' });
  assert.deepEqual(await readAudioMetadata(mp3), { title: 'Night Drive', artist: 'Test Artist', album: 'City Lights' });

  const info = Buffer.concat([
    Buffer.from('INFO', 'ascii'),
    wavChunk('INAM', Buffer.from('Morning Run\0')),
    wavChunk('IART', Buffer.from('Example Artist\0')),
    wavChunk('IPRD', Buffer.from('First Light\0'))
  ]);
  const list = wavChunk('LIST', info);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 4, 'ascii'); riff.writeUInt32LE(riff.length + list.length - 8, 4); riff.write('WAVE', 8, 4, 'ascii');
  const wav = Object.assign(new Blob([riff, list]), { name: 'tagged.wav' });
  assert.deepEqual(await readAudioMetadata(wav), { title: 'Morning Run', artist: 'Example Artist', album: 'First Light' });
});
