import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const renderer = fileURLToPath(new URL('../.apm/skills/screen-recording/scripts/render-recording.mjs', import.meta.url));
let directory;
let source;
let sequence = 0;

function run(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function createSource(path, options = []) {
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-n',
    '-f', 'lavfi', '-i', 'color=c=black:s=160x96:r=60:d=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
    '-c:v', 'ffv1', '-pix_fmt', 'bgr0', '-c:a', 'pcm_s16le', ...options, path,
  ]);
}

function render(timeline, video = source, extra = []) {
  const stem = join(directory, `take-${sequence++}`);
  const timelinePath = `${stem}.json`;
  const output = `${stem}.mkv`;
  writeFileSync(timelinePath, JSON.stringify(timeline));
  const result = spawnSync(process.execPath, [renderer, video, timelinePath, output, ...extra], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  assert.ifError(result.error);
  return { ...result, output };
}

function frameHashes(path) {
  return run('ffmpeg', [
    '-v', 'error', '-i', path, '-map', '0:v:0', '-pix_fmt', 'rgb24', '-f', 'framemd5', '-',
  ]).split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1).trim());
}

function videoInfo(path) {
  const metadata = JSON.parse(run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_streams', '-show_frames',
    '-show_entries', 'stream=width,height,avg_frame_rate,nb_read_frames:frame=best_effort_timestamp_time',
    '-of', 'json', path,
  ]));
  return {
    streams: metadata.streams.map(({ width, height, avg_frame_rate, nb_read_frames }) => ({
      width, height, avg_frame_rate, nb_read_frames,
    })),
    frames: metadata.frames.map(frame => frame.best_effort_timestamp_time),
  };
}

function audioHash(path) {
  return run('ffmpeg', ['-v', 'error', '-i', path, '-map', '0:a:0', '-c:a', 'copy', '-f', 'hash', '-hash', 'sha256', '-']);
}

function reject(timeline, message, video = source, extra = []) {
  const result = render(timeline, video, extra);
  assert.notEqual(result.status, 0, 'Invalid input must fail');
  assert.match(result.stderr, message);
  assert.equal(existsSync(result.output), false, 'Invalid input must not create an output');
}

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'screen-recording-test-'));
  source = join(directory, 'source.mkv');
  createSource(source);
});

after(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});

test('cursor, click, and label overlays preserve video cadence, dimensions, and source audio', () => {
  const result = render({ events: [
    { type: 'step', t: 0, text: 'Ready: 50% [a], b' },
    { type: 'move', t: 0.1, duration_ms: 500, from: [24, 48], to: [110, 60] },
    { type: 'step', t: 0.65, text: '' },
    { type: 'click', t: 0.7, at: [110, 60] },
  ] });
  assert.equal(result.status, 0, result.stderr);
  const input = videoInfo(source);
  const output = videoInfo(result.output);
  assert.deepEqual(output.streams, input.streams);
  assert.equal(output.streams[0].nb_read_frames, '120');
  assert.deepEqual(output.frames, input.frames);
  assert.equal(audioHash(result.output), audioHash(source));
  const original = frameHashes(source);
  const presented = frameHashes(result.output);
  assert.notEqual(presented[0], original[0], 'The opening label and cursor must be visible');
  assert.notEqual(presented[48], presented[110], 'Click animation must differ from the settled cursor');
  assert.notEqual(presented[110], original[110], 'The settled cursor must remain visible');
});

test('labels-only timelines show and clear labels without adding a cursor', () => {
  const result = render({ events: [
    { type: 'step', t: 0, text: 'Label only' },
    { type: 'step', t: 1, text: '' },
  ] });
  assert.equal(result.status, 0, result.stderr);
  const original = frameHashes(source);
  const presented = frameHashes(result.output);
  assert.equal(presented.length, original.length);
  assert.notEqual(presented[10], original[10]);
  assert.deepEqual(presented.slice(60), original.slice(60));
});

test('an empty timeline preserves every decoded frame and audio payload', () => {
  const result = render({ events: [] });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(frameHashes(result.output), frameHashes(source));
  assert.equal(audioHash(result.output), audioHash(source));
});

test('rejects overlapping recorded movements', () => {
  reject({ events: [
    { type: 'move', t: 0, duration_ms: 800, from: [10, 40], to: [60, 40] },
    { type: 'move', t: 0.4, duration_ms: 600, from: [60, 40], to: [100, 40] },
  ] }, /movements must not overlap/i);
});

test('rejects a click before its recorded approach finishes', () => {
  reject({ events: [
    { type: 'move', t: 0, duration_ms: 800, from: [10, 40], to: [60, 40] },
    { type: 'click', t: 0.4, at: [60, 40] },
  ] }, /click occurs before.*movement finishes/i);
});

test('rejects a click that differs from the pointer endpoint', () => {
  reject({ events: [
    { type: 'move', t: 0, duration_ms: 400, from: [10, 40], to: [60, 40] },
    { type: 'click', t: 0.5, at: [90, 40] },
  ] }, /click does not match.*pointer position/i);
});

test('rejects incorrect FPS instead of resampling the recording', () => {
  reject({ events: [] }, /source fps 60 differs from expected 30/i, source, ['--expected-fps', '30']);
});

test('rejects HDR transfer metadata on an 8-bit source', () => {
  const hdr = join(directory, 'hdr.mkv');
  createSource(hdr, [
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-bf', '0',
    '-x264-params', 'colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc',
  ]);
  const metadata = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', hdr]));
  assert.equal(metadata.streams[0].color_transfer, 'smpte2084');
  reject({ events: [] }, /HDR input.*SDR only/i, hdr);
});

test('rejects source pixels with more than eight bits per component', () => {
  const highDepth = join(directory, 'high-depth.mkv');
  createSource(highDepth, ['-pix_fmt', 'yuv444p10le']);
  reject({ events: [] }, /at most 8 bits per component/i, highDepth);
});

test('refuses to overwrite an existing output', () => {
  const timeline = join(directory, 'overwrite.json');
  const output = join(directory, 'existing.mkv');
  writeFileSync(timeline, JSON.stringify({ events: [] }));
  const sentinel = Buffer.from('Existing recording must remain unchanged.');
  writeFileSync(output, sentinel);
  const result = spawnSync(process.execPath, [renderer, source, timeline, output], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /output already exists/i);
  assert.deepEqual(readFileSync(output), sentinel);
});
