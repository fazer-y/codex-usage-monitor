# Desktop Tray Usage Monitor Design

## Context

The current project is a zero-dependency Node.js Codex usage monitor. It reads
local Codex session JSONL files, summarizes token usage and rolling limits, and
renders CLI, hook, and watch output without network calls.

The next product step is a cross-platform graphical monitor that can stay
resident on Windows, macOS, and Ubuntu so users can inspect usage without
keeping a terminal watcher visible.

## Goals

1. Provide a resident system tray or menu bar app for Windows, macOS, and
   Ubuntu graphical desktops.
2. Show the same practical usage data as the CLI: model, reasoning effort,
   context fill, 5h and 7d limits, latest turn usage, session totals, cache hit
   rate, per-model cost, and API-equivalent cost.
3. Preserve the no-quota invariant: runtime code reads local files only and
   never calls OpenAI APIs, model endpoints, telemetry services, or price
   update services.
4. Reuse the existing Node.js parser, pricing, and formatting behavior instead
   of forking the data model.
5. Keep the first version focused on local monitoring, predictable startup, and
   clear failure states.

## Non-Goals

- Replacing the native Codex TUI footer.
- Sending usage data to a cloud service.
- Updating pricing from the network at runtime.
- Adding accounts, sync, auto-update, or a hosted dashboard.
- Guaranteeing a tray icon on Linux desktops that do not expose a tray or app
  indicator area.

## Approach Considered

### Recommended: Electron Tray App

Create a `desktop/` Electron app that owns the graphical shell and imports the
existing `lib/` modules for local summarization. Electron provides a stable tray
API across Windows notification areas, the macOS menu bar, and Linux desktop
tray environments.

Trade-off: package size is larger than native alternatives, but implementation
is direct because the current core is already Node.js/CommonJS.

### Tauri v2 Tray App

Use Tauri for a smaller binary and native shell. This is attractive long term,
but it would require either reimplementing the summarizer in Rust or bridging
back to Node.js, increasing first-version risk.

### Browser Panel Plus Background Process

Run a local server and let users inspect usage in a browser. This is simple and
portable, but it is less aligned with the requested resident desktop behavior
and still needs a separate process lifecycle.

## Selected Design

Build the first graphical version as an Electron system tray app under
`desktop/`.

The app starts hidden, creates a tray icon, and opens a compact usage panel when
the user clicks the tray icon. The right-click context menu provides Refresh,
Open Sessions Folder, Open Settings, and Quit.

On platforms or desktop sessions where a tray is unavailable, the app falls
back to opening the same panel as a regular desktop window. The monitor still
works in this mode; only the resident shell differs.

## User Experience

The panel is a compact operational view rather than a landing page. It should be
quick to scan during work:

- Header: active model, reasoning effort, plan type, latest update time.
- Limit rows: primary and secondary rolling limits with bars and reset text.
- Context row: latest input tokens over context window.
- Latest turn row: input, output, and reasoning output tokens.
- Session row: total input and output tokens, turn count, cache hit rate.
- Cost row: API-equivalent total and per-model breakdown.
- Status row: latest session path, parse warning count, and local-only badge.

Visual density should match the existing terminal output. The app should avoid
marketing copy and avoid decorative UI that slows repeated inspection.

## Architecture

```text
desktop/main.js
  Electron app lifecycle, tray, menu, BrowserWindow, polling timer

desktop/preload.js
  Secure IPC bridge exposed to the renderer

desktop/usage-service.js
  Local-only adapter around lib/session.js for latest summary snapshots

desktop/renderer/
  Static HTML, CSS, and browser JavaScript for the compact panel

lib/session.js, lib/pricing.js, lib/format.js
  Existing shared usage parser, pricing math, and formatting helpers
```

The Electron main process is the only process with Node filesystem access. The
renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and a
preload bridge that exposes a small API:

```js
window.codexUsageMonitor.getSnapshot()
window.codexUsageMonitor.refresh()
window.codexUsageMonitor.onSnapshot(callback)
```

The service returns plain JSON snapshots so the renderer does not depend on
Node internals.

## Data Flow

```text
Timer, tray click, or Refresh menu
  -> desktop/usage-service.js
  -> findLatestSessionFile(CODEX_HOME or ~/.codex)
  -> summarizeSessionFile(latestJsonl)
  -> normalize for renderer
  -> BrowserWindow webContents IPC
  -> renderer updates panel
```

All data comes from local Codex files under `CODEX_HOME` or the default
`~/.codex` path. No network module, fetch call, or OpenAI client belongs in the
desktop runtime.

## Settings

First-version settings are local process settings only:

- `CODEX_HOME`: override the Codex home directory, matching the CLI.
- `CODEX_USAGE_MONITOR_DESKTOP_INTERVAL_SECONDS`: polling interval, default 5.
- `CODEX_USAGE_MONITOR_MAX_BYTES`: maximum transcript size, matching the CLI.

The Settings menu item opens a small read-only settings view in the panel for
the first version. Editable persisted preferences can be added later.

## Error Handling

- No session files: show a waiting state with the resolved Codex home path.
- Missing or unreadable Codex home: show a local filesystem error and keep
  polling.
- Oversized transcript: show skipped-file status and keep polling.
- Malformed JSON lines: show the parsed summary plus parse warning count.
- Unknown model price: show token totals and approximate cost marker, matching
  CLI behavior.
- Tray unavailable: open a normal window and log a local warning.
- Renderer crash: recreate the panel on the next tray click.

Errors must not affect Codex CLI execution because the desktop app only reads
session files.

## Packaging

Use Electron for development and electron-builder for packaging scripts:

- Windows: NSIS installer and unpacked directory.
- macOS: DMG or ZIP during local development.
- Linux/Ubuntu: AppImage and deb package targets.

Signing, notarization, auto-update, and store distribution are out of scope for
the first version.

## Testing

Tests should stay layered:

1. Unit tests for `desktop/usage-service.js` using synthetic session fixtures.
2. Unit tests for snapshot normalization and local-only behavior.
3. Renderer tests for empty, normal, warning, and error states using static DOM
   fixtures where practical.
4. Electron smoke tests for app startup, tray/menu creation where the platform
   supports it, and panel IPC.
5. Existing CLI and hook tests must continue to pass.

Manual verification should include Windows, macOS, and Ubuntu graphical
sessions before claiming the cross-platform resident goal is complete.

## Security And Privacy

The desktop app must use Electron security defaults deliberately:

- `contextIsolation: true`
- `nodeIntegration: false`
- no remote module
- no runtime navigation to remote pages
- no telemetry
- no runtime network requests

The app reads local Codex session files and displays derived summaries on the
same machine. It does not write monitor output into Codex transcripts.

## Documentation

Update README with:

- Desktop tray app install and run commands.
- Explanation that the app reads local Codex files only and does not consume
  quota.
- Platform notes for Windows, macOS, and Ubuntu tray behavior.
- Troubleshooting for missing sessions, Linux tray availability, and unknown
  prices.

## References

- Electron Tray API: https://www.electronjs.org/docs/latest/api/tray
- Electron Tray tutorial: https://www.electronjs.org/docs/latest/tutorial/tray
- Electron security guidance: https://www.electronjs.org/docs/latest/tutorial/security
- Tauri system tray documentation: https://v2.tauri.app/learn/system-tray/
