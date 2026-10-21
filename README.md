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

## Quick start

1. Download the [Windows x64 ZIP](https://github.com/fazer-y/codex-usage-monitor/releases/latest/download/codex-usage-monitor-windows-x64.zip).
2. Extract it to a folder such as `E:\Apps\Codex Usage Monitor` and run `Codex Usage Monitor.exe`.
3. Open a Codex conversation. The strip appears in the titlebar and updates as you work.

The [Windows installer](https://github.com/fazer-y/codex-usage-monitor/releases/latest/download/codex-usage-monitor-setup-windows-x64.exe) lets you choose a folder and creates desktop and Start menu shortcuts.

## Controls

- **Pin:** attach to the titlebar or detach.
- **Chevron:** expand or collapse details. Returning focus to the strip keeps details open.
- **Close:** hide to the system tray. Click the tray icon to show it again; use its menu to quit.
- **Drag:** move the strip. Window edges provide magnetic docking.

Throughput has the highest display priority. Narrow windows show fewer metrics; API cost appears last. Steps count model requests in the current turn. Throughput uses output tokens over estimated model-request time, including reasoning tokens and request overhead, with tool waits removed. API-equivalent cost uses Standard prices with separate cache-read pricing.

Session data is read locally from `%USERPROFILE%\.codex`. Set `CODEX_HOME` to use another data folder.

[Build from source](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [Pricing](docs/PRICING.md)

Based on [harveyxiacn/codex-usage-monitor](https://github.com/harveyxiacn/codex-usage-monitor). Licensed under [MIT](LICENSE).
