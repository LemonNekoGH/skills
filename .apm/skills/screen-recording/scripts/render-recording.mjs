#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const help = `Add presentation overlays to a recording without changing its cadence.

Usage:
  node render-recording.mjs VIDEO TIMELINE OUTPUT.mkv
       [--cursor PNG] [--font FILE] [--cursor-size 32]
       [--hotspot-x 0] [--hotspot-y 0] [--expected-fps 60]

Requires Node.js and FFmpeg/ffprobe with drawtext, ass, and libx264rgb.
TIMELINE is a JSON file. Event t values are seconds; coordinates are source
video pixels. move.duration_ms is the recorded interval, never a suggested
replacement. Normalize rotation/crop upstream. This script sends no input.
The output is a new lossless RGB MKV master with source audio copied.
--font selects a font file containing the label language's glyphs.
--cursor-size and hotspot options use displayed video pixels.
--expected-fps requires the stated source average; frames are not resampled.
`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `${command} failed (${result.signal ?? result.status})`);
  }
  return result.stdout;
}

function probe(path) {
  return JSON.parse(run('ffprobe', [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', path,
  ]));
}

function finite(value, name, minimum = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${name} must be a finite number >= ${minimum}`);
  }
  return value;
}

function numberOption(value, name, minimum = 0) {
  if (value.trim() === '') throw new Error(`${name} must be a number`);
  return finite(Number(value), name, minimum);
}

function point(value, name, width, height) {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`${name} must be [x, y]`);
  const [x, y] = value.map(component => finite(component, name));
  if (x >= width || y >= height) throw new Error(`${name} lies outside the source video`);
  return [x, y];
}

function samePoint(first, second) {
  return first !== null && first[0] === second[0] && first[1] === second[1];
}

function number(value) {
  return value.toFixed(6);
}

function smooth(start, end, startValue, endValue) {
  const progress = `clip((t-${number(start)})/${number(end - start)},0,1)`;
  return `(${number(startValue)}+${number(endValue - startValue)}*(${progress})^2*(3-2*(${progress})))`;
}

function positionExpression(moves, initial, axis) {
  let expression = number(initial[axis]);
  for (const move of moves) {
    const transition = smooth(move.t, move.end, move.from[axis], move.to[axis]);
    expression = `if(lt(t,${number(move.t)}),${expression},`
      + `if(lt(t,${number(move.end)}),${transition},${number(move.to[axis])}))`;
  }
  return expression;
}

function scaleExpression(clicks) {
  let expression = '1';
  const points = [[0, 1], [0.0814, 0.86], [0.2516, 1.055], [0.37, 1]];
  for (const click of clicks) {
    let animation = '1';
    for (let index = points.length - 2; index >= 0; index -= 1) {
      const [left, first] = points[index];
      const [right, last] = points[index + 1];
      const segment = smooth(click.t + left, click.t + right, first, last);
      animation = `if(lt(t,${number(click.t + right)}),${segment},${animation})`;
    }
    expression = `if(lt(t,${number(click.t)}),${expression},${animation})`;
  }
  return expression;
}

