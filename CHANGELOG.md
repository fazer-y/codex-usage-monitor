# Changelog

## 0.3.0 - 2026-10-22

- Replace Electron with a native WPF window and vector controls.
- Reuse an installed Node.js 24.5+ runtime and remove bundled Chromium and Node.js.
- Preserve titlebar docking, responsive metrics, folding, themes, languages, and Codex lifecycle.
- Move commands into a right-click menu and remove taskbar and system-tray icons.
- Center vector icons on fixed canvases and keep chevrons stationary while rotating.
- Replace the system scrollbar with a slim rounded details scrollbar.
- Use translucent backgrounds while keeping text and icons opaque.
- Display Fast Mode with a lightning icon after reasoning effort.
- Persist parsed sessions across restarts and expire caches after one week without access.
- Retain incremental parsing state, usage deduplication, and in-flight tool timing in each cache.
- Keep up to 64 parsed conversations in memory and debounce cache writes.
- Refresh on log changes with a 15-second metadata fallback.

## 0.2.1 - 2026-10-21

- Replace hiding with a small right-side tab that restores the strip in one click.
- Free the titlebar by shrinking the native window to the tab's bounds.
- Keep folded tabs attached during window movement, resizing, and minimization.
- Restore the latest conversation statistics and preserve the full strip position.
- Skip hidden metric rendering while folded.
- Add a copyable installation prompt for coding agents to both READMEs.
- Bundle a local MCP server and a Codex plugin installer that reuses the installed application.
- Manage strip lifetime through Codex host detection and MCP connections.
- Install the app, shortcuts, and Codex connection in one operation.
- Check official Standard API prices once at startup and retain cached rates offline.
- Reprice existing conversations from request-tier subtotals without rereading logs.
- Remove manual setup wrappers and the unused full-file CLI parser.
- Follow Codex's language setting for the strip, details, controls, and tray menu.
- Adapt metric visibility to available space across supported UI languages.
- Find conversation-selection logs in both ordinary and Windows Store data folders.

## 0.2.0 - 2026-10-21

- Add a frameless desktop strip with Windows docking and conversation following.
- Read session updates incrementally and support historical logs above 50 MiB.
- Show full model names, reasoning effort, current-turn steps, tool calls, duration, first-token latency, and throughput.
- Adapt strip width and metric priority to the Codex titlebar.
- Exclude tool waits from request-based throughput estimates.
- Read local Codex appearance settings when entering a conversation.
- Collapse details three seconds after focus leaves.
- Ship a Windows ZIP and installer with desktop and Start menu shortcuts.
- Remove terminal, tmux, and hook entrypoints from the desktop distribution.
- Refresh API prices on 2026-10-21 and separate input, cache reads, cache writes, and output costs.
- Add a Chinese README and desktop regression coverage.

## 0.1.0 - 2026-06-30

- Initial public release.
- Add Codex JSONL session parser.
- Add model, reasoning effort, token, context, cache, rate-limit, and cost
  summaries.
- Add `summary`, `statusline`, `json`, `watch`, and `doctor` CLI commands.
- Add Codex Stop hook entrypoint.
- Add zero-dependency Node test suite.
