#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

const help = `Recording presentation for agent-browser (Node.js, no dependencies).

Usage:
  present.mjs init --out FILE [--cursor PNG] [--size 32]
                  [--hotspot-x 0] [--hotspot-y 0]
  present.mjs step --session NAME --text "Current action"
                  [--index 1 --total 5] [--hold-ms 1000]
  present.mjs speed --session NAME (--factor 4 | --clear)
  present.mjs move  --session NAME (--selector "@e3" | --x N --y N)
  present.mjs click --session NAME (--selector "@e3" | --x N --y N)
  present.mjs hover --session NAME (--selector "button" | --x N --y N)
  present.mjs press --session NAME (--selector "@e3" | --x N --y N)
                  [--hold-ms 1000]
  present.mjs type  --session NAME (--selector "@e3" | --x N --y N)
                  --text "value" [--delay-ms 150] [--clear]

init writes a script for agent-browser --init-script FILE on a fresh session.
The default cursor is the packaged assets/cursor.png. Hotspots use displayed
CSS pixels from the image's upper-left corner. Empty step text hides the pill.

Selector targets are scrolled into view, re-measured, and clicked through
agent-browser's obstruction checks. Coordinate targets use top-document
viewport pixels, the same space the overlay draws in; use them for canvas and
WebGL apps such as Godot that expose no DOM target. Both paths move the real
mouse with distance-based easing and about 60 steps per second.

step keeps the label on screen for --hold-ms (default 1000) so it stays
readable; pass 0 for rapid-fire labels. speed shows a "×4" tag beside the step
label, or hides it with --clear, and prints the wall-clock time in "at"
(milliseconds). Use those two times as the segment for speed.mjs, so the tag is
visible exactly while the video plays faster. press approaches like click, then holds
the primary button for --hold-ms (default 1000) for long-press and
hold-to-confirm controls. It refuses a target that another element covers.

type clicks into the field like a person, then sends one real keystroke every
--delay-ms (default 150). --clear empties a --selector field first. The overlay
shows each key beside the field, except in password fields. The output reports
the character count and timing, never the typed text. Keep selector references fresh with
agent-browser snapshot -i. For subframes, switch back to the top frame first.
`;

function numberOption(value, name, minimum, maximum) {
  const number = Number(value);
  if (value === undefined || String(value).trim() === ''
      || !Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return number;
}

function browser(session, args, input) {
  const response = spawnSync('agent-browser', ['--session', session, '--json', ...args], {
    input,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
    shell: false,
  });
  if (response.error) throw response.error;
  if (response.status !== 0) {
    throw new Error(response.stderr.trim() || response.stdout.trim() || 'agent-browser failed');
  }
  const result = JSON.parse(response.stdout);
  if (!result.success) throw new Error(result.error || 'agent-browser failed');
  return result.data;
}

function evaluate(session, expression) {
  return browser(session, ['eval', '--stdin'], expression).result;
}

function overlayState(session) {
  return evaluate(session, `(() => {
    if (!window.__recordingPresentation) throw new Error('Recording overlay missing; launch with --init-script.');
    return { ...window.__recordingPresentation.position(), width: innerWidth, height: innerHeight };
  })()`);
}

function validBox(box) {
  if (!box || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(box[key]))
      || box.width <= 0 || box.height <= 0) {
    throw new Error('The target has no visible bounding box; inspect the page again.');
  }
  return box;
}

function selectorTarget(session, selector) {
  browser(session, ['scrollintoview', selector]);
  const box = validBox(browser(session, ['get', 'box', selector]));
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2), box };
}

function recheckSelector(session, selector, target) {
  const after = validBox(browser(session, ['get', 'box', selector]));
  const { x, y, box } = target;
  const moved = ['x', 'y', 'width', 'height'].some(key => Math.abs(box[key] - after[key]) > 1);
  if (moved || x < after.x || y < after.y || x >= after.x + after.width || y >= after.y + after.height) {
    throw new Error('The target moved during the approach. Inspect the page and retry with a fresh selector.');
  }
  if (!browser(session, ['is', 'enabled', selector]).enabled) {
    throw new Error('The target is disabled; no click was sent.');
  }
}

/**
 * Rejects a press point whose topmost element is outside the target box. Page scripts
 * cannot resolve snapshot refs, so the target is matched by its box: a cover with exactly
 * the target's box is not detected.
 */
