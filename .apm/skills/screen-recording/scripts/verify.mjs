#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';

const help = `One-command recording verification (ffprobe + ffmpeg + optional agent-browser receipt).

Usage:
  verify.mjs --video FILE [--receipt FILE] [--cadence] [--limit 600]

Checks:
  - a video stream exists and reports codec, dimensions, pixel format, and rate;
  - the whole file decodes without errors;
  - with --receipt, an agent-browser stop receipt has frames and capturedFrames;
  - with --cadence, summarizes frame timestamp deltas. Treat this as
    informational: muxer timestamps are not independent proof that the
    application painted new frames at the target rate.

Prints a JSON report. Exits nonzero only on hard failures (missing stream or a
failed full decode). Quality and cadence limits are reported as warnings.
`;

function numberOption(value, name, minimum, maximum) {
  const number = Number(value);
  if (value === undefined || String(value).trim() === ''
      || !Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return number;
}

function run(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function probe(video) {
  const output = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,duration',
    '-of', 'json', video]);
  const stream = JSON.parse(output).streams?.[0];
  if (!stream) throw new Error('No video stream found.');
  let duration = Number(stream.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    const formatOutput = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', video]);
    duration = Number(JSON.parse(formatOutput).format?.duration);
  }
  return { ...stream, duration: Number.isFinite(duration) ? duration : null };
}

function countFrames(video) {
  const output = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', video]);
  const count = Number(output.trim());
  return Number.isFinite(count) && count > 0 ? count : null;
}

function decode(video) {
  try {
    run('ffmpeg', ['-v', 'error', '-i', video, '-f', 'null', '-']);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error.stderr || error.message || '').trim().slice(0, 2000) };
  }
}

function summarizeCadence(video, limit) {
  const output = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_frames',
    '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'csv=p=0', video]);
  const times = output.split('\n').map(line => Number(line.trim())).filter(Number.isFinite).slice(0, limit);
  if (times.length < 3) return null;
  const deltas = [];
  for (let index = 1; index < times.length; index += 1) deltas.push((times[index] - times[index - 1]) * 1000);
  const sorted = [...deltas].sort((a, b) => a - b);
  const mean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  const round = value => Math.round(value * 100) / 100;
  return {
    samples: deltas.length,
    medianMs: round(sorted[Math.floor(sorted.length / 2)]),
    meanMs: round(mean),
    minMs: round(sorted[0]),
    maxMs: round(sorted[sorted.length - 1]),
    over20ms: deltas.filter(delta => delta > 20).length,
  };
}

function readReceipt(path) {
  const payload = JSON.parse(readFileSync(path, 'utf8'));
  return payload.data ?? payload;
}

function main() {
  const { values } = parseArgs({
    options: {
      help: { type: 'boolean', short: 'h' },
      video: { type: 'string' },
      receipt: { type: 'string' },
      cadence: { type: 'boolean' },
      limit: { type: 'string', default: '600' },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  if (!values.video) throw new Error('--video FILE is required');
  const report = {
    video: values.video,
    bytes: statSync(values.video).size,
    stream: probe(values.video),
    warnings: [],
  };
  const declaredFrames = Number(report.stream.nb_frames);
  report.frames = Number.isFinite(declaredFrames) && declaredFrames > 0
    ? declaredFrames
    : countFrames(values.video);
  report.decode = decode(values.video);
  if (!report.decode.ok) report.warnings.push('The file did not decode cleanly.');
  if (report.frames === null) report.warnings.push('Could not determine the frame count.');
  if (values.receipt) {
    const stored = readReceipt(values.receipt);
    report.receipt = { frames: stored.frames ?? null, capturedFrames: stored.capturedFrames ?? null };
    if (stored.capturedFrames === 0) report.warnings.push('capturedFrames is 0; the recorder captured no source frames.');
    if (stored.frames == null || stored.capturedFrames == null) {
      report.warnings.push('Receipt is missing frames or capturedFrames.');
    }
  }
  if (values.cadence) {
    report.cadence = summarizeCadence(values.video, numberOption(values.limit, '--limit', 2, 100000));
    report.cadenceNote = 'Informational only: muxer timestamps are not independent proof that the application painted new frames at this rate.';
    if (!report.cadence) report.warnings.push('Not enough frames to summarize cadence.');
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.decode.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
