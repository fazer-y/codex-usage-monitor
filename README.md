# codex-usage-monitor

> A zero-dependency Codex CLI monitor for token usage, active model, reasoning
> effort, context fill, cache hit rate, rolling limits, and API-equivalent cost.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-43853d.svg)](package.json)

## What it shows

Compact statusline:

```text
GPT-5.4 mini | think medium | ctx ##--- 12% (1.2k/10k) | 5h ##--- 42% (4h 59m) | 7d #---- 15% (6d 23h) | turn in 1.2k out 200 reason 110 | Σ in 2.2k out 300 | cache ###-- 50% | API≈$0.0032
```

Stop-hook box after a Codex turn:

```text
+ codex-usage-monitor ------------------------------------------+
| Model      GPT-5.4 mini  think medium  prolite                |
| Limits     5h #####------- 42% (4h 59m)  |  7d ##---------- 15% |
| Context    ctx #----------- 12% (1.2k/10k)                    |
| This turn  turn in 1.2k out 200 reason 110                    |
| Session    2.2k in  300 out  2 turns  cache 40.9%             |
| Models     GPT-5.5 $0.0027  |  GPT-5.4 mini $0.0006          |
| Cost       API≈$0.0032                                       |
+---------------------------------------------------------------+
```

## Features

- Reads Codex CLI session JSONL files from `~/.codex/sessions`.
- Supports Codex `Stop` hooks through the bundled `hooks/hooks.json`.
- Shows the active model and reasoning effort from `turn_context` records.
- Shows latest-turn and session-total token usage from `token_count` events.
- Computes cache hit rate from `cached_input_tokens / input_tokens`.
- Shows context fill as latest request input tokens over `model_context_window`.
- Shows Codex primary and secondary rolling limits when present.
- Estimates API-equivalent cost from a bundled OpenAI pricing table.
- Breaks cost down by model when a session uses multiple models.
- Provides `summary`, `statusline`, `json`, `watch`, and `doctor` commands.
- Provides an Electron desktop tray app for graphical Windows, macOS, and
  Ubuntu sessions.
- Keeps the CLI/plugin runtime on Node.js built-ins with no install step beyond
  cloning the repo.
- Keeps all data local. No telemetry, no network calls at runtime.

## Recommended Usage

### After Each Codex Turn

Install the plugin and restart Codex. The bundled Stop hook prints a colored
usage box after each completed turn. It does not replace the native Codex
footer. Because some Codex surfaces capture hook stdout and stderr, the hook
also tries to write directly to the active terminal (`CONOUT$` on Windows,
`/dev/tty` on Linux and macOS).

### While Codex Is Working

The bundled `PostToolUse` hook can print the same monitor while Codex is still
working. It runs after tool calls and is throttled to once every 300 seconds by
default:

```bash
CODEX_USAGE_MONITOR_WORK_INTERVAL_SECONDS=300
```

Set the value to `0` to show after every tool call, or use a larger number for
less frequent updates.

### During Long Tasks

Run the watcher in another terminal, split pane, or tmux pane:

```bash
codex-usage-monitor watch --interval 60
```

PowerShell:

```powershell
codex-usage-monitor watch --interval 60
```

Bash, Ubuntu, macOS, or tmux:

```bash
codex-usage-monitor watch --interval 60
```

### Quota Impact

The Stop hook and watcher do not consume model quota. They read local Codex
session JSONL files, perform local formatting, and do not make network or model
calls.

## Desktop Tray App

The desktop app runs as an Electron tray or menu bar monitor on Windows, macOS,
and Ubuntu graphical desktops. It starts hidden when the platform tray is
available; click the tray icon to open the compact usage panel. On Linux
desktop sessions without a tray or app indicator area, the same panel opens as
a normal window.

Install development dependencies and start the desktop app:

```bash
npm install
npm run desktop
```

Package local installers for the current platform:

```bash
npm run desktop:package
```

The desktop app does not consume model quota. It reads local Codex session JSONL
files from `CODEX_HOME` or `~/.codex`, summarizes them on the same machine, and
does not call OpenAI APIs, model endpoints, telemetry services, or runtime price
update services.

Desktop environment variables:

| Variable | Effect |
| --- | --- |
| `CODEX_USAGE_MONITOR_DESKTOP_INTERVAL_SECONDS=N` | Refresh the desktop snapshot every `N` seconds. Default: 5. |
| `CODEX_HOME=PATH` | Read Codex sessions from a custom home directory. |

## Install

Clone the repo:

