import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const presenter = fileURLToPath(new URL('../.apm/skills/screen-recording/scripts/present.mjs', import.meta.url));
const session = `present-scroll-${process.pid}-${Date.now()}`;
let directory;
let opened = false;

function run(program, args, input) {
  const result = spawnSync(program, args, {
    input, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function browser(...args) {
  const result = run('agent-browser', ['--session', session, '--json', ...args]);
  assert.equal(result.success, true, result.error);
  return result.data;
}

function evaluate(script) {
  const result = run('agent-browser', ['--session', session, '--json', 'eval', '--stdin'], script);
  assert.equal(result.success, true, result.error);
  return result.data.result;
}

function scroll(args) {
  return run(process.execPath, [presenter, 'scroll', '--session', session, '--duration-ms', '500', ...args]);
}

function measurements() {
  return evaluate(`(() => {
    const box = document.querySelector('#sample');
    return { x: box.scrollLeft, y: box.scrollTop, samples: window.scrollSamples, wheels: window.wheelSamples };
  })()`);
}

function assertAnimation(result, measured) {
  assert.ok(result.scroll.duration >= 450 && result.scroll.duration < 1500,
    `A requested 500 ms scroll took ${result.scroll.duration} ms`);
  assert.ok(measured.samples.length > 2, 'Scrolling must produce intermediate positions');
  const elapsed = measured.samples.at(-1).at - measured.samples[0].at;
  assert.ok(elapsed < 1500, `Observed scrolling stretched to ${elapsed} ms`);
}

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'present-scroll-test-'));
  const overlay = join(directory, 'presentation.js');
  const page = join(directory, 'index.html');
  run(process.execPath, [presenter, 'init', '--out', overlay]);
  writeFileSync(page, `<!doctype html><html lang="en"><meta charset="utf-8">
    <title>Scroll timing regression</title>
    <style>
      body { margin: 40px; font: 18px system-ui; }
      #sample { width: 480px; height: 320px; overflow: auto; border: 2px solid #333; }
      #content { width: 1800px; height: 2400px; background: repeating-linear-gradient(#eef 0 79px, #99b 80px); }
    </style>
    <h1>Scroll timing regression</h1>
    <div id="sample" role="region" aria-label="Scroll sample" tabindex="0"><div id="content">Horizontal and vertical scroll target</div></div>
    <script>
      window.scrollSamples = [];
      window.wheelSamples = [];
      const sample = document.querySelector('#sample');
      sample.addEventListener('scroll', () => scrollSamples.push({ at: performance.now(), x: sample.scrollLeft, y: sample.scrollTop }));
      sample.addEventListener('wheel', event => wheelSamples.push({ trusted: event.isTrusted, x: event.deltaX, y: event.deltaY }), { passive: true });
    </script></html>`);
  browser('--allow-file-access', '--init-script', overlay, 'open', pathToFileURL(page).href);
  opened = true;
  browser('set', 'viewport', '900', '650');
  browser('mouse', 'move', '60', '160');
});

beforeEach(() => {
  evaluate(`(async () => {
    document.querySelector('#sample').scrollTo(0, 0);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.scrollSamples = [];
    window.wheelSamples = [];
  })()`);
});

after(() => {
  try { if (opened) browser('close'); }
  finally { if (directory) rmSync(directory, { recursive: true, force: true }); }
});

test('selector scrolling reaches both offsets without serial CLI delays', context => {
  const result = scroll(['--selector', '#sample', '--delta-x', '180', '--delta-y', '600']);
  const measured = measurements();
  assert.deepEqual([measured.x, measured.y], [180, 600]);
  assertAnimation(result, measured);
  context.diagnostic(`500 ms requested; ${result.scroll.duration} ms animation; ${measured.samples.length} observed positions`);
});

test('snapshot references support reverse scrolling and clamp to the boundary', () => {
  evaluate('document.querySelector("#sample").scrollTo(240, 700)');
  const snapshot = browser('snapshot', '-i');
  const ref = Object.entries(snapshot.refs).find(([, node]) => node.name === 'Scroll sample')?.[0];
  assert.ok(ref, 'The scroll region must have a snapshot reference');
  scroll(['--selector', `@${ref}`, '--delta-x=-120', '--delta-y=-250']);
  assert.deepEqual([measurements().x, measurements().y], [120, 450]);
  scroll(['--selector', `@${ref}`, '--delta-x=-1000', '--delta-y=-1000']);
  assert.deepEqual([measurements().x, measurements().y], [0, 0]);
});

test('pointer scrolling keeps trusted wheel input and reaches the requested offsets', context => {
  const result = scroll(['--x', '200', '--y', '220', '--delta-x', '120', '--delta-y', '400']);
  const measured = measurements();
  assert.ok(measured.wheels.length > 2, 'The pointer path must send incremental wheel input');
  assert.ok(measured.wheels.every(event => event.trusted), 'Wheel events must come from real browser input');
  assert.deepEqual([measured.x, measured.y], [120, 400]);
  assertAnimation(result, measured);
  context.diagnostic(`500 ms requested; ${result.scroll.duration} ms animation; ${measured.wheels.length} trusted wheel events`);
});

test('ambiguous snapshot reference refuses to scroll an equally sized inner container', () => {
  const original = evaluate(`(() => {
    const sample = document.querySelector('#sample');
    const original = { html: sample.innerHTML, style: sample.getAttribute('style') };
    sample.style.position = 'relative';
    sample.style.border = 'none';
    sample.innerHTML = '<div id="inner" style="position:absolute;left:0;top:0;width:480px;height:320px;overflow:auto"><div style="width:1000px;height:1400px">Inner content</div></div><div style="width:1px;height:1200px;pointer-events:none"></div>';
    return original;
  })()`);
  try {
    const snapshot = browser('snapshot', '-i');
    const ref = Object.entries(snapshot.refs).find(([, node]) => node.name === 'Scroll sample')?.[0];
    assert.ok(ref);
    const result = spawnSync(process.execPath, [presenter, 'scroll', '--session', session,
      '--selector', `@${ref}`, '--delta-y', '200', '--duration-ms', '500'], { encoding: 'utf8', timeout: 30_000 });
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ambiguous; use a CSS selector/);
    const offsets = () => evaluate('[document.querySelector("#sample").scrollTop, document.querySelector("#inner").scrollTop]');
    assert.deepEqual(offsets(), [0, 0], 'An ambiguous reference must not scroll either container');
    scroll(['--selector', '#sample', '--delta-y', '200']);
    assert.deepEqual(offsets(), [200, 0], 'A CSS selector must scroll exactly the requested outer container');
  } finally {
    evaluate(`(() => {
      const sample = document.querySelector('#sample');
      const original = ${JSON.stringify(original)};
      sample.innerHTML = original.html;
      if (original.style === null) sample.removeAttribute('style');
      else sample.setAttribute('style', original.style);
    })()`);
  }
});
