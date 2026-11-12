<p align="center"><img src="site/assets/icon.png" width="80" alt="DeskPlan"></p>
<h1 align="center">日序 · DeskPlan</h1>
<p align="center">让计划留在桌面，让注意力留给今天。</p>
<p align="center"><a href="README.en.md">English</a> · <a href="https://asoming.github.io/deskplan/zh-CN/">产品主页与演示</a> · <a href="https://github.com/asoming/deskplan/releases/latest">最新正式版</a> · <a href="https://github.com/asoming/deskplan/discussions">交流与建议</a></p>
<p align="center"><a href="https://github.com/asoming/deskplan/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/asoming/deskplan?color=25695b"></a> <a href="https://github.com/asoming/deskplan/actions/workflows/build.yml"><img alt="Desktop build and tests" src="https://github.com/asoming/deskplan/actions/workflows/build.yml/badge.svg"></a> <img alt="Windows, macOS and Linux" src="https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-337889"> <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-25695b"></a></p>

把文件拖进四象限，安排今天与本周。**背景和文字透明度独立可调，留在桌面上，低于其他应用。** 无需账号，离线可用，没有广告与遥测。

> **[ Fork 说明 ]** 本仓库是 [asoming/deskplan](https://github.com/asoming/deskplan) 的 Fork，在上游基础上新增了：**番茄钟专注计时**（悬浮小窗 / 迷你模式 / 1–180 分钟自定义倒计时）、**工作统计看板**（习惯打卡热力格 / 完成趋势 / 按时率）、**日历双轴与完成历史**、**今天与本周的划线历史**、**每隔 N 天重复**、**五套主题色**。新增内容见下方功能表中的「番茄钟 / 工作统计 / 日历双轴 / 主题色」等行。基础应用的安装包仍从[上游 Release](https://github.com/asoming/deskplan/releases/latest) 获取；本 Fork 请按下方「从源码部署」运行。

## 从源码部署（本 Fork 的使用方式）

本 Fork 没有提供打包安装版，请从源码运行：

**1. 准备环境**

| 系统 | 需要 |
| --- | --- |
| 全平台 | Node.js ≥ 22.12、npm、Git |
| Windows | [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（勾选"使用 C++ 的桌面开发"）与 Python 3（首次安装依赖时编译原生窗口层用） |
| Linux | C++ 编译器、make、Python 3、libx11-dev |
| macOS | Xcode Command Line Tools（`xcode-select --install`） |

**2. 获取源码**（Fork 仓库不含 `node_modules`，需要自己安装依赖）

```sh
git clone https://github.com/lelejie/PomodoroDeskplan.git
cd PomodoroDeskplan
```

也可以在 GitHub 页面点 **Code → Download ZIP** 下载解压（此时是目录名 `PomodoroDeskplan-main`）。

**3. 安装依赖**

```sh
npm ci
```

这一步会下载 Electron 44 并编译原生桌面窗口层（`src/native/`）。**国内网络提示**：Electron 二进制从 GitHub 下载，若超时或被重置，先设置镜像再重试：

```powershell
# PowerShell（Windows）
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npm ci
```

```sh
# bash / zsh（macOS、Linux）
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm ci
```

**4. 启动**

- Windows：双击项目目录里的 **`启动.bat`**（等价于 `npm start`）；
- macOS / Linux：`npm start`。

首次启动会自动在源码目录旁创建 `data/` 文件夹存放你的任务数据；该目录已加入 `.gitignore`，更新代码、重新克隆都不会影响数据。

**需要打包安装版？** 上游 [Release 页面](https://github.com/asoming/deskplan/releases/latest)提供三平台官方安装包（不含本 Fork 新增功能）；也可以自行打包：`npm run package`（Windows 为 NSIS 安装包，详见 [TESTING.md](TESTING.md)）。

![日序真实应用，使用示例任务](site/assets/planner-zh-CN.png)

<details><summary>观看 15 秒真实应用演示：文件 → 任务 → 今天 / 本周 → 小窗</summary>

![日序功能演示](site/assets/demo-zh-CN.gif)

演示仅使用示例任务；[打开可控制播放的产品页](https://asoming.github.io/deskplan/zh-CN/#demo)。

</details>

## 做好桌面上的下一步

| 功能 | 怎么用 |
| --- | --- |
| 四象限 | 马上做、尽快做、按计划做、先放着，各自使用不同颜色；尽快做剩余 ≤48 小时会自动显示在马上做 |
| 今天与本周 | 今天挑出最重要的 3 件事；拖动安排一周，用预计耗时发现哪天太满。计划日期和截止日期独立；当天完成的任务以划线样式留在原处，可折叠 |
| 番茄钟 | 面板计时，可拖出为**悬浮小窗**或缩为迷你模式；支持 **1–180 分钟自定义倒计时**（如 4 分钟深蹲），完成照常计入番茄钟与轮次并自动休息；重启后继续计时 |
| 工作统计 | **习惯打卡热力格**（最近 12 周，绿=做了、红=没做，支持每天 / 每隔 N 天重复）、最近 14 天完成趋势、近 30 天按时率、逾期与收集箱积压概览，可导出 CSV |
| 日历双轴 | 「计划 / 截止」一键切换查看口径；点开任意日期查看计划、到期与**已完成**三段日程；拖任务到日期可选「安排到这天做」或「改截止到这天」 |
| 主题色 | 五套配色：墨绿（默认）/ 暖纸 / 石墨 / 海雾 / 暮紫，每套自带深浅两种变体，与桌面壁纸拉开层次 |
| 文件与文件夹 | 拖入创建任务或关联已有任务，也支持项目工作空间；保存原路径，不移动或上传原文件 |
| 随手记 | `Ctrl / ⌘ + Shift + 空格` 呼出输入框，回车保存到收集箱 |
| 安静常驻 | 右上角停靠、固定位置、鼠标停留才显示侧栏、小窗；托盘常驻，开机显示，不占任务栏 |
| 本地可靠性 | 子清单、重复任务（每天 / 工作日 / 每周 / 每月 / **每隔 N 天**）、可选提醒、撤销、回收站、滚动备份与 JSON / CSV 导出（CSV 含完成时间） |

四象限采用四档处理优先级，不是“重要 × 紧急”的双轴矩阵。背景与文字透明度均为 **0% 不透明、100% 全透明**。

## 开始使用

1. 安装并启动，点 `＋` 或将文件 / 文件夹拖入任务区。以源码运行时（Windows），安装依赖后双击 `启动.bat` 即可。
2. 安排计划日期、截止时间或子清单；在今天、本周、四象限之间切换；重复任务可选「每隔 N 天」。
3. 左侧设置中调整透明度、语言、主题色与提醒。右键面板或托盘可固定位置、打开设置或退出。

## 三个实际用法

| 你想做什么 | 可以这样安排 |
| --- | --- |
| 跟进一个项目交付 | 把项目文件夹或 `.code-workspace` 拖进四象限，设置截止时间，再用子清单拆成准备、执行、检查。原文件留在原处 |
| 今天集中做三件事 | 在「今天」挑选最重要的 3 件事并估算耗时；工作时切到小窗，查看当前任务和接下来的两件事 |
| 短事项用番茄钟保持节奏 | 做 4 分钟深蹲这类短任务时，在番茄钟输入 4 点「倒计时」；完成后照常计入轮次，休息自动开始。悬浮小窗上同样可以直接输时长 |
| 坚持每日运动并复盘 | 给每天 / 每隔 N 天的运动设上「重复」，完成后在统计看板查看打卡热力格、连续次数与完成率，按周复盘哪天掉队 |
| 避免把一周塞满 | 灵感先记到收集箱，再在「本周」拖到合适的日期，结合预计耗时调整安排；改计划日期不会改截止日期 |

**本地数据与更新：** 任务保存在本机，附件备份只包含路径。旧版本沿用原数据目录；1.0.10 及以前因仓库改名需手动覆盖安装一次新版，无需卸载。之后可在设置里检测、下载更新，自行选择安装重启。

## 反馈与参与

- [报告问题](https://github.com/asoming/deskplan/issues/new?template=bug_report.yml) · [建议功能](https://github.com/asoming/deskplan/issues/new?template=feature_request.yml) · [交流使用方法](https://github.com/asoming/deskplan/discussions)
- [适合首次参与的小任务](https://github.com/asoming/deskplan/contribute) · [需要帮助的任务](https://github.com/asoming/deskplan/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22help%20wanted%22)
- [参与指南](CONTRIBUTING.md) · [后续方向](ROADMAP.md) · [安全反馈](SECURITY.md)
- [产品介绍](docs/INTRO.zh-CN.md) · [历史功能更新](docs/HISTORY.zh-CN.md) · [全部发行说明](https://github.com/asoming/deskplan/releases)

## 开发

Node.js 22.12+（CI 使用 24），npm；Linux 还需 C++ 编译器、make、Python 3 与 libx11-dev。

```sh
npm ci
npm start
npm test
npm run test:desktop
npm run test:planner
npm run test:release
npm run test:language
```

Windows 下源码运行：`npm ci` 后直接双击 `启动.bat`（内部调用 `scripts/dev-start.cjs`），或使用 `npm start`。个人数据保存在 `data/` 目录（已在 `.gitignore` 中），永远不会进入版本库。

[完整测试与打包](TESTING.md) · [发行流程](docs/RELEASING.md) · [网站与演示维护](docs/WEBSITE.md)。原生测试必须使用隔离数据与桌面，不能使用个人任务数据。

当前不提供云同步、团队协作或系统日历双向同步。Linux 窗口行为依赖桌面环境，使用 X11 / XWayland。

## 其他作品

[墨页 Markwrite](https://github.com/asoming/markwrite) — 本地 Markdown 阅读与编辑器，支持双栏对照、逐字差异与 Git 版本管理。[官网与操作指南](https://asoming.github.io/markwrite/zh-CN/)。

<a id="license"></a>
## 许可

本项目采用 [MIT 许可证](LICENSE)，Copyright (c) 2026 asoming。允许使用、修改、分发和商用；复制或分发本软件或其重要部分时，需保留版权声明与许可声明。软件按“原样”提供，不作担保。第三方组件遵循各自许可证。
