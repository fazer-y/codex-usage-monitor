# Antigravity Usage Monitor

[简体中文](README.zh-CN.md)

A live usage bar for Google Antigravity Desktop on Windows. It docks to the title bar and follows the conversation you open, including past conversations.

- See the full model name, reasoning effort, and usage in the title bar. Wider windows make room for more metrics.
- Open **Plugins → Usage Monitor** for the full model name, effort, token breakdown, context, rounds, steps, tools, and first-token latency.
- Drag to move or dock the bar. Fold it into a handle when you want more title-bar space.
- Start with Antigravity through a Sidecar. The native bar uses Windows controls and matches the Antigravity theme.

## Quick start

1. Open Antigravity Desktop on Windows x64 once.
2. Download and run the [Windows installer](https://github.com/fazer-y/codex-usage-monitor/releases/download/antigravity-v0.1.0/antigravity-usage-monitor-setup-windows-x64.exe). Setup uses Antigravity's built-in Node.js runtime.
3. Reopen Antigravity and open a conversation. Select **Usage Monitor** from **Plugins** or the side panel's **+** menu to see details.

Run the installer again to upgrade.

## Metrics

Generation speed uses the latest model call's output tokens and streaming time. Cache hit rate aggregates cached input across the conversation. Context shows the input tokens in the latest model request. The bar updates when Antigravity records new usage.

[Build from source](docs/ARCHITECTURE.md) · [MIT license](LICENSE)
