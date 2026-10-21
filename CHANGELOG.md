# Changelog

## 0.2.1 - 2026-10-21

- Replace hiding with a small right-side tab that restores the strip in one click.
- Free the titlebar by shrinking the native window to the tab's bounds.
- Keep folded tabs attached during window movement, resizing, and minimization.
- Restore the latest conversation statistics and preserve the full strip position.
- Skip hidden metric rendering while folded.
- Add a copyable installation prompt for coding agents to both READMEs.
- Bundle a local MCP server and a Codex plugin installer that reuses the installed application.
- Manage strip lifetime through Codex host detection and MCP connections.

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
