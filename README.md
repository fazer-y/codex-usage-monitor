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

## Continuous bottom monitor (recommended)

Codex CLI 0.160.1 has an official `/statusline` picker and `tui.status_line`
for built-in footer item IDs (model, context, limits, token counters, etc.).
There is no documented custom-command footer interface for adding cache hit
rate and API-equivalent cost. This project therefore uses a **separate bottom
tmux pane in the same terminal**, leaving Codex's input in its original pane.
A one-shot `statusline` or Stop-hook summary is not a persistent footer.

On the machine running Codex, inside its tmux window:

```bash
codex-usage-monitor pane --file /absolute/path/to/current-session.jsonl
codex-usage-monitor config --style detailed --interval 2
codex-usage-monitor preview --file /absolute/path/to/current-session.jsonl
```

When invoked by Codex, `pane` can locate `CODEX_THREAD_ID` automatically.
Outside Codex, supply `--file` explicitly. It never silently selects a historical
session for the pane. Repeated `pane` calls reuse the existing monitor.
Select the monitor and press `q` or Ctrl-C to close it. Codex keeps running.

Styles: `classic`, `minimal` (no bars), `compact` (short bars),
`detailed` (extra request detail), `ascii` (ASCII bars, no color), and
`mono` (no color). Preview uses local data, not invented usage.
Live panes reload configuration every tick. CLI flags override environment
variables, which override the saved config, then defaults.

Config: `~/.config/codex-usage-monitor/config.json`, overridable with
`CODEX_USAGE_MONITOR_CONFIG`. Each update backs up the prior file as
`config.json.bak-TIMESTAMP-PID`. Invalid config is preserved, never overwritten.
Environment overrides: `CODEX_USAGE_MONITOR_STYLE` and
`CODEX_USAGE_MONITOR_INTERVAL` (1–3600 seconds).

Standalone `watch --interval 5` stays alive and emits newline-separated
snapshots when redirected. For a persistent terminal display, use `pane`;
`watch --pane` owns its dedicated terminal screen and must not be injected into
Codex's input pane. Output is clipped to pane dimensions and terminal control
characters from session data are removed.

The header displays refresh time/counter and the last transcript update time.
Quota data is the most recent Codex log snapshot, not a live server query;
a passed reset time does not imply that the server has refreshed the quota.
No API requests, authentication reads or model quota are needed.

### Oracle / Windows workflow

Keep source and project tests in `E:\\Project\\codex-usage-monitor`.
Deploy only `bin/codex-usage-monitor.js` and `lib/{config,format,pane,pricing,session}.js`
to Oracle's current user's runtime directory (for example
`~/.local/share/codex-usage-monitor`), with a launcher in `~/.local/bin`.
Preserve existing runtime/config backups before replacement.
Do not deploy Windows session history, Electron, node_modules, hooks or credentials.
The monitor reads sessions on the machine where it runs; for harvey on Oracle,
that is harvey's own `~/.codex/sessions` (or `CODEX_HOME`).

### Optional after-turn summaries

The existing Stop/PostToolUse hooks remain optional summaries. They do not
implement a persistent footer. Keep direct TTY writes disabled to avoid
overlapping Codex input. The tmux workflow does not install these hooks.

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

Package an unpacked desktop app for the current platform:

```bash
npm run desktop:package
```

Build installer artifacts for the current platform when your environment has
the required signing and packaging privileges:

```bash
npm run desktop:dist
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
| `CODEX_USAGE_MONITOR_DIRECT_TTY=1` | Enable direct terminal writes from hooks when hook stderr is hidden. Off by default to avoid overlapping Codex terminal input. |
| `CODEX_USAGE_MONITOR_MAX_BYTES=N` | Skip transcript files larger than `N` bytes. Default: 50 MB. |

## Pricing Notes

Every cost is labeled **API 等价估算** (API-equivalent estimate), using
**Standard API** text-token prices verified 2026-10-08, not the subscription bill.
Rates and sources are in `lib/pricing.js` and [docs/MONITOR.md](docs/MONITOR.md).

Only exact, explicitly verified model IDs are priced. Unknown IDs, provider
prefixes, undocumented snapshots, missing usage, or ambiguous cumulative gaps
display **不可估算** (unavailable), with JSON `usd: null`. Known-model subtotals
remain available as `knownUsd`; they are never presented as a complete total.

Cached reads are separated from uncached input; cache writes are priced when
reported and supported. Reasoning tokens are already included in output and
are not billed twice. GPT-6 request-level long-context multipliers are applied
above 272k input tokens. GPT-5.4/5.5 long-context session repricing is conservatively
unavailable. Fast-mode premiums, regions and tool charges are excluded.

## How It Works

Codex session logs contain records like:

- `session_meta`: session id, cwd, CLI version.
- `turn_context`: model, reasoning effort, context window.
- `event_msg` with `type: "token_count"`: latest and cumulative token usage,
  rolling limits, plan type.

The monitor reads those records locally, keeps the latest total usage snapshot,
uses cumulative high-water deltas (deduplicating repeated events) in per-model buckets, then renders either a single line,
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
