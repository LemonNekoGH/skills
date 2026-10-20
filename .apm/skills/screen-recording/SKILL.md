---
name: screen-recording
description: Record UI acceptance tests and walkthroughs across browsers, Android and iOS simulators or physical devices, and macOS, Windows, and Linux. Use for polished recordings with a custom cursor, eased movement, click effects, and visible action labels.
---

# Screen Recording

Record real interactions at **60 fps**, native resolution, and the best quality
the target actually supports. Use **agent-browser for browser interaction**; for
other interfaces **prefer auv for computer use**. Choose the recorder
independently from the controller.

## Choose the tier

Pick the smallest tier that answers the question. Do not spend evidence-tier
effort on a demo-tier question.

- **Demo** (default for walkthroughs and "show me it works"): one continuous
  take with the live overlay, then a single-pass check with
  `scripts/verify.mjs`. Do not preflight every segment and do not frame-by-frame
  audit a UI demo.
- **Evidence** (acceptance tests, bug evidence, device quirks, anything that
  will be quoted as proof): preflight the recorder, keep a lossless master when
  a page-capturing lossless recorder is available, and inspect motion and click
  frames as described in [Capture quality](references/capture-quality.md).

## Keep takes short

A recording shows a result; it should not outlast the job. Aim for well under
20 s.

- Prefer demonstration work that finishes in a few seconds. If a demo is
  yours to write, make the job short.
- **Never block a take on a long-running job.** Show the behavior (progress,
  responsiveness, state change), then stop or cancel. State what you did not
  wait for instead of sitting through a 15 s computation.
- **Speed up waits instead of cutting them.** When the result needs a short
  wait that you cannot avoid (a service starting, a clock syncing), record it
  in real time, then play only that segment faster with `scripts/speed.mjs`:
  a 12 s wait at `×4` plays in 3 s. Mark the segment with a `×N` tag: browser
  takes show it live beside the step label (`present.mjs speed`), and other
  recordings use the marker that `speed.mjs` draws. Repeat the script's
  `disclosure` line when you deliver. Speed up the
  wait, not the user's actions, and keep the original take. Evidence tier
  delivers the real-time take; a sped-up copy may accompany it. A cut is
  acceptable when you describe it. Never fake a passing assertion by speeding
  up the result.
- One take is usually enough. Re-take only for a real defect (unreadable label,
  missed click), not for polish.

## Choose the workflow

- Browsers: [Browser workflow](references/browser.md). Live overlay plus
  agent-browser input and the built-in recorder.
- Native apps, simulators, and physical devices:
  [Platform control and capture](references/platforms.md).
- Post-composited presentation without a live browser overlay:
  [Presentation and event timing](references/presentation.md) plus
  `scripts/render-recording.mjs`.

The shared presentation uses the bundled cursor, distance-based eased movement,
an expanding click ring, a cursor shrink and rebound, a held state for long
presses, per-keystroke typing with a keycap beside the field (hidden for
passwords), and short action labels.
The bundled cursor is `assets/cursor.png`. Its logical size is 32 × 32 with
hotspot `(0, 0)`. The helpers resolve this asset relative to the skill directory.

## Prepare and record

1. Identify the flow and the one result that must be visible.
2. Select the exact browser session, host, simulator, or device. Record its
   geometry.
3. Plan short labels in the user's language. Label before the action; label a
   success only after checking it, and label a simulated failure explicitly.
4. Preflight once per recorder and host, not per take. Demo tier may skip it
   when the same recorder already worked in this session.
5. Perform real input. After each meaningful action, check the application
   state (logs, DOM, device state), not only the pixels.
6. Finalize gracefully and verify with `scripts/verify.mjs`.

Pointer travel time comes from distance:

`durationMs = clamp(120 + 25 × sqrt(distanceInLogicalPixels), 240, 1200)`

Use about 60 movement updates per second, finish the approach before the click,
and center the ring on the real input position. Keep labels clear of the
controls under test. Use one pointer/effect layer.

## Verify and deliver

Run the single-pass check:

```sh
node "$skill_dir/scripts/verify.mjs" \
  --video "$recording_dir/take.webm" \
  --receipt "$recording_dir/receipt.json"
```

It confirms the video stream, native dimensions, a full decode, and the
agent-browser `capturedFrames` receipt. `--cadence` adds frame-timestamp deltas;
treat those as informational, because muxer timestamps are not independent
proof that the application painted at 60 fps. For a sped-up copy, check the
original take with its receipt and the copy without one; the receipt counts
only the original.

For demo tier, look at a few frames (intro, one click, the end state) and
deliver. Escalate to [Capture quality](references/capture-quality.md) only when
the recording is evidence, the target is a device, or cadence is genuinely in
doubt.

Report the video, what passed, defects, the encoder/quality limit, and what you
did not test. Preserve the original capture; a compatibility transcode is a
lossy copy, so do not call it lossless. Keep presentation assets and recordings
outside application source. Do not modify application behavior to manufacture a
passing demo. Restore settings changed for the task and close only task-owned
sessions and recorders.

Deliver the video, passed checks, defects, and relevant untested scope. When
attachments are requested in Lody, read and use the current Lody upload tool
description.
