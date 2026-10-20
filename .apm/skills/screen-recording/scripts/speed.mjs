#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { parseArgs } from 'node:util';

const help = `Speed up marked segments of a finished take (Node.js + FFmpeg, no dependencies).

Usage:
  speed.mjs --input TAKE --output FILE --segment START-ENDxFACTOR [--segment ...]
            [--marker-position br|bl|tr|tl] [--no-marker] [--font FILE] [--crf 16]

Example:
  speed.mjs --input take.mp4 --output take-fast.mp4 --segment 20.5-32.5x4

START and END are seconds in the input video. FACTOR is greater than 1 and at
most 16. Each segment plays FACTOR times faster; the rest keeps real time. The
output keeps the input frame rate by dropping frames inside fast segments, so a
12 s wait at x4 takes 3 s. While a segment plays, a marker such as "×4" is drawn
in a corner (bottom right by default) unless --no-marker is given. Browser
takes with the live overlay show the tag beside the step label instead
(present.mjs speed); pass --no-marker for them.

The output is a lossy re-encode (H.264 for .mp4, VP9 for .webm) and has no
audio. Keep the original take. Run verify.mjs on the original take with its
receipt, and on the output without one.

Prints a JSON report with each segment's real and played duration and a
disclosure sentence to repeat when delivering the video.
`;

const FONT_CANDIDATES = [
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
  'C:\\Windows\\Fonts\\arialbd.ttf',
];