function checkUnobstructed(session, x, y, box) {
  const covered = evaluate(session, `(() => {
    const box = ${JSON.stringify(box)};
    for (let element = document.elementFromPoint(${x}, ${y}); element; element = element.parentElement) {
      const rect = element.getBoundingClientRect();
      if (['x', 'y', 'width', 'height'].every(key => Math.abs(rect[key] - box[key]) <= 1)) return false;
    }
    return true;
  })()`);
  if (covered) throw new Error('Another element covers the target; no press was sent.');
}

/** Sends one character as a real keystroke; non-ASCII text has no key, so it is inserted. */
function typeCharacter(session, character) {
  if (character === '\n') return browser(session, ['press', 'Enter']);
  if (character === '\t') return browser(session, ['press', 'Tab']);
  if (/^[\x20-\x7e]$/.test(character)) return browser(session, ['press', character]);
  return browser(session, ['keyboard', 'inserttext', character]);
}

function approach(session, state, x, y) {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) {
    throw new Error(`The target (${x}, ${y}) is outside the ${state.width}x${state.height} viewport.`);
  }
  const distance = Math.hypot(x - state.x, y - state.y);
  const duration = Math.round(Math.min(1200, Math.max(240, 120 + 25 * Math.sqrt(distance))));
  const steps = Math.min(240, Math.ceil(duration * 60 / 1000));
  browser(session, ['mouse', 'move', String(x), String(y), '--human',
    '--duration', String(duration), '--steps', String(steps)]);
  return { distance: Math.round(distance), duration, steps };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      out: { type: 'string' },
      cursor: { type: 'string' },
      size: { type: 'string', default: '32' },
      'hotspot-x': { type: 'string', default: '0' },
      'hotspot-y': { type: 'string', default: '0' },
      session: { type: 'string' },
      text: { type: 'string' },
      index: { type: 'string' },
      total: { type: 'string' },
      'hold-ms': { type: 'string', default: '1000' },
      'delay-ms': { type: 'string', default: '150' },
      clear: { type: 'boolean', default: false },
      factor: { type: 'string' },
      selector: { type: 'string' },
      x: { type: 'string' },
      y: { type: 'string' },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  const [command] = positionals;
  if (positionals.length !== 1 || !['init', 'step', 'speed', 'move', 'click', 'hover', 'press', 'type'].includes(command)) {
    throw new Error('Choose init, step, speed, move, click, hover, press, or type. See --help.');
  }
  if (command === 'init') {
    if (!values.out) throw new Error('init requires --out FILE');
    const size = numberOption(values.size, '--size', 1, 512);
    const hotspotX = numberOption(values['hotspot-x'], '--hotspot-x', 0, 512);
    const hotspotY = numberOption(values['hotspot-y'], '--hotspot-y', 0, 512);
    const png = await readFile(values.cursor || new URL('../assets/cursor.png', import.meta.url));
    if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      throw new Error('--cursor must be a PNG image');
    }
    const height = size * png.readUInt32BE(20) / png.readUInt32BE(16);
    if (hotspotX > size || hotspotY > height) throw new Error('The hotspot must lie inside the displayed cursor.');
    const template = await readFile(new URL('../assets/overlay.js', import.meta.url), 'utf8');
    const config = { cursor: `data:image/png;base64,${png.toString('base64')}`, size, hotspotX, hotspotY };
    await writeFile(values.out, template.replace('__PRESENTATION_CONFIG__', JSON.stringify(config)));
    console.log(JSON.stringify({ initScript: values.out }));
    return;
  }
  if (!values.session) throw new Error(`${command} requires --session NAME`);
  const session = values.session;
  const state = overlayState(session);
  if (command === 'step') {
    if (values.text === undefined) throw new Error('step requires --text (use an empty value to hide it)');
    let text = values.text;
    if (values.index !== undefined || values.total !== undefined) {
      const index = numberOption(values.index ?? '', '--index', 1, Number.MAX_SAFE_INTEGER);
      const total = numberOption(values.total ?? '', '--total', index, Number.MAX_SAFE_INTEGER);
      if (!Number.isInteger(index) || !Number.isInteger(total)) throw new Error('Step counts must be integers');
      if (text) text = `${index}/${total} · ${text}`;
    }
    evaluate(session, `window.__recordingPresentation.step(${JSON.stringify(text)})`);
    const holdMs = numberOption(values['hold-ms'], '--hold-ms', 0, 60000);
    if (holdMs > 0) await sleep(holdMs);
    console.log(JSON.stringify({ step: text, holdMs }));
    return;
  }
  if (command === 'speed') {
    if (values.clear === (values.factor !== undefined)) throw new Error('speed needs exactly one of --factor N or --clear');
    let text = '';
    if (!values.clear) {
      const factor = numberOption(values.factor, '--factor', 1.01, 16);
      text = `×${Number.isInteger(factor) ? factor : factor.toFixed(2).replace(/0+$/, '')}`;
    }
    evaluate(session, `window.__recordingPresentation.speed(${JSON.stringify(text)})`);
    console.log(JSON.stringify({ speed: text, at: Date.now() }));
    return;
  }
  if (!Number.isFinite(state.x) || !Number.isFinite(state.y)) {
    throw new Error('Pointer position is unknown after navigation. Anchor it with agent-browser --session NAME mouse move 24 24 before capture.');
  }
  const hasSelector = values.selector !== undefined;
  const hasPoint = values.x !== undefined || values.y !== undefined;
  if (hasSelector === hasPoint) {
    throw new Error(`${command} needs exactly one of --selector or --x/--y`);
  }
  let selector = null;
  let target;
  if (hasSelector) {
    selector = values.selector;
    target = selectorTarget(session, selector);
    if (command === 'type') {
      // Clicking past the existing text leaves the caret at its end.
      const { box } = target;
      target.x = Math.round(box.x + box.width - Math.min(16, box.width / 4));
    }
  } else {
    if (values.x === undefined || values.y === undefined) throw new Error('coordinate targets need both --x and --y');
    target = {
      x: Math.round(numberOption(values.x, '--x', 0, 100000)),
      y: Math.round(numberOption(values.y, '--y', 0, 100000)),
    };
  }
  const holdMs = command === 'press'
    ? numberOption(values['hold-ms'], '--hold-ms', 100, 60000)
    : undefined;
  const typing = command === 'type' ? {
    // Array.from splits by code point, so emoji and CJK stay whole.
    characters: Array.from(values.text ?? ''),
    delayMs: numberOption(values['delay-ms'], '--delay-ms', 10, 1000),
  } : undefined;
  if (typing && values.text === undefined) throw new Error('type requires --text');
  if (typing && values.clear && !selector) throw new Error('--clear requires --selector');
  const motion = approach(session, state, target.x, target.y);
  if (selector) recheckSelector(session, selector, target);
  if (command === 'press') {
    if (selector) checkUnobstructed(session, target.x, target.y, target.box);
    browser(session, ['mouse', 'down']);
    await sleep(holdMs);
    browser(session, ['mouse', 'up']);
  }
  if (command === 'type') {
    if (selector) checkUnobstructed(session, target.x, target.y, target.box);
    browser(session, ['mouse', 'down']);
    browser(session, ['mouse', 'up']);
    if (values.clear) browser(session, ['fill', selector, '']);
    const before = selector && !values.clear ? browser(session, ['get', 'value', selector]).value : '';
    // Schedule from a fixed start so a slow keystroke does not delay the rest.
    const start = performance.now();
    const sent = [];
    for (const [index, character] of typing.characters.entries()) {
      const wait = start + index * typing.delayMs - performance.now();
      if (wait > 0) await sleep(wait);
      sent.push(performance.now());
      typeCharacter(session, character);
    }
    if (selector && browser(session, ['get', 'value', selector]).value !== before + typing.characters.join('')) {
      throw new Error('The field value does not match the typed text; inspect the page.');
    }
    const intervals = sent.slice(1).map((time, index) => time - sent[index]);
    typing.result = {
      characters: typing.characters.length,
      delayMs: typing.delayMs,
      meanIntervalMs: intervals.length ? Math.round(intervals.reduce((a, b) => a + b) / intervals.length) : 0,
      maxIntervalMs: intervals.length ? Math.round(Math.max(...intervals)) : 0,
    };
  }
  if (command === 'click') {
    if (selector) {
      browser(session, ['click', selector]);
    } else {
      browser(session, ['mouse', 'down']);
      browser(session, ['mouse', 'up']);
    }
  }
  console.log(JSON.stringify({
    action: command, selector, x: target.x, y: target.y, holdMs, ...typing?.result, ...motion,
  }));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
