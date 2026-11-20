# 海底吃吃乐 · Sea Around

一款给小朋友（约 6 岁）玩的 HTML5 海底吃鱼小游戏：操控一个会做表情的小圆点，吃掉比自己轻的鱼、躲开比自己重的鱼，闯过 20 关。

**纯静态 · 零构建 · 零依赖 · 手柄支持 · 2 人同屏 · 中英双语 · 全程序化美术与音效**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Phaser](https://img.shields.io/badge/Phaser-3.80.1-2d2d2d.svg)](https://phaser.io)
[![Build](https://img.shields.io/badge/build-none-brightgreen.svg)](#快速开始)

> **English** — Sea Around is a zero-build HTML5 arcade game for kids, built with Phaser 3. You play a smiling bubble that eats smaller fish and dodges bigger ones across 20 levels, 3 undersea maps and 20 fish species. Local co-op for 2 players, gamepad support, Chinese/English UI with speech, and fully synthesized audio — no image or audio assets ship with the project.

---

## 目录

- [快速开始](#快速开始)
- [操作说明](#操作说明)
- [玩法规则](#玩法规则)
- [关卡与难度](#关卡与难度)
- [项目结构](#项目结构)
- [技术实现](#技术实现)
- [部署](#部署)
- [浏览器支持](#浏览器支持)
- [开发约定](#开发约定)
- [许可证](#许可证)

## 快速开始

纯静态页面，**不需要构建、不需要安装依赖**。

```bash
git clone https://github.com/mr-kimilo/game-sea-around.git
cd game-sea-around
python -m http.server 8080
```

浏览器打开 <http://localhost:8080/>。停止服务：在终端按 `Ctrl + C`。

其他方式：

```bash
npx --yes serve -l 8080 .        # Node.js，首次运行会自动下载 serve
```

- VS Code：打开 `index.html`，右键 → **Open with Live Server**；
- 也可以直接双击 `index.html`（`file://`），但个别浏览器会拦截对 `levels.json` 的读取，用本地服务器最稳。

## 操作说明

| 操作 | 玩家 1 | 玩家 2 | 手柄 |
| --- | --- | --- | --- |
| 移动 | `W` `A` `S` `D` | `↑` `↓` `←` `→` | 左摇杆 / 十字键 |
| 冲刺 Dash | `J` | `Numpad 1` 或 `,` | `A` |
| 隐身 Hide | `K` | `Numpad 2` 或 `.` | `B` |

| 菜单 / 结算 | 键盘 | 手柄 |
| --- | --- | --- |
| 开始游戏（1 / 2 人） | `1` / `2` | `A` = 1 人，`B` = 2 人 |
| 切换地图 | `←` `→` | 十字键 |
| 切换语言 | `L` | `L1` / `R1`（`L2` / `R2` 亦可） |
| 静音开关 | `M` | — |
| 过关继续 / 通关操作 | `Space` / `Enter`，`1` = 再玩一次，`2` = 返回菜单 | `A` = 确认 / 再玩，`B` = 返回 |

手柄按插入顺序对应玩家 1、玩家 2，最多支持 2 个手柄。

## 玩法规则

- 出生重量 **5**，只能吃**比当前重量轻**的鱼；重量 **大于等于**自己的鱼会吃掉你，一局即失败。
- 鱼身上的数字实时反馈：比自己轻的显示**绿色**，大于等于自己的显示**红色**，颜色随体重变化实时更新。
- **冲刺**：短暂加速（2.5 倍），有冷却，冷却中 HUD 图标变暗并显示倒计时；就绪时有呼吸光晕。
- **隐身**：短时间内不被大鱼吃掉，同样有冷却与就绪提示。
- 重量达到本关 **targetWeight** 即过关；共 **20 关**，难度逐关小幅上台阶。
- 失败后可以重开本关，并重新选择难度（简单 / 普通 / 困难）。
- 通关后进入庆祝场景：鱼群巡游 → 海底火山爆发 → 显示总分与 10 颗星（按总用时评分）。

更细的数值规则、评分公式与音效设计见 [docs/DESIGN.md](docs/DESIGN.md)。

## 关卡与难度

全部关卡参数在 [levels.json](levels.json) 中数据驱动，共 20 条：

| 字段 | 含义 |
| --- | --- |
| `name` | 关卡名 |
| `fishCount` | 场上鱼的数量 |
| `fishSpeed` | 鱼的游速区间 `[min, max]` |
| `fishWeightRange` | 鱼的重量区间 `[min, max]` |
| `maxBigFishRatio` | 场上“大鱼”（重量 ≥ 玩家初始重量）占鱼数的比例上限 |
| `bigFishInterval` | 每隔多少秒才额外放出下一条大鱼 |
| `targetWeight` | 过关所需重量 |
| `dashCooldown` | 冲刺冷却（秒） |
| `stealthCooldown` | 隐身冷却（秒） |
| `stealthDuration` | 隐身持续（秒） |

难度系数会在关卡参数之上缩放冷却时间（简单更容易、困难更硬），评语与星级也按难度换算。

## 项目结构

```text
.
├── index.html              # 入口页：加载 Phaser CDN、按顺序引入脚本
├── levels.json             # 20 关关卡参数
├── js/
│   ├── main.js             # Phaser 实例、高清渲染补丁、视口自适应看门狗
│   ├── i18n.js             # 中英文案、T() / tx()、语音语言选择
│   ├── textures.js         # 程序化纹理：鱼、地图、图标、背景、评分函数
│   ├── audio.js            # Web Audio 合成音效 + 语音表扬
│   └── scenes/
│       ├── MenuScene.js    # 人数 / 难度 / 地图 / 语言选择
│       ├── GameScene.js    # 核心玩法：移动、技能、碰撞、鱼群、HUD
│       ├── EndScene.js     # 过关结算与逐颗点亮的星级
│       └── VictoryScene.js # 通关庆祝动画与总分
├── docs/DESIGN.md          # 玩法、关卡、美术、音效设计细节
├── .github/workflows/      # GitHub Pages 自动部署
├── CONTRIBUTING.md
├── CHANGELOG.md
├── SECURITY.md
└── LICENSE
```

## 技术实现

| 主题 | 做法 |
| --- | --- |
| 引擎 | [Phaser 3.80.1](https://phaser.io)（jsDelivr CDN 引入，无打包工具、无 `node_modules`） |
| 分辨率 | 逻辑坐标 960×540，画布缓冲按 1920×1080 渲染（相机 `setZoom(2)`），大屏不发虚 |
| 美术 | 运行时用 Canvas 绘制纹理，鱼定义在 `textures.js` 的 `FISH_SPECIES` / `SHAPES`，地图定义在 `MAPS` |
| 音频 | Web Audio 实时合成水泡、铃声等音效，配合浏览器 `SpeechSynthesis` 报数；**仓库内没有任何音频文件**，`file://` 也有声音 |
| 国际化 | `js/i18n.js`（`LANGS` / `T(key, vars)` / `tx({zh,en})`），语言记在 `localStorage` 的 `sea_around_lang` |
| 本地状态 | 静音：`localStorage.sea_around_muted`；地图选择在本次会话（Phaser registry）内保留 |
| 自适应 | `main.js` 里的 `fitToViewport()` 监听窗口 / 容器变化，保证画布始终按视口 FIT 居中 |

## 部署

纯静态站点，把仓库根目录直接托管到任意静态服务（Nginx、OSS / COS、Vercel、Netlify、GitHub Pages）即可，无需构建步骤。

仓库自带 GitHub Pages 工作流 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)：推送到 `main` 后自动发布。首次使用需在 **Settings → Pages → Source** 选择 **GitHub Actions**；未启用时工作流会跳过部署（只留一条提示），不会让仓库出现失败记录。

> `index.html` 左下角的「返回大厅」按钮面向带了游戏大厅站点的部署：本地指向 `http://localhost:5200/`，线上按当前域名拼出 `game.<主域>/`。独立部署时删掉该 `<a>` 与随后的内联脚本即可。

## 浏览器支持

- Chrome / Edge / Firefox / Safari 最近两个大版本（需要 Canvas 或 WebGL）。
- 音频需要先有用户手势才会播放：在菜单按 `1` / `2` 开始游戏即会解锁。
- 触屏可以点按菜单项，但游戏本体需要键盘或手柄。

## 开发约定

- 没有构建流程：改完代码刷新浏览器即可，无需打包。
- 新增 / 调整关卡只改 `levels.json`；新增鱼种在 `js/textures.js` 中补 `FISH_SPECIES` 与绘制形状。
- 所有面向玩家的文字走 `T('key')`，数据名统一写成 `{ zh, en }`，保证中英双语同步。
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)；详细流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE) © mr-kimilo
