# Presentation and event timing

Use the live helper for browser recordings; this reference is the
post-composite path and browser recordings do not need it. For native/device
captures without a suitable live overlay, composite the same presentation with
`scripts/render-recording.mjs`.
The renderer uses the Node.js standard library and FFmpeg/ffprobe with `drawtext`, `ass`, and `libx264rgb`. It requires no npm packages.
It sends no input.
It keeps source cadence and copies source audio into a new lossless RGB-encoded MKV.
This preserves the decoded capture during compositing; it cannot restore detail lost by a device encoder.
The bundled compositor targets SDR, 8-bit recordings. Use a compatible high-bit-depth workflow for HDR sources instead of silently reducing them.

## Collect real events

Record the target, capture dimensions, input coordinate space, scale, crop origin, rotation, and capture-start synchronization marker.
Map each input position to source video pixels before writing the timeline.
For a mirrored device, account for the content rectangle and letterboxing; host window coordinates are not device coordinates.
Confirm the mapping at several observed targets, including near the edges.

Use a monotonic clock for local action intervals and align it to the recorder's presentation timestamps with a visible synchronization event.
For remote hosts, align clocks or correlate a marker in the captured frames. Auv trace timestamps use wall-clock time; do not assume they equal recorder time or the local tool-return time.
Log input dispatch and observed state changes separately. Align a click effect to the real press/tap frame, not the later tool completion receipt.

Before input, calculate travel duration using the formula in SKILL.md and allow that interval before clicking.
On a touch interface, show only a presentation cursor during the interval, then send the real tap at the target.
For post-composited pointer travel, record the actual reserved interval. Do not compress idle time or move the click backward to fit an ideal animation. To shorten a wait in a finished take, speed up that segment with `scripts/speed.mjs` (see SKILL.md), which marks it with `×N`.
When the actual cursor path itself matters, retain its measured path or use the live recording; the endpoint-based renderer is an illustrative presentation path.
Keep the unmodified capture and event log alongside the presentation output.

## Timeline format

All coordinates are source video pixels; `t` is seconds from the first video frame. Normalize rotation and timestamp origin before mapping events.
`logical_scale` is captured pixels per logical display unit, independent of the input-to-video coordinate transform.
For an Android recording at native resolution, derive it from the effective display density divided by 160; account for any capture scaling. For desktop/Simulator captures, use the observed backing scale and capture transform.
ADB tap coordinates can match scrcpy pixels on a high-density phone while `logical_scale` is still greater than 1. Use 1 only for a confirmed 1× presentation scale.
Events must be chronological. Moves cannot overlap or jump between endpoints. Clicks must occur after the approach and match its endpoint.

```json
{
  "logical_scale": 1,
  "initial_pointer": [24, 24],
  "events": [
    {"type": "step", "t": 0, "text": "打开设置"},
    {"type": "move", "t": 0.5, "duration_ms": 650, "from": [24, 24], "to": [400, 200]},
    {"type": "click", "t": 1.2, "at": [400, 200]},
    {"type": "step", "t": 1.8, "text": "已显示设置页面"}
  ]
}
```

This is a schema example, not an event log to reuse. Replace positions and timestamps with recorded values.
`duration_ms` is the actual recorded approach interval; the renderer prints a recommended duration for comparison but does not retime evidence.
`initial_pointer` defaults to the first move's origin; click-only timelines require it explicitly.
Each step persists until the next step or the end. An empty `text` clears the label.
Use short labels that fit the captured frame; if a top label covers a target, choose a live layout or reserve a suitable caption area before capture.

## Render and inspect

```sh
node "$skill_dir/scripts/render-recording.mjs" \
  "$recording_dir/raw.mkv" "$recording_dir/events.json" \
  "$recording_dir/master.mkv" \
  --cursor-size 32 --hotspot-x 0 --hotspot-y 0 \
  --font "$label_font"
```

Use mise-managed Node.js 20 or later where applicable.
Select an existing font with glyphs for the label language.
If Fontconfig selects a suitable font, `--font` is optional.
The cursor size and hotspot options use displayed video pixels. For a 2× capture, use size 64 and scale the hotspot accordingly; set `logical_scale` to 2 for labels, ring size, and duration calculations.
The packaged cursor hotspot remains `(0, 0)` at every scale.

The renderer defaults to `--expected-fps 60`. It rejects a different reported source average rather than resampling.
For a documented 59.94 fps or lower-rate fallback, pass the measured average explicitly and state that rate in delivery.
This metadata check does not prove true motion cadence or constant frame timing; inspect source and output frames using [Capture quality](capture-quality.md).
The renderer evaluates smooth motion at source frame times. It cannot make a 30 fps source genuinely 60 fps.

Inspect approach, press, ring expansion, and rebound frames for alignment. Verify labels, audio synchronization, frame count, timestamps, and full decoding.
Present the result as an annotated recording when effects were composited afterward.

Sources: [FFmpeg overlay/drawtext/ASS filters](https://ffmpeg.org/ffmpeg-filters.html), [auv trace clock](https://github.com/moeru-ai/auv/blob/989d60d929c0aee442bd27bbf4a58c53dee38e38/crates/auv-tracing/src/dispatch.rs).
