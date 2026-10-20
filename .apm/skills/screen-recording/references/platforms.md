# Platform control and capture

## Inspect auv first for non-browser interfaces

Check the installed CLI and available tools before choosing an adapter:

```sh
auv --version
auv doctor --json
auv devices list --json
auv plugin list
auv invoke --help
auv invoke input.moveMouse --help
auv invoke input.clickPoint --help
```

In auv 0.0.20, native drivers target macOS, Windows, and Linux. Android and iOS native support is pending.
Use auv to operate an interactive emulator or mirroring window when that host path works.
If it cannot perform the required action, use an available platform controller and record why.
Browser interaction still uses agent-browser, including browser flows displayed on a desktop.

`--device-id` selects an auv desktop daemon, not an Android serial or iOS UDID.
Inspect `display.list`, `window.list`, captures, or UI information before input. For example:

```sh
auv --device-id "$host_id" invoke display.list --json
auv --device-id "$host_id" invoke window.list --json
auv --device-id "$host_id" invoke display.capture --json --no-overlay
auv --device-id "$host_id" invoke input.moveMouse "$x" "$y" --json --no-overlay
auv --device-id "$host_id" invoke input.clickPoint "$x" "$y" \
  --relative-to screen --button left --json --no-overlay
```

These move coordinates are logical screen coordinates. Respect the capture's scale and origin before converting pixels to input coordinates.
Recheck a target that moves during an approach. Assert that input reached the intended application.

`input.moveMouse` has no duration flag in this version. Do not invent one.
For smooth live motion, use supported timed intermediate moves through an available runner/API and measure the result.
Otherwise, reserve the calculated pre-click interval and render the presentation cursor from its recorded timeline afterward.
`overlay.cursor` and `overlay.status` are presentation APIs, not input; availability and easing differ by backend. Check their current help before use.
Auv run artifacts are traces, results, and screenshots; they are not a continuous video recorder.

## Select a platform path

| Target | Computer use | Capture |
| --- | --- | --- |
| macOS | auv native driver | ScreenCaptureKit window/display recorder, or FFmpeg AVFoundation; lossless RGB master where available |
| Windows | auv native driver; validate foreground/background input behavior | Windows.Graphics.Capture recorder, OBS, or FFmpeg `gdigrab`; request 60 fps and disable captured OS cursor when compositing |
| Linux Wayland | auv where the compositor is supported; current driver is incomplete and GNOME-first | ScreenCast portal/PipeWire recorder, such as OBS; verify negotiated cadence |
| Linux X11 | Current auv driver excludes X11; use an available desktop controller | OBS or FFmpeg `x11grab`, with 60 fps input and native geometry |
| Android emulator | auv on the interactive emulator window; otherwise explicit-target ADB or an available Android tool | Prefer scrcpy device stream; emulator recorder or ADB screenrecord when necessary |
| Android physical device | auv on an interactive scrcpy window; otherwise explicit-target ADB or an available Android tool | scrcpy device stream, with device timestamps; validate encoder quality and rate |
| iOS Simulator | auv on Simulator.app; otherwise an available simulator UI tool | `simctl io` recording or a high-quality host-window capture |
| iOS physical device | auv on verified interactive mirroring when supported; otherwise an authorized XCTest/XCUIAutomation/device tool | QuickTime device capture, native recording, or an available device recorder; measure actual cadence |

Choose a recorder that preserves the selected content without unrelated windows.
Host overlays do not appear in device-local video; use the offline compositor for that source.
QuickTime's connected-device preview is a viewing/recording surface. Do not assume a click on it injects a phone touch.
If no real control path exists, report the limitation rather than stage clicks over a passive mirror.

### Android

Select a serial from `adb devices -l`; use it consistently. Preserve native dimensions by omitting scrcpy's size cap:

```sh
scrcpy --serial "$serial" --record="$recording_dir/raw.mkv" \
  --max-fps=60 --video-bit-rate=32M --no-audio
```

32 Mbps is a starting preflight value, not a universal highest-quality setting. Inspect the device encoder and raise quality as supported for the resolution while retaining cadence.
`--max-fps=60` is a ceiling, not a guarantee. Retain device timestamps.
Keep scrcpy control enabled if auv operates that window. Use `--no-control` only when a different tool supplies input.
ADB screenrecord has no portable 60 fps switch and may impose duration or encoder limits; inspect device help.
Read current UI bounds for ADB taps and verify their result. Save and restore any changed `show_touches` or `pointer_location` settings; avoid duplicate touch markers.

### iOS

Select an explicit UDID with the installed simulator tools. Inspect current syntax before recording:

```sh
xcrun simctl io help
xcrun simctl io "$udid" recordVideo --codec=hevc "$recording_dir/raw.mov"
```

Current `recordVideo` exposes no frame-rate option. Wait for its recording-start confirmation and use SIGINT to finalize the owned recorder.
Use a verified host capture if the simulator recorder cannot meet 60 fps or quality needs.
For a physical device, confirm trust, mirroring interactivity, and any existing test-runner setup. Select the device explicitly.
Device-native capture can remain variable-rate or lossy; do not claim lossless source quality after re-encoding it.

## Sources

- [auv README and platform status](https://github.com/moeru-ai/auv#readme)
- [auv Linux driver](https://github.com/moeru-ai/auv/tree/main/crates/auv-driver-linux) and [Windows driver](https://github.com/moeru-ai/auv/tree/main/crates/auv-driver-windows)
- [FFmpeg device inputs](https://ffmpeg.org/ffmpeg-devices.html)
- [Windows.Graphics.Capture](https://learn.microsoft.com/en-us/windows/apps/develop/media-authoring-processing/screen-capture)
- [Wayland ScreenCast portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.ScreenCast.html)
- [OBS encoder presets](https://obsproject.com/kb/recording-encoder-presets-guide)
- [scrcpy video options](https://github.com/Genymobile/scrcpy/blob/master/doc/video.md) and [recording timestamps](https://github.com/Genymobile/scrcpy/blob/master/doc/recording.md)
- [Android emulator recording](https://developer.android.com/studio/run/emulator-record-screen) and [ADB screenrecord](https://developer.android.com/tools/adb#screenrecord)
- [Simulator recording](https://developer.apple.com/videos/play/wwdc2020/10647/), [QuickTime device capture](https://support.apple.com/guide/quicktime-player/record-a-movie-qtp356b55534/mac), and [XCUIAutomation](https://developer.apple.com/documentation/XCUIAutomation)
