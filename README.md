# LemonNeko Skills

Reusable agent skills for [Agent Package Manager (APM)](https://github.com/microsoft/apm).

| Skill | Purpose |
| --- | --- |
| [screen-recording](.apm/skills/screen-recording/SKILL.md) | Record UI flows with an eased cursor, click effects, action labels, and marked wait acceleration. |

## Install

Install APM with its [installation guide](https://microsoft.github.io/apm/getting-started/installation/).

For a project, run:

```sh
apm install LemonNekoGH/skills --skill screen-recording --target codex
```

For all your projects, run:

```sh
apm install --global LemonNekoGH/skills --skill screen-recording --target codex
```

Replace `codex` with your agent target, such as `claude`, `cursor`, or `copilot`.
APM also accepts multiple targets, such as `--target codex,claude`.

These commands follow the [APM installation reference](https://microsoft.github.io/apm/reference/cli/install/).

## Screen recording

The skill contains its cursor asset, browser overlay, scripts, and platform references.

The bundled cursor is a personal default. We recommend using your own cursor image for your recordings.
Pass `--cursor /path/to/cursor.png` to `present.mjs init` or `render-recording.mjs`.

Install the tools for your recording workflow:

- Node.js 20 or later for the helpers and compositor.
- FFmpeg and ffprobe for video processing and verification.
- [agent-browser](https://agent-browser.dev/) for browser control and capture.
- [auv](https://github.com/moeru-ai/auv) for native app control where supported, or another available platform controller.

The JavaScript tools use only the [Node.js standard library](https://nodejs.org/api/). No npm packages are required.
The compositor requires FFmpeg with the `drawtext`, `ass`, and `libx264rgb` components.
Device recordings also require the platform tools described in the skill.
APM installs the skill files. It does not install these external tools.

After installation, ask your agent:

```text
Use $screen-recording to record this UI flow with action labels and click effects.
```

## Development

Run the compositor tests with Node.js and FFmpeg/ffprobe installed:

```sh
node --test tests/render-recording.test.mjs
```

## License

[MIT](LICENSE).
