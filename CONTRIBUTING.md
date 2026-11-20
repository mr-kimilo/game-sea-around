# 贡献指南

感谢你愿意改进《海底吃吃乐》。项目是**纯静态、零构建、零依赖**的 HTML5 游戏，改动很小、反馈很快。

## 开发环境

只需要一个现代浏览器和任意静态文件服务器：

```bash
python -m http.server 8080
# 或
npx --yes serve -l 8080 .
```

打开 <http://localhost:8080/>，改完代码刷新页面即可，没有编译步骤。

## 代码约定

- **不要引入构建工具和运行时依赖**：引擎固定使用 CDN 上的 Phaser 3.80.1，仓库里不出现 `node_modules`。
- 脚本不是 ES Module，按 `index.html` 中的顺序加载，新增文件需同步修改 `index.html` 的 `<script>` 顺序与版本号。
- 面向玩家的文字一律走 `js/i18n.js` 的 `T('key')`；数据里的名字写成 `{ zh, en }`，用 `tx()` 取值。新增文案需中英文同时补齐。
- 美术与音效保持程序化生成（`js/textures.js` / `js/audio.js`），不要提交图片或音频文件。
- 缩进 2 空格、UTF-8、LF 换行（见 `.editorconfig`）；注释只解释“为什么”，不复述代码。

## 常见改动

| 想做什么 | 改哪里 |
| --- | --- |
| 调整难度曲线 | `levels.json` |
| 新增鱼种 | `js/textures.js`：`FISH_SPECIES` + `SHAPES` 中的绘制形状 + 中英文名 |
| 新增地图 | `js/textures.js`：`MAPS`、`drawSeaBackground()`、`createMapFX()` |
| 调整评分 / 标准用时 | `js/textures.js`：`levelParTime()` / `calcLevelScore()` |
| 新增音效 | `js/audio.js`（Web Audio 合成） |
| 新增界面文案 | `js/i18n.js` 的 `LANGS.zh` 与 `LANGS.en` |

## 提交与 PR

- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)：
  `feat: 增加第 21 关`、`fix: 修复手柄断连后玩家卡住`、`docs: 补充关卡参数说明`。
- 一个 PR 只做一件事；涉及玩法的改动请在描述里写清验证方式（用哪个浏览器、键盘还是手柄、哪一关）。
- 不要在仓库中提交任何密钥、令牌、`.env` 文件或个人路径；本地临时文件已被 `.gitignore` 排除。

## 报告问题

- 普通缺陷与建议：开 issue，附浏览器版本、是否使用手柄、复现步骤。
- 安全问题：请不要公开开 issue，按 [SECURITY.md](SECURITY.md) 的流程私信报告。
