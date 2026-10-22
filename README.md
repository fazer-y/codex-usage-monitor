# Codex Usage Monitor

[简体中文](README.zh-CN.md)

A compact statistics strip for the Codex desktop app on Windows.

## Features

- Follows the current conversation, including existing chats.
- Docks inside the titlebar and follows window movement, resizing, and minimization.
- Shows the full model name, reasoning effort, throughput, cache hits, context, tokens, steps, and turns.
- Shows a lightning icon after the reasoning effort when Fast Mode is active.
- Adds tool counts, timing, and API-equivalent cost as the window grows.
- Reads appended log data for live updates and saves parsed chat caches across restarts. Caches expire after one week without access.
- Uses a native Windows window and an existing Node.js runtime for a compact installation.
- Uses Codex's local appearance settings, checked at startup and when entering a chat.
- Follows Codex's UI language: English, Simplified Chinese, and Traditional Chinese.
- Expands for details and collapses three seconds after focus leaves.
- Folds into a small right-side tab to free the titlebar; one click restores the strip.
- Starts through a local Codex plugin and exits when Codex closes.
- Checks official API prices once at startup and caches input, cache-read, cache-write, and output rates.

## Quick start

Paste this prompt into Codex or another coding agent:

```text
Download and run the latest Windows installer from https://github.com/fazer-y/codex-usage-monitor. Check for Codex and Node.js 24.5 or later first. It installs the app, shortcuts, and Codex plugin together. Preserve existing settings.
```

Or download and run the [Windows installer](https://github.com/fazer-y/codex-usage-monitor/releases/latest/download/codex-usage-monitor-setup-windows-x64.exe). It installs the app, creates desktop and Start menu shortcuts, connects the Codex plugin, and opens the strip.

Install Codex and [Node.js 24.5 or later](https://nodejs.org/) before running setup. An existing compatible Codex Node.js runtime is also detected automatically. Restart Codex once and open a conversation. The strip then starts with conversations and exits when Codex closes.

The plugin reuses the installed application through its bundled local MCP server. Uninstall through Windows Settings to remove the app and plugin connection. Existing appearance and window settings are preserved during upgrades.

## Controls

- **Pin:** attach to the titlebar or detach.
- **Down/up chevron:** expand or collapse details. Returning focus to the strip keeps details open.
- **Right/left chevron:** fold the strip to the right or restore it. The desktop shortcut also restores the strip.
- **Right-click:** refresh, attach to the titlebar, or quit. The strip stays out of the taskbar and system tray.
- **Drag:** move the strip. Window edges provide magnetic docking.

Throughput has the highest display priority. Narrow windows show fewer metrics; API cost appears last. Steps count model requests in the current turn. Throughput uses output tokens over estimated model-request time, including reasoning tokens and request overhead, with tool waits removed. API-equivalent cost uses Standard prices with separate cache-read pricing.

Session data is read locally from `%USERPROFILE%\.codex`. Set `CODEX_HOME` to use another data folder.

[Build from source](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [Pricing](docs/PRICING.md)

Based on [harveyxiacn/codex-usage-monitor](https://github.com/harveyxiacn/codex-usage-monitor). Licensed under [MIT](LICENSE).