function assTime(seconds) {
  const centiseconds = Math.round(seconds * 100);
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor(centiseconds / 6000) % 60;
  const wholeSeconds = Math.floor(centiseconds / 100) % 60;
  const fraction = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(fraction).padStart(2, '0')}`;
}

function writeRings(path, clicks, width, height, logicalScale, duration) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Ring,Arial,20,&HFFFFFFFF,&HFFFFFFFF,&H00359BFF,&H00000000,0,0,0,0,100,100,0,0,1,3,0,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const radius = 21 * logicalScale;
  const control = radius * 0.552285;
  const fixed = value => value.toFixed(3);
  // The ASS vector and tags contain only validated numbers.
  const drawing = `m ${fixed(radius)} 0 `
    + `b ${fixed(radius + control)} 0 ${fixed(2 * radius)} ${fixed(radius - control)} ${fixed(2 * radius)} ${fixed(radius)} `
    + `b ${fixed(2 * radius)} ${fixed(radius + control)} ${fixed(radius + control)} ${fixed(2 * radius)} ${fixed(radius)} ${fixed(2 * radius)} `
    + `b ${fixed(radius - control)} ${fixed(2 * radius)} 0 ${fixed(radius + control)} 0 ${fixed(radius)} `
    + `b 0 ${fixed(radius - control)} ${fixed(radius - control)} 0 ${fixed(radius)} 0`;
  const lines = [header];
  for (const click of clicks) {
    const [x, y] = click.at;
    const tags = `\\an5\\pos(${x},${y})\\bord${3 * logicalScale}\\shad0`
      + '\\1a&HFF&\\3c&H359BFF&\\fscx35\\fscy35'
      + '\\t(0,650,0.4,\\fscx145\\fscy145)\\fad(0,650)\\p1';
    const end = Math.min(duration, click.t + 0.65);
    lines.push(`Dialogue: 0,${assTime(click.t)},${assTime(end)},Ring,,0,0,0,,{${tags}}${drawing}\n`);
  }
  writeFileSync(path, lines.join(''), 'utf8');
}

function validateTimeline(data, width, height, duration) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Timeline must be an object');
  }
  const logicalScale = finite(data.logical_scale === undefined ? 1 : data.logical_scale, 'logical_scale', 0.01);
  if (!Array.isArray(data.events)) throw new Error('events must be an array');
  const moves = [];
  const clicks = [];
  const steps = [];
  let previousTime = -1;
  for (const raw of data.events) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Each event must be an object');
    }
    const event = { ...raw, t: finite(raw.t, 'event.t') };
    if (event.t < previousTime || event.t >= duration) {
      throw new Error('Events must be in chronological order and inside the clip');
    }
    previousTime = event.t;
    if (event.type === 'move') {
      event.from = point(event.from, 'move.from', width, height);
      event.to = point(event.to, 'move.to', width, height);
      event.end = event.t + finite(event.duration_ms, 'move.duration_ms', 1) / 1000;
      if (event.end > duration) throw new Error('A recorded movement extends past the clip');
      const previous = moves.at(-1);
      if (previous && event.t < previous.end) throw new Error('Recorded movements must not overlap');
      if (previous && !samePoint(event.from, previous.to)) {
        throw new Error('Consecutive movements must share their endpoint');
      }
      const distance = Math.hypot(event.to[0] - event.from[0], event.to[1] - event.from[1]) / logicalScale;
      const recommended = Math.round(Math.min(1200, Math.max(240, 120 + 25 * Math.sqrt(distance))));
      console.log(JSON.stringify({
        move_t: event.t, recorded_duration_ms: event.duration_ms, recommended_duration_ms: recommended,
      }));
      moves.push(event);
      continue;
    }
    if (event.type === 'click') {
      event.at = point(event.at, 'click.at', width, height);
      clicks.push(event);
      continue;
    }
    if (event.type === 'step') {
      if (typeof event.text !== 'string' || event.text.includes('\0')) {
        throw new Error('step.text must be text without NUL characters');
      }
      steps.push(event);
      continue;
    }
    throw new Error(`Unknown event type: ${event.type}`);
  }
  let initial = null;
  if (data.initial_pointer != null) {
    initial = point(data.initial_pointer, 'initial_pointer', width, height);
  } else if (moves.length) {
    initial = moves[0].from;
  } else if (clicks.length) {
    throw new Error('Click-only timelines require initial_pointer: [x, y]');
  }
  if (moves.length && !samePoint(initial, moves[0].from)) {
    throw new Error('initial_pointer must match the first move.from');
  }
  for (const click of clicks) {
    let position = initial;
    for (const move of moves) {
      if (move.t > click.t) break;
      if (click.t < move.end) throw new Error('A click occurs before the recorded movement finishes');
      position = move.to;
    }
    if (!samePoint(position, click.at)) throw new Error('A click does not match the current pointer position');
  }
  return { logicalScale, initial, moves, clicks, steps };
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      cursor: { type: 'string' },
      font: { type: 'string' },
      'cursor-size': { type: 'string', default: '32' },
      'hotspot-x': { type: 'string', default: '0' },
      'hotspot-y': { type: 'string', default: '0' },
      'expected-fps': { type: 'string', default: '60' },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  if (positionals.length !== 3) throw new Error('Specify VIDEO TIMELINE OUTPUT.mkv. See --help.');
  const [video, timeline, output] = positionals.map(path => resolve(path));
  const cursor = values.cursor ? resolve(values.cursor) : fileURLToPath(new URL('../assets/cursor.png', import.meta.url));
  if (extname(output).toLowerCase() !== '.mkv') throw new Error('Use .mkv for the lossless master');
  if (existsSync(output)) throw new Error('Output already exists; choose a new path');
  const expectedFps = numberOption(values['expected-fps'], '--expected-fps', 0.01);
  const cursorSize = numberOption(values['cursor-size'], '--cursor-size', 1);
  const hotspotX = numberOption(values['hotspot-x'], '--hotspot-x');
  const hotspotY = numberOption(values['hotspot-y'], '--hotspot-y');
  const metadata = probe(video);
  const stream = metadata.streams.find(item => item.codec_type === 'video');
  if (!stream) throw new Error('Input has no video stream');
  if (Math.abs(Number(stream.start_time ?? 0)) > 0.000001) {
    throw new Error('Normalize video and audio timestamps to a zero video start upstream before rendering');
  }
  const formats = JSON.parse(run('ffprobe', ['-v', 'error', '-show_pixel_formats', '-of', 'json'])).pixel_formats;
  const pixelInfo = formats.find(item => item.name === stream.pix_fmt);
  if (!pixelInfo || (pixelInfo.components ?? []).some(component => component.bit_depth > 8)) {
    throw new Error('This RGB24 compositor supports only SDR sources with at most 8 bits per component');
  }
  if (['smpte2084', 'arib-std-b67'].includes(stream.color_transfer)) {
    throw new Error('HDR input requires an explicit upstream color workflow; this compositor supports SDR only');
  }
  if (stream.side_data_list?.some(side => Math.abs(Number(side.rotation ?? 0)) > 0.01)) {
    throw new Error('Normalize video rotation upstream before mapping timeline coordinates');
  }
  const [numerator, denominator] = stream.avg_frame_rate.split('/').map(Number);
  const fps = denominator ? numerator / denominator : 0;
  if (!Number.isFinite(fps) || Math.abs(fps - expectedFps) > 0.01) {
    throw new Error(`Source fps ${fps} differs from expected ${expectedFps}; pass the actual --expected-fps explicitly. Frames will not be resampled.`);
  }
  const duration = finite(Number(stream.duration ?? metadata.format?.duration), 'Clip duration');
  if (duration === 0) throw new Error('Cannot determine the clip duration');
  const { width, height } = stream;
  const { logicalScale, initial, moves, clicks, steps } = validateTimeline(
    JSON.parse(readFileSync(timeline, 'utf8')), width, height, duration,
  );
  const png = readFileSync(cursor);
  if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Cursor must be a PNG image');
  }
  const cursorWidth = png.readUInt32BE(16);
  const cursorHeight = png.readUInt32BE(20);
  if (!cursorWidth || !cursorHeight) throw new Error('Cursor PNG dimensions must be positive');
  const shownHeight = cursorSize * cursorHeight / cursorWidth;
  if (hotspotX >= cursorSize || hotspotY >= shownHeight) throw new Error('Hotspot must lie inside the displayed cursor');

  // Fixed filenames keep paths and literal label text out of filter expressions.
  const work = mkdtempSync(join(tmpdir(), 'recording-presentation-'));
  try {
    writeRings(join(work, 'rings.ass'), clicks, width, height, logicalScale, duration);
    let fontOption = '';
    if (values.font) {
      copyFileSync(resolve(values.font), join(work, 'label-font'));
      fontOption = 'fontfile=label-font:';
    }
    const filters = ['[0:v:0]format=rgb24,ass=filename=rings.ass'];
    for (const [index, step] of steps.entries()) {
      if (!step.text) continue;
      const end = steps[index + 1]?.t ?? duration;
      writeFileSync(join(work, `label-${index}.txt`), step.text, 'utf8');
      filters.push(`,drawtext=${fontOption}textfile=label-${index}.txt:expansion=none:`
        + `fontsize=${15 * logicalScale}:fontcolor=white:`
        + `x=(w-text_w)/2:y=${18 * logicalScale}:`
        + `box=1:boxcolor=0x15191e@0.9:boxborderw=${10 * logicalScale}:`
        + `enable='gte(t,${number(step.t)})*lt(t,${number(end)})'`);
    }
    const command = ['-hide_banner', '-loglevel', 'warning', '-n', '-i', video];
    if (initial === null) {
      filters.push('[presented]');
    } else {
      command.push('-loop', '1', '-framerate', stream.avg_frame_rate, '-i', cursor);
      const scale = scaleExpression(clicks);
      const x = positionExpression(moves, initial, 0);
      const y = positionExpression(moves, initial, 1);
      filters.push(`[base];[1:v]format=rgba,scale=w='max(1,round(${cursorSize}*(${scale})))':`
        + `h=-1:eval=frame,pad=w=${Math.ceil(cursorSize * 1.1)}:h=${Math.ceil(shownHeight * 1.1)}:`
        + 'x=0:y=0:color=black@0:eval=frame[cursor];'
        + `[base][cursor]overlay=x='(${x})-${hotspotX}*(${scale})':`
        + `y='(${y})-${hotspotY}*(${scale})':`
        + 'eval=frame:shortest=1:format=rgb[presented]');
    }
    command.push('-filter_complex', filters.join(''), '-map', '[presented]', '-map', '0:a?',
      '-c:v', 'libx264rgb', '-crf', '0', '-preset', 'medium',
      '-fps_mode', 'passthrough', '-c:a', 'copy', output);
    run('ffmpeg', command, { cwd: work, stdio: ['ignore', 'ignore', 'inherit'] });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const encoded = probe(output).streams.find(item => item.codec_type === 'video');
  console.log(JSON.stringify({
    output, source_fps: fps, output_average_fps: encoded.avg_frame_rate,
    width, height, codec: 'libx264rgb', crf: 0, cadence: 'passthrough',
  }));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
