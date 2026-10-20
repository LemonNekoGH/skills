# Capture quality and frame cadence

## Choose the source

Use the controller selected in SKILL.md and choose the recorder independently.
The default target is 60 fps at native resolution.

For desktops, prefer a recorder with a lossless RGB master. For device streams, select the highest supported encoder quality that retains the intended cadence. Preserve native dimensions and source timestamps.
Record a moving preflight: display refresh rate, device encoder, mirror stream, and recorder can each limit actual cadence.
See [Platform control and capture](platforms.md) for platform choices and source limitations.

### Browser recorder limits

The installed agent-browser 0.38.2 recorder captures PNG frames, then encodes them to YUV 4:2:0 video.
Its MP4 path uses `libx264` with the `ultrafast` preset and no explicit CRF option.
Its WebM path uses VP8 with CRF 18 and an 8 Mbps bitrate setting.
The CLI exposes no lossless or encoder-quality option.
These are version-specific facts: inspect the installed version before relying on them.
See the [tagged recorder source](https://github.com/vercel-labs/agent-browser/blob/v0.38.2/cli/src/native/recording.rs).

`AGENT_BROWSER_STREAM_QUALITY` controls streaming, not this recording path.
Changing a screenshot quality option does not change the recorder's PNG source.
Re-encoding an existing lossy recording cannot restore its lost detail.

When a recorder can capture the target losslessly, keep its RGB master:
preserve original dimensions and timestamps, and do not upscale, interpolate, or
reduce chroma. When the only page recorder is the built-in one, that output is
the correct source; keep it, report the encoder limit rather than calling it
lossless, and do not substitute a whole-display capture that adds unrelated
windows and chrome.
Do not replace the FFmpeg executable, add a shim, or patch agent-browser to override fixed encoder options.

## macOS lossless capture

Select the intended display and frame the target application before capture. For browsers, use a headed session and the presentation overlay.
For a window-specific capture, use an available ScreenCaptureKit recorder with a window filter.
AVFoundation captures a display, so arrange the view to exclude unrelated windows and notifications.

Enumerate devices instead of guessing an index:

```sh
ffmpeg -hide_banner -f avfoundation -list_devices true -i ''
```

This listing command can return a nonzero status after printing devices.
Set `screen_index` to the observed display index. Make a short preflight recording:

```sh
ffmpeg -hide_banner -nostdin \
  -f avfoundation -framerate 60 -pixel_format bgr0 \
  -capture_cursor 0 -capture_mouse_clicks 0 \
  -i "${screen_index}:none" \
  -an -c:v libx264rgb -crf 0 -preset ultrafast \
  -pix_fmt bgr0 -fps_mode passthrough \
  -t 5 "$recording_dir/preflight.mkv"
```

This is a preflight recipe, not a guarantee that each host supports its requested format and rate.
Inspect FFmpeg's input log for the actual pixel format, dimensions, and timestamps.
If the device substitutes a different pixel format, account for that conversion before calling the master lossless RGB.
Use the platform's existing screen-recording permission flow when required.

Run a continuously moving cursor or frame counter during preflight.
Verify its cadence before recording the full flow. Remove the five-second limit for the actual take.
Keep the process ID and stop that process gracefully with SIGINT to finalize the file.

`ultrafast` reduces encoder load. With CRF 0, it changes compression efficiency rather than lossless reconstruction.
Keep the lossless master. Create a separate compatible MP4 only when the viewer requires one:

```sh
ffmpeg -i "$recording_dir/master.mkv" \
  -c:v libx264 -crf 10 -preset slow -pix_fmt yuv420p \
  -fps_mode passthrough -movflags +faststart \
  "$recording_dir/delivery.mp4"
```

This delivery copy is lossy. Do not describe it as the lossless master.
For labels or joins, work from the master and avoid repeated lossy exports.
Keep the original capture when the built-in recorder already contains all required labels and effects.

Sources: [AVFoundation input](https://ffmpeg.org/ffmpeg-devices.html#avfoundation),
[libx264 and libx264rgb](https://ffmpeg.org/ffmpeg-codecs.html#libx264_002c-libx264rgb),
[ScreenCaptureKit capture](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos).

## Verify the actual output

One command confirms the stream and decodes the entire file:

```sh
node "$skill_dir/scripts/verify.mjs" --video "$video" [--receipt "$recording_dir/receipt.json"]
```

For the agent-browser built-in recorder, the stop receipt's `frames` and
`capturedFrames` are the primary cadence signal. The recorder can hold the last
Chrome frame between repaints, and the whole-clip ratio is misleading because
deliberate reading pauses contain static frames. A much lower `capturedFrames`
than `frames` means the application did not paint throughout the take.
See the [official frame-rate explanation](https://agent-browser.dev/recording).

Frame timestamp deltas (`ffprobe -show_frames ... best_effort_timestamp_time`)
are informational only: the muxer writes them, so they cannot prove that the
application painted at 60 fps. `verify.mjs --cadence` summarizes them; never
present them as native-cadence proof.

Evidence tier only: inspect a short interval of sustained cursor movement at
original resolution. Extract frames without interpolation or rate conversion:

```sh
mkdir -p "$recording_dir/motion-frames"
ffmpeg -ss "$motion_start" -i "$video" -t 0.7 \
  -fps_mode passthrough "$recording_dir/motion-frames/%04d.png"
```

Track the cursor hotspot between consecutive frames, and inspect the click
effect for hotspot drift, duplicate pointers, and abrupt scale changes.
For post-composited cursors, also inspect a continuously changing area of the
original application capture; overlay motion alone cannot prove source cadence.
Do not count compression noise, blinking carets, or unrelated animations as
cursor movement.

Never use output `-r 60`, an `fps` filter, or motion interpolation as proof of
native capture cadence.
