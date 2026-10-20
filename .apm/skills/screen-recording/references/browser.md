# Browser workflow

Use agent-browser for inspection and real input. Check the installed CLI with `agent-browser skills get core` and `agent-browser record --help`.
The bundled `scripts/present.mjs` helper installs an isolated presentation overlay; it does not change application source.
Run Node through mise where Node is mise-managed.

## Prepare the live overlay

Set `skill_dir` to the directory containing this skill and choose an isolated session:

```sh
recording_dir=$(mktemp -d)
session=screen-recording-browser
node "$skill_dir/scripts/present.mjs" init --out "$recording_dir/presentation.js"
agent-browser --session "$session" \
  --init-script "$recording_dir/presentation.js" open "$app_url"
agent-browser --session "$session" set viewport 1280 800
agent-browser --session "$session" snapshot -i
agent-browser --session "$session" mouse move 24 24
```

Choose a viewport appropriate for the application. Add `--headed` for external window/display capture.
The default PNG cursor is 32 CSS pixels with hotspot `(0, 0)`; `init --help` lists custom cursor and hotspot options.
Anchor the pointer after the last full navigation before each take. The overlay reads a real move event and refuses movement from an unknown starting position.

## Label and interact

```sh
node "$skill_dir/scripts/present.mjs" step --session "$session" \
  --index 2 --total 5 --text '输入错误密码，检查错误提示'
node "$skill_dir/scripts/present.mjs" click --session "$session" --selector '@e3'
agent-browser --session "$session" fill '@e3' 'example input'
agent-browser --session "$session" snapshot -i
```

Use fresh observed selectors. The helper scrolls the target into view, measures distance, performs real eased mouse movement, checks the target again, then uses agent-browser's normal click with obstruction checks.
It calculates the shared distance-based duration and schedules about 60 movement steps per second.
Use it for each recorded click; `hover` performs the same approach without clicking.

For long-press and hold-to-confirm controls, use `press`. It approaches like
`click`, checks that no other element covers the target, then holds the primary
button for `--hold-ms` (default 1000):

```sh
node "$skill_dir/scripts/present.mjs" press --session "$session" \
  --selector '[data-testid="confirm"]' --hold-ms 1500
```

Choose a hold longer than the control's threshold. A press that lasts longer
than 370 ms switches the overlay to a held state: the cursor stays pressed and a
pulsing ring follows it until release, then the cursor rebounds. Short presses
keep the normal click effect.

Use `type` instead of `fill` for text that viewers should see being entered.
It clicks into the field, places the caret after existing text, and sends one
real keystroke every `--delay-ms` (default 150). `--clear` empties a selector
field first:

```sh
node "$skill_dir/scripts/present.mjs" type --session "$session" \
  --selector '[data-testid="search"]' --text 'kvmini status' --clear
```

The overlay shows each key in a keycap above the field's right edge and hides
it after 700 ms of inactivity. It shows nothing for password fields. ASCII
characters are real key presses; other text, such as CJK, is inserted without a
key event and is still shown. With a selector, `type` checks the final field
value and reports only the character count and timing, never the text. The
text still appears in the process arguments, so use throwaway credentials.
Keystrokes inside iframes are not shown.

Canvas and WebGL apps (Godot, Unity, video players) expose no DOM target. Use
coordinate mode instead, in the same top-document viewport space the overlay
draws in:

```sh
node "$skill_dir/scripts/present.mjs" click --session "$session" --x 480 --y 320
```

Measure the canvas once with `getBoundingClientRect`, keep the CSS scale at 1
(or convert points to page pixels), and verify one click before recording the
rest. `move`, `hover`, `press`, and `type` also accept `--x/--y`.

`step --hold-ms` (default 1000) keeps a label on screen long enough to read; use
`--hold-ms 0` for rapid-fire labels.
Use normal agent-browser commands for typing, scrolling, assertions, and other input.
The helper operates on top-document coordinates; return to the top frame before using it. Use an appropriate verified coordinate path for iframe targets rather than passing frame-local coordinates as top-level positions.