```bash
git clone https://github.com/harveyxiacn/codex-usage-monitor.git ~/.codex/plugins/codex-usage-monitor
```

Run it manually:

```bash
node ~/.codex/plugins/codex-usage-monitor/bin/codex-usage-monitor.js summary
node ~/.codex/plugins/codex-usage-monitor/bin/codex-usage-monitor.js statusline
node ~/.codex/plugins/codex-usage-monitor/bin/codex-usage-monitor.js watch
```

On Windows, use an absolute path:

```powershell
node C:\Users\YourName\.codex\plugins\codex-usage-monitor\bin\codex-usage-monitor.js summary
```

## Codex Hook Setup

The plugin includes `hooks/hooks.json`, which runs `bin/on-stop.js` after
Codex `Stop` events. The hook writes machine-readable JSON to stdout and the
human summary box to stderr, so it stays compatible with Codex hook output.

If you install it as a Codex plugin, the hook bundle is already included.
For a direct config install, add this to your Codex config:

```toml
[[hooks.Stop]]
matcher = "*"

[[hooks.Stop.hooks]]
type = "command"
command = "node C:/Users/YourName/.codex/plugins/codex-usage-monitor/bin/on-stop.js"
timeout = 30
```

Restart Codex after changing plugin or hook config.

## CLI

```bash
codex-usage-monitor summary [--file session.jsonl]
codex-usage-monitor statusline [--file session.jsonl]
codex-usage-monitor json [--file session.jsonl]
codex-usage-monitor watch [--interval 5]
codex-usage-monitor doctor
```

Options:

| Option | Effect |
| --- | --- |
| `--file PATH` | Read a specific Codex session JSONL file. |
| `--codex-home PATH` | Override `CODEX_HOME` / `~/.codex`. |
| `--ascii` | Use ASCII progress bars. |
| `--no-color` | Disable ANSI color. |

Environment variables:

| Variable | Effect |
| --- | --- |
| `CODEX_USAGE_MONITOR_ASCII=1` | Use ASCII bars in all output. |
| `CODEX_USAGE_MONITOR_NO_COLOR=1` | Disable ANSI colors. |
| `CODEX_USAGE_MONITOR_QUIET=1` | Silence the Stop-hook summary box. |
| `CODEX_USAGE_MONITOR_HOOK_INTERVAL_SECONDS=N` | Show the Stop-hook box at most once every `N` seconds. Unset means every turn. |
| `CODEX_USAGE_MONITOR_WORK_INTERVAL_SECONDS=N` | Show the work-in-progress hook box at most once every `N` seconds. Default: 300. |
| `CODEX_USAGE_MONITOR_DESKTOP_INTERVAL_SECONDS=N` | Refresh the desktop tray app at most once every `N` seconds. Default: 5. |
| `CODEX_USAGE_MONITOR_DIRECT_TTY=0` | Disable direct terminal writes from hooks. |
| `CODEX_USAGE_MONITOR_MAX_BYTES=N` | Skip transcript files larger than `N` bytes. Default: 50 MB. |

## Pricing Notes

`API≈` means API-equivalent dollars, not your Codex subscription bill. The
pricing table lives in `lib/pricing.js` and was checked against the OpenAI API
pricing page on 2026-06-30. Pricing can change, so update the table when OpenAI
changes model prices.

The current cost formula is:

```text
uncached_input_tokens * input_rate
+ cached_input_tokens * cached_input_rate
+ output_tokens * output_rate
```

Unknown models are not treated as free. If any model in the session is missing
from the pricing table, the monitor marks the total as approximate with `~`.

## How It Works

Codex session logs contain records like:

- `session_meta`: session id, cwd, CLI version.
- `turn_context`: model, reasoning effort, context window.
- `event_msg` with `type: "token_count"`: latest and cumulative token usage,
  rolling limits, plan type.

The monitor reads those records locally, keeps the latest total usage snapshot,
sums per-turn usage into per-model buckets, then renders either a single line,
a box, or JSON.

See [docs/DESIGN.md](docs/DESIGN.md) for the full architecture.

## Tests

```bash
npm test
```

The suite covers:

- OpenAI pricing and unknown-model handling.
- Codex JSONL summarization.
- Formatter output for statusline and Stop-hook box.
- CLI and hook subprocess behavior.

## Sources

- Codex hooks documentation: https://developers.openai.com/codex/hooks
- Codex plugin documentation: https://developers.openai.com/codex/plugins/build
- OpenAI API pricing: https://developers.openai.com/api/docs/pricing

## License

MIT. See [LICENSE](LICENSE).
