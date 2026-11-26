# Antigravity Usage Monitor

[English](README.md)

Google Antigravity 桌面端的实时用量统计条。它吸附在 Windows 标题栏上，打开和切换已有会话时自动显示对应数据。

- 标题栏显示完整模型名、思考强度和用量统计。窗口变宽时会显示更多指标。
- 从左侧 **Plugins → Usage Monitor** 查看完整模型名、思考强度、Token 明细、上下文、轮数、步数、工具调用和首字等待。
- 支持拖动吸附，也可以将统计条向右收起。
- 通过 Sidecar 随反重力启动。统计条使用 Windows 原生控件，配色跟随反重力。

## 快速开始

1. 在 Windows x64 上打开一次 Antigravity 桌面端。
2. 下载并运行 [Windows 安装程序](https://github.com/fazer-y/codex-usage-monitor/releases/download/antigravity-v0.1.0/antigravity-usage-monitor-setup-windows-x64.exe)。安装程序使用反重力自带的 Node.js。
3. 重新打开反重力并进入会话。从 **Plugins** 或会话侧面板的 **+** 菜单打开 **Usage Monitor** 即可查看详情。

运行新版安装程序即可升级。

## 统计口径

生成速度使用最近一次模型调用的输出 Token 和流式生成时间。缓存命中率按整个会话累计。上下文显示最近一次模型请求的输入 Token。反重力写入新的用量数据后，统计条自动更新。

[从源码构建](docs/ARCHITECTURE.md) · [MIT 许可证](LICENSE)
