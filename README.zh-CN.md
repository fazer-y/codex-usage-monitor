# Codex Usage Monitor

[English](README.md)

Windows 上的 Codex 桌面会话统计条。

## 功能

- 跟随当前会话，支持已有会话。
- 吸附在标题栏内部，跟随窗口移动、缩放和最小化。
- 显示模型全称、思考强度、吞吐、缓存命中、上下文、Token、步数和轮数。
- 窗口变宽时增加工具次数、耗时和 API 等价费用。
- 增量读取日志，实时更新，并缓存最近打开的会话。
- 使用 Codex 的本地外观配置，在启动和进入会话时检查。
- 跟随 Codex 界面语言，支持英文、简体中文和繁体中文。
- 展开查看详情，失去焦点 3 秒后自动收起。
- 向右收起成小按钮，腾出标题栏；点击即可恢复统计条。
- 通过本地 Codex 插件启动，随 Codex 退出。
- 每次启动检查一次官方 API 价格，缓存输入、缓存读取、缓存写入和输出单价。

## 快速开始

将这段提示词发给 Codex 等 Agent：

```text
请从 https://github.com/fazer-y/codex-usage-monitor 下载并运行最新的 Windows 安装程序，一次完成程序、快捷方式和 Codex 插件的安装。保留已有配置。
```

也可直接下载并运行 [Windows 安装程序](https://github.com/fazer-y/codex-usage-monitor/releases/latest/download/codex-usage-monitor-setup-windows-x64.exe)，自动完成程序安装、桌面与开始菜单快捷方式创建、Codex 插件绑定，并打开统计条。

重启一次 Codex 并打开会话，之后统计条会随会话启动、随 Codex 退出。运行安装程序前先安装 Codex。

插件通过随程序提供的本地 MCP 服务复用已安装的程序。在 Windows 设置中卸载时，会一并移除插件连接。升级保留已有外观和窗口设置。

## 操作

- **图钉：**吸附到标题栏或解除吸附。
- **上下箭头：**展开或收起详情；焦点返回统计条后保持展开。
- **左右箭头：**向右收起统计条或恢复显示。点击托盘图标也可恢复，右键菜单可退出。
- **拖动：**调整位置，靠近窗口边缘时自动吸附。

吞吐优先显示，窗口变窄时逐级精简统计项，API 费用最后显示。步数表示本轮模型请求次数。吞吐按模型请求区间估算，包含思考 Token 和请求开销，剔除工具等待。API 等价费用采用 Standard 价格，单独计算缓存读取费用。

会话数据从本地 `%USERPROFILE%\.codex` 读取，可通过 `CODEX_HOME` 指定其他目录。

[从源码构建](CONTRIBUTING.md) · [更新记录](CHANGELOG.md) · [价格计算](docs/PRICING.md)

基于 [harveyxiacn/codex-usage-monitor](https://github.com/harveyxiacn/codex-usage-monitor) 开发，采用 [MIT 许可证](LICENSE)。