function run(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function probe(file) {
  const output = run('ffprobe', ['-v', 'error', '-show_entries',
    'stream=codec_type,width,height,r_frame_rate:format=duration', '-of', 'json', file]);
  const { streams = [], format = {} } = JSON.parse(output);
  const video = streams.find(stream => stream.codec_type === 'video');
  if (!video) throw new Error(`No video stream found in ${file}.`);
  const duration = Number(format.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Could not read the duration of ${file}.`);
  return {
    width: video.width,
    height: video.height,
    rate: video.r_frame_rate,
    duration,
    hasAudio: streams.some(stream => stream.codec_type === 'audio'),
  };
}

function parseSegment(text) {
  const match = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(text);
  if (!match) throw new Error(`--segment ${text} must look like 20.5-32.5x4`);
  const [start, end, factor] = match.slice(1).map(Number);
  if (end <= start) throw new Error(`--segment ${text} ends before it starts`);
  if (factor <= 1 || factor > 16) throw new Error(`--segment ${text} needs a factor above 1 and at most 16`);
  return { start, end, factor };
}

function formatFactor(factor) {
  return `×${Number.isInteger(factor) ? factor : factor.toFixed(2).replace(/0+$/, '')}`;
}

function markerFilter(label, position, font, height) {
  const margin = Math.round(height / 25);
  const x = position.endsWith('r') ? `w-tw-${margin}` : `${margin}`;
  const y = position.startsWith('b') ? `h-th-${margin}` : `${margin}`;
  const size = Math.round(height / 28);
  // Single quotes keep spaces in the font path literal inside the filter graph.
  return `drawtext=fontfile='${font}':text='${label}':fontsize=${size}:fontcolor=white`
    + `:box=1:boxcolor=black@0.62:boxborderw=${Math.round(size / 2.5)}:x=${x}:y=${y}`;
}

function buildParts(segments, duration) {
  const parts = [];
  let cursor = 0;
  for (const segment of segments) {
    if (segment.start > cursor) parts.push({ start: cursor, end: segment.start, factor: 1 });
    parts.push(segment);
    cursor = segment.end;
  }
  if (duration > cursor) parts.push({ start: cursor, end: duration, factor: 1 });
  return parts;
}

function encoderArguments(output, crf) {
  const extension = extname(output).toLowerCase();
  if (extension === '.mp4') {
    return ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  }
  if (extension === '.webm') return ['-c:v', 'libvpx-vp9', '-crf', String(crf + 14), '-b:v', '0', '-row-mt', '1'];
  throw new Error('--output must end in .mp4 or .webm');
}

function main() {
  const { values } = parseArgs({
    options: {
      help: { type: 'boolean', short: 'h' },
      input: { type: 'string' },
      output: { type: 'string' },
      segment: { type: 'string', multiple: true },
      'marker-position': { type: 'string', default: 'br' },
      'no-marker': { type: 'boolean' },
      font: { type: 'string' },
      crf: { type: 'string', default: '16' },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  if (!values.input || !values.output) throw new Error('--input and --output are required');
  if (!values.segment?.length) throw new Error('At least one --segment START-ENDxFACTOR is required');
  const position = values['marker-position'];
  if (!['br', 'bl', 'tr', 'tl'].includes(position)) throw new Error('--marker-position must be br, bl, tr, or tl');
  const crf = Number(values.crf);
  if (!Number.isInteger(crf) || crf < 0 || crf > 40) throw new Error('--crf must be an integer from 0 to 40');

  const input = probe(values.input);
  const segments = values.segment.map(parseSegment).sort((a, b) => a.start - b.start);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment.end > input.duration + 0.05) {
      throw new Error(`Segment ${segment.start}-${segment.end} ends after the ${input.duration.toFixed(2)} s input`);
    }
    segment.end = Math.min(segment.end, input.duration);
    if (index > 0 && segment.start < segments[index - 1].end) throw new Error('Segments must not overlap');
  }

  const marker = !values['no-marker'];
  const font = values.font ?? FONT_CANDIDATES.find(candidate => existsSync(candidate));
  if (marker && !font) throw new Error('No marker font found; pass --font FILE or --no-marker');
  if (marker && font.includes("'")) throw new Error('The marker font path must not contain a single quote');

  const parts = buildParts(segments, input.duration);
  const chains = parts.map((part, index) => {
    const filters = [`trim=start=${part.start}:end=${part.end}`, `setpts=(PTS-STARTPTS)/${part.factor}`, `fps=${input.rate}`];
    if (part.factor > 1 && marker) filters.push(markerFilter(formatFactor(part.factor), position, font, input.height));
    return `[0:v]${filters.join(',')}[p${index}]`;
  });
  const graph = `${chains.join(';')};${parts.map((_, index) => `[p${index}]`).join('')}concat=n=${parts.length}:v=1:a=0[out]`;

  run('ffmpeg', ['-v', 'error', '-y', '-i', values.input, '-filter_complex', graph, '-map', '[out]', '-an',
    ...encoderArguments(values.output, crf), values.output]);

  const output = probe(values.output);
  const round = value => Math.round(value * 100) / 100;
  let outputCursor = 0;
  const timeline = parts.map(part => {
    const played = (part.end - part.start) / part.factor;
    const entry = {
      inputStart: round(part.start),
      inputEnd: round(part.end),
      outputStart: round(outputCursor),
      factor: part.factor,
      realSeconds: round(part.end - part.start),
      playedSeconds: round(played),
    };
    outputCursor += played;
    return entry;
  });
  const disclosure = timeline.filter(entry => entry.factor > 1).map(entry =>
    `${entry.inputStart}–${entry.inputEnd} s of the take plays at ${formatFactor(entry.factor)} `
    + `(${entry.realSeconds} s shown in ${entry.playedSeconds} s)`);
  const warnings = [];
  if (input.hasAudio) warnings.push('The input had audio; the output has none.');
  if (!marker) warnings.push('No marker was drawn; the take must show the live overlay tag during each segment.');
  console.log(JSON.stringify({
    input: values.input,
    output: values.output,
    inputDuration: round(input.duration),
    outputDuration: round(output.duration),
    rate: output.rate,
    dimensions: `${output.width}x${output.height}`,
    marker: marker ? { position, font } : null,
    timeline,
    disclosure,
    warnings,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(String(error.stderr || error.message || error).trim());
  process.exitCode = 1;
}
