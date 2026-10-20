// Browser-only recording presentation. Generated init script supplies configuration.
(() => {
  if (window !== window.top || window.__recordingPresentation) return;
  const config = __PRESENTATION_CONFIG__;
  const state = { x: null, y: null };
  // A press that outlasts the click animation shows a held state until release.
  const HOLD_DELAY_MS = 370;
  let holdTimer = null;
  let held = null;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { pointer-events:none !important; }
    * { box-sizing:border-box; pointer-events:none !important; }
    .pointer { position:fixed; left:0; top:0; display:none; will-change:transform; }
    .shape { transform-origin:0 0; }
    img { display:block; width:${config.size}px; height:auto; max-width:none;
      transform:translate(${-config.hotspotX}px,${-config.hotspotY}px);
      filter:drop-shadow(0 2px 3px #0005); }
    .ring { position:fixed; width:42px; height:42px; border:3px solid #ff9b35;
      border-radius:50%; background:#ff9b3520; }
    .held { position:fixed; left:0; top:0; }
    .held div { width:34px; height:34px; margin:-17px 0 0 -17px;
      border:3px solid #ff9b35; border-radius:50%; background:#ff9b3530; }
    .labels { position:fixed; top:18px; left:50%; transform:translateX(-50%);
      max-width:calc(100vw - 40px); }
    .step { padding:10px 17px; border:1px solid #ffffff22;
      border-radius:999px; background:#15191ee8; color:#fff;
      font:500 15px/1.35 system-ui,sans-serif; box-shadow:0 4px 18px #0003;
      text-align:center; overflow-wrap:anywhere; }
    /* Outside the centered box, so showing the tag does not move the step label. */
    .speed { position:absolute; top:0; left:calc(100% + 8px); white-space:nowrap;
      padding:10px 13px; border:1px solid #ffffff22;
      border-radius:999px; background:#15191ee8; color:#fff;
      font:500 15px/1.35 system-ui,sans-serif; font-variant-numeric:tabular-nums;
      box-shadow:0 4px 18px #0003; }
    .step:empty, .speed:empty { display:none; }
    .key { position:fixed; left:0; top:0; display:none; min-width:30px; height:30px;
      padding:0 9px; border:1px solid #ffffff2a; border-bottom-width:3px; border-radius:7px;
      background:#15191ef0; color:#fff; font:600 14px/26px ui-monospace,SFMono-Regular,monospace;
      text-align:center; white-space:pre; box-shadow:0 3px 10px #0003; }
  `;
  const pointer = document.createElement('div');
  pointer.className = 'pointer';
  const shape = document.createElement('div');
  shape.className = 'shape';
  const cursor = document.createElement('img');
  cursor.src = config.cursor;
  cursor.alt = '';
  shape.append(cursor);
  pointer.append(shape);
  const labels = document.createElement('div');
  labels.className = 'labels';
  const step = document.createElement('div');
  step.className = 'step';
  // A separate tag beside the step label marks a segment that is sped up afterwards.
  const speed = document.createElement('div');
  speed.className = 'speed';
  labels.append(step, speed);
  const key = document.createElement('div');
  key.className = 'key';
  shadow.append(style, labels, key, pointer);

  function track(event) {
    state.x = event.clientX;
    state.y = event.clientY;
    pointer.style.display = 'block';
    pointer.style.transform = `translate(${state.x}px,${state.y}px)`;
    if (held) held.ring.style.transform = `translate(${state.x}px,${state.y}px)`;
  }

  function beginHold() {
    holdTimer = null;
    // The outer element follows the pointer; the inner one pulses around its center.
    const ring = document.createElement('div');
    ring.className = 'held';
    const circle = document.createElement('div');
    ring.append(circle);
    shadow.insertBefore(ring, pointer);
    ring.style.transform = `translate(${state.x}px,${state.y}px)`;
    const pulse = circle.animate([
      { opacity: .55, transform: 'scale(.9)' },
      { opacity: 1, transform: 'scale(1.1)' },
    ], { duration: 520, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
    for (const previous of shape.getAnimations()) previous.cancel();
    shape.animate([{ transform: 'scale(1)' }, { transform: 'scale(.86)' }],
      { duration: 120, easing: 'ease-out', fill: 'forwards' });
    held = { ring, pulse };
  }

  function endHold() {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (!held) return;
    const { ring, pulse } = held;
    held = null;
    pulse.cancel();
    ring.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 })
      .addEventListener('finish', () => ring.remove(), { once: true });
    for (const previous of shape.getAnimations()) previous.cancel();
    shape.animate([
      { transform: 'scale(.86)' },
      { transform: 'scale(1.055)', offset: .6 },
      { transform: 'scale(1)' },
    ], { duration: 260, easing: 'ease-in-out' });
  }

  window.addEventListener('mousemove', track, { capture: true, passive: true });
  window.addEventListener('mousedown', event => {
    track(event);
    const ring = document.createElement('div');
    ring.className = 'ring';
    ring.style.left = `${state.x}px`;
    ring.style.top = `${state.y}px`;
    shadow.insertBefore(ring, pointer);
    const animation = ring.animate([
      { transform: 'translate(-50%,-50%) scale(.35)', opacity: .95 },
      { transform: 'translate(-50%,-50%) scale(1.45)', opacity: 0 },
    ], { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)' });
    animation.addEventListener('finish', () => ring.remove(), { once: true });
    for (const previous of shape.getAnimations()) previous.cancel();
    shape.animate([
      { transform: 'scale(1)', offset: 0 },
      { transform: 'scale(.86)', offset: .22 },
      { transform: 'scale(1.055)', offset: .68 },
      { transform: 'scale(1)', offset: 1 },
    ], { duration: 370, easing: 'ease-in-out' });
    endHold();
    holdTimer = setTimeout(beginHold, HOLD_DELAY_MS);
  }, { capture: true, passive: true });
  window.addEventListener('mouseup', endHold, { capture: true, passive: true });
  window.addEventListener('blur', endHold);

  // Shows each typed key beside the focused field. Password fields show nothing.
  const KEY_LABELS = {
    ' ': '␣', Enter: '⏎', Backspace: '⌫', Delete: '⌦', Tab: '⇥', Escape: 'Esc',
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  };
  const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);
  const KEY_VISIBLE_MS = 700;
  let keyTimer = null;
  let lastKeydown = 0;

  function isPassword(element) {
    return element instanceof HTMLInputElement && element.type === 'password';
  }

  function showKey(label, element) {
    if (!(element instanceof Element)) return;
    const rect = element.getBoundingClientRect();
    key.textContent = label;
    key.style.display = 'block';
    // Above the field's right edge, or below it near the top of the viewport.
    const top = rect.top - key.offsetHeight - 6 >= 0 ? rect.top - key.offsetHeight - 6 : rect.bottom + 6;
    const left = Math.max(4, Math.min(rect.right - key.offsetWidth, innerWidth - key.offsetWidth - 4));
    // left/top rather than transform, because the pop's `scale` would also scale a translate.
    key.style.left = `${left}px`;
    key.style.top = `${top}px`;
    for (const previous of key.getAnimations()) previous.cancel();
    key.animate([
      { scale: '1.18', opacity: .6 },
      { scale: '1', opacity: 1 },
    ], { duration: 120, easing: 'ease-out' });
    clearTimeout(keyTimer);
    keyTimer = setTimeout(() => {
      key.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 })
        .addEventListener('finish', () => { key.style.display = 'none'; }, { once: true });
    }, KEY_VISIBLE_MS);
  }

  window.addEventListener('keydown', event => {
    lastKeydown = event.timeStamp;
    const element = event.composedPath()[0];
    if (MODIFIERS.has(event.key) || isPassword(element)) return;
    const modifiers = [event.ctrlKey && '⌃', event.altKey && '⌥', event.metaKey && '⌘']
      .filter(Boolean).join('');
    showKey(modifiers + (KEY_LABELS[event.key] ?? event.key), element);
  }, { capture: true, passive: true });
  // Text inserted without a key event, such as CJK characters.
  window.addEventListener('beforeinput', event => {
    const element = event.composedPath()[0];
    if (event.timeStamp - lastKeydown < 30 || !event.data || isPassword(element)) return;
    showKey(event.data, element);
  }, { capture: true, passive: true });

  window.__recordingPresentation = {
    position: () => ({ ...state }),
    step: text => { step.textContent = text; },
    speed: text => { speed.textContent = text; },
  };

  function mount() {
    document.documentElement.append(host);
    // Hide the browser cursor only for the instrumented recording document.
    const hideCursor = document.createElement('style');
    hideCursor.textContent = 'html, body, body * { cursor: none !important; }';
    document.documentElement.append(hideCursor);
  }
  if (document.documentElement) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();
