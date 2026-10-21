# Codex Usage Monitor

[简体中文](README.zh-CN.md)

A compact statistics strip for the Codex desktop app on Windows.

## Features

- Follows the current conversation, including existing chats.
- Docks inside the titlebar and follows window movement, resizing, and minimization.
- Shows the full model name, reasoning effort, throughput, cache hits, context, tokens, steps, and turns.
- Adds tool counts, timing, and API-equivalent cost as the window grows.
- Reads appended log data for live updates and keeps recently opened chats in memory.
- Uses Codex's local appearance settings, checked at startup and when entering a chat.
- Expands for details and collapses three seconds after focus leaves.
- Folds into a small right-side tab to free the titlebar; one click restores the strip.
- Starts through a local Codex plugin and exits when Codex closes.

## Quick start

Paste this prompt into Codex or another coding agent:

```text
Install the latest Windows release from https://github.com/fazer-y/codex-usage-monitor, run its Connect-Codex.cmd to enable the Codex plugin, create desktop and Start menu shortcuts, and launch Codex Usage Monitor. Preserve existing settings.
```

Or install manually:

1. Download the [Windows x64 ZIP](https://github.com/fazer-y/codex-usage-monitor/releases/latest/download/codex-usage-monitor-windows-x64.zip).
2. Extract it to a folder such as `E:\Apps\Codex Usage Monitor` and run `Codex Usage Monitor.exe`.
3. Run `Connect-Codex.cmd` in that folder once.
4. Restart Codex and open a conversation. The plugin starts the strip, which updates as you work and exits with Codex.

The [Windows installer](https://github.com/fazer-y/codex-usage-monitor/releases/latest/download/codex-usage-monitor-setup-windows-x64.exe) lets you choose a folder and creates desktop and Start menu shortcuts.

The plugin uses the bundled local MCP server and runtime. Its small configuration package reuses the installed application files. Codex CLI must be available as `codex.exe` for setup.

Run `Disconnect-Codex.cmd` to remove the plugin connection. The Windows uninstaller also removes it.

## Controls

- **Pin:** attach to the titlebar or detach.
- **Down/up chevron:** expand or collapse details. Returning focus to the strip keeps details open.
- **Right/left chevron:** fold the strip to the right or restore it. Click the tray icon to restore it; use its menu to quit.
- **Drag:** move the strip. Window edges provide magnetic docking.

Throughput has the highest display priority. Narrow windows show fewer metrics; API cost appears last. Steps count model requests in the current turn. Throughput uses output tokens over estimated model-request time, including reasoning tokens and request overhead, with tool waits removed. API-equivalent cost uses Standard prices with separate cache-read pricing.

Session data is read locally from `%USERPROFILE%\.codex`. Set `CODEX_HOME` to use another data folder.

[Build from source](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [Pricing](docs/PRICING.md)

Based on [harveyxiacn/codex-usage-monitor](https://github.com/harveyxiacn/codex-usage-monitor). Licensed under [MIT](LICENSE).