The overlay uses an expanding orange ring and cursor scaling `1 → 0.86 → 1.055 → 1` over 370 ms.
Translation and hotspot-centered scale use separate elements, so the effect stays aligned.
The ring expands and fades over 650 ms. The layer does not intercept input, alter layout, or enter accessibility snapshots.
Do not enable agent-browser's built-in `--cursor` at the same time. Disable captured OS cursor/click markers for external capture.
After full navigation, restore the label and pointer anchor.

## Record

The built-in page recorder is the default for browser recordings: it captures
the page itself, including the live overlay. It has fixed encoder quality in
agent-browser 0.38.2, so report that limit. Reserve a headed lossless display
master for evidence tier, as described in [Capture quality](capture-quality.md).

```sh
agent-browser --session "$session" record start "$recording_dir/take.mp4" --fps 60
# Perform labeled actions and check their results.
agent-browser --session "$session" --json record stop
```

Retain the stop receipt, including `frames` and `capturedFrames`. Stop recording before closing the session.
A recorder stall was observed after full reload in version 0.38.2: use separate takes around full navigation when using that version, reanchor/relabel, and explain any cut.
Join takes without changing cadence. Do not omit failed assertions from the findings.
Run the single-pass check, then look at the intro, one click, and the end state
for label readability and ring alignment:

```sh
node "$skill_dir/scripts/verify.mjs" \
  --video "$recording_dir/take.webm" \
  --receipt "$recording_dir/receipt.json"
```

## Speed up a wait

Keep the wait inside the take, then speed up only that segment afterwards.
Show the speed tag live beside the step label while the wait runs, and use the
times that `present.mjs speed` prints as the segment, so the tag is visible
exactly while the video plays faster. End the wait on the real state rather
than a fixed sleep. Write `t0` with `process.stdout.write`; `console.log` colors
numbers when `FORCE_COLOR` is set, which breaks shell arithmetic:

```sh
at() { node -e 'let s = ""; process.stdin.on("data", d => s += d)
  .on("end", () => process.stdout.write(String(JSON.parse(s).at)))'; }
agent-browser --session "$session" record start "$recording_dir/take.mp4" --fps 60
t0=$(node -e 'process.stdout.write(String(Date.now()))')
# ... labeled actions; the last one starts the wait ...
node "$skill_dir/scripts/present.mjs" step --session "$session" --text '等待设备同步时间' --hold-ms 0
sleep 0.7 # let the click ring finish at real speed
w0=$(node "$skill_dir/scripts/present.mjs" speed --session "$session" --factor 4 | at)
# Poll the real state (device, DOM) until the result appears, with a timeout.
w1=$(node "$skill_dir/scripts/present.mjs" speed --session "$session" --clear | at)
# Hold the result on screen at real speed before stopping.
agent-browser --session "$session" --json record stop > "$recording_dir/receipt.json"
segment=$(awk -v a=$((w0 - t0)) -v b=$((w1 - t0)) 'BEGIN { printf "%.2f-%.2fx4", a / 1000, b / 1000 }')
node "$skill_dir/scripts/speed.mjs" --input "$recording_dir/take.mp4" \
  --output "$recording_dir/take-fast.mp4" --no-marker --segment "$segment"
```

The offsets can be off by a frame or two, because the recorder starts around
the time `record start` returns. Extract a frame just inside each boundary and
confirm that the tag is visible inside the segment and absent outside it, and
that no user action falls inside it; adjust the seconds by hand when needed.
Choose the factor so the wait plays in about 2–4 s. Report the script's
`disclosure` lines with the video.

Sources: [agent-browser recording](https://agent-browser.dev/recording), [commands](https://agent-browser.dev/commands), and [versioned encoder source](https://github.com/vercel-labs/agent-browser/blob/v0.38.2/cli/src/native/recording.rs).
