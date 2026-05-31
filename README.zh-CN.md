# @wenhaoqi/wasm_design_utils

浏览器优先的 **ESM** 包：在 WebAssembly 中提供 **sRGB ↔ OKLCH** 转换、**图片主色/调色板提取**，以及 **squircle / capsule** 的 SVG `d` 路径。附带可在 macOS 上编译的 **C 命令行工具**（`extract-colors` 使用 ImageIO / CoreGraphics 读图）。

**[English](https://unpkg.com/@wenhaoqi/wasm_design_utils@latest/README.md)**

## 仓库布局

| 路径 | 说明 |
|------|------|
| `native/*.c` | 算法与 CLI 源码 |
| `src/*.js` | 浏览器端封装（默认从 `src/wasm-bytes/` 内联 base64 实例化 WASM） |
| `src/wasm-bytes/*.js` | 自动生成的 base64 嵌入（`make wasm` 后运行 `embed-wasm-base64.js`） |
| `src/wasm/*.wasm` | Emscripten 构建产物（仅开发/构建用；0.2.0 起 npm 包不再包含） |
| `bin/*` | `make native` 生成的本地可执行文件（默认被 git 忽略） |
| `examples/minimal.html` | 本地静态页演示（需 HTTP 访问；先构建 WASM） |

## 安装

```bash
npm install @wenhaoqi/wasm_design_utils
```

仅包含 **ESM**（`"type": "module"`）。TypeScript 可使用自带的 `.d.ts`。

### 子路径导出

| 入口 | 用途 |
|------|------|
| `@wenhaoqi/wasm_design_utils` | 聚合导出（见下方 API） |
| `@wenhaoqi/wasm_design_utils/color` | 仅 OKLCH ↔ sRGB |
| `@wenhaoqi/wasm_design_utils/extract-colors` | 仅图片取色 |
| `@wenhaoqi/wasm_design_utils/squircle` | 仅 squircle/capsule 路径 |

构建工具以普通 ESM 加载本包 — WASM 默认以内联 base64 实例化（无需 fetch `.wasm`，避免浏览器扩展拦截）。可选 `*Url` 参数改为从外部 URL fetch。

本地开发请执行 `make wasm` 生成 `src/wasm/*.wasm` 并更新 `src/wasm-bytes/*.js`。

---

## 浏览器 API 概览

### 颜色：`init`、`rgb2oklch`、`oklch2rgb_abs`、`oklch2rgb_rel`

| 函数 | 作用 |
|------|------|
| `init(options?)` | 并行预加载两块颜色 WASM（幂等）。**默认内联 base64**（无网络请求）。可选 `oklch2rgbUrl`、`rgb2oklchUrl` 从外部 fetch。 |
| `rgb2oklch(r, g, b)` | sRGB 8 位通道 0–255 → `{ L, C, h }`（L∈[0,1]，h 为度）。 |
| `oklch2rgb_abs(L, C, h)` | 绝对色度 OKLCH → `{ R, G, B }`。 |
| `oklch2rgb_rel(L, h, rel)` | **相对色度** `rel`∈[0,1]：在该 L、h 下使用色域内可达最大色度的比例（忽略单独传入的 C）→ `{ R, G, B }`。 |

默认从内联 base64 实例化（无 fetch）。仅当需要从自有 CDN/静态资源加载 `.wasm` 时才传 `oklch2rgbUrl` / `rgb2oklchUrl`。

### 取色：`extractColors`、`initExtractColorsWasm`

| 函数 | 作用 |
|------|------|
| `initExtractColorsWasm(options?)` | 预加载 extract-colors WASM（默认内联 base64）；可选 `wasmUrl` 外部 fetch。 |
| `extractColors(input, opts?)` | 从 **URL 字符串**、**HTMLImageElement**、**ImageData**（或 `{ data, width, height }`）提取调色板。返回若干 `{ hex, red, green, blue, hue, intensity, lightness, saturation, area, … }`，排序与实现一致。 |

常用选项：`pixels`、`distance`、`saturationDistance`、`lightnessDistance`、`hueDistance`、`crossOrigin`、`colorValidator(r,g,b,a)`。

### 平滑圆角路径：`initSquircleWasm`、`getSquircle`、`getCapsule`、`getPath`

| 函数 | 作用 |
|------|------|
| `initSquircleWasm(options?)` | 预加载 squircle WASM（默认内联 base64）；可选 `wasmUrl` 外部 fetch。 |
| `getSquircle(w, h, r)` | 返回 squircle 形状的 SVG path **`d` 字符串**。 |
| `getCapsule(w, h, r)` | 返回 capsule 形状的 SVG path **`d` 字符串**。 |
| `getPath(shape, w, h, r)` | `shape` 为 `'squircle'` 或 `'capsule'` 时委托上述二者。 |

---

## JavaScript 用法（逐 API）

可使用包根或子路径导入，例如 `"@wenhaoqi/wasm_design_utils"`、`"@wenhaoqi/wasm_design_utils/color"`。

### 颜色

#### `init(options?)`

预热两块颜色 WASM；也可不设：首次调用转换函数时会自动加载。

```js
import { init } from "@wenhaoqi/wasm_design_utils";

await init();
```

自定义 WASM 地址（完整 URL 或由打包工具解析的路径）：

```js
await init({
  oklch2rgbUrl: new URL("./assets/oklch2rgb.wasm", import.meta.url).href,
  rgb2oklchUrl: "https://cdn.example.com/rgb2oklch.wasm",
});
```

#### `rgb2oklch(r, g, b)`

```js
import { rgb2oklch } from "@wenhaoqi/wasm_design_utils";

const { L, C, h } = await rgb2oklch(255, 128, 64);
// L ∈ [0,1]，C ≥ 0，h 为度（C≈0 时 h 视为 0）
```

#### `oklch2rgb_abs(L, C, h)`

```js
import { oklch2rgb_abs } from "@wenhaoqi/wasm_design_utils";

const { R, G, B } = await oklch2rgb_abs(0.63, 0.25, 29.2);
```

#### `oklch2rgb_rel(L, h, rel)`

```js
import { oklch2rgb_rel } from "@wenhaoqi/wasm_design_utils";

// rel ∈ [0,1]：当前 L、h 下可达最大色度所占比例
const { R, G, B } = await oklch2rgb_rel(0.7, 40, 0.5);
```

### 取色

#### `initExtractColorsWasm(options?)`

```js
import { initExtractColorsWasm } from "@wenhaoqi/wasm_design_utils";

await initExtractColorsWasm();

await initExtractColorsWasm({
  wasmUrl: new URL("./wasm/extract-colors.wasm", import.meta.url).href,
});
```

#### `extractColors(input, opts?)`

```js
import extractColors from "@wenhaoqi/wasm_design_utils/extract-colors";

// 已解码的 <img> / Image / 画布位图
const swatches = await extractColors(document.querySelector("#photo"));
```

```js
// 图片 URL（跨域时需配置 crossOrigin）
const fromHttp = await extractColors("https://example.com/photo.jpg", {
  crossOrigin: "anonymous",
});
```

```js
// 聚类与抽样参数（默认值与实现一致）
const tuned = await extractColors(img, {
  pixels: 64000,
  distance: 0.22,
  saturationDistance: 0.2,
  lightnessDistance: 0.2,
  hueDistance: 1 / 12,
});
```

```js
// 聚类前过滤像素
const maskBg = await extractColors(img, {
  colorValidator: (r, g, b, a) => a > 128,
});
```

每个色块包含 `hex`、`red`、`green`、`blue`、`hue`、`intensity`、`lightness`、`saturation`、`area` 等字段。

### Squircle / capsule

#### `initSquircleWasm(options?)`

```js
import { initSquircleWasm } from "@wenhaoqi/wasm_design_utils";

await initSquircleWasm();

await initSquircleWasm({
  wasmUrl: new URL("./wasm/squircle-svg.wasm", import.meta.url).href,
});
```

#### `getSquircle(width, height, radius)`

```js
import { getSquircle } from "@wenhaoqi/wasm_design_utils";

const d = await getSquircle(200, 120, 16);
```

#### `getCapsule(width, height, radius)`

```js
import { getCapsule } from "@wenhaoqi/wasm_design_utils";

const d = await getCapsule(300, 80, 24);
```

#### `getPath(shape, width, height, radius)`

```js
import { getPath } from "@wenhaoqi/wasm_design_utils";

const squircleD = await getPath("squircle", 200, 120, 16);
const capsuleD = await getPath("capsule", 200, 120, 16);
```

---

## 组合示例（纯 ESM）

```js
import {
  init,
  rgb2oklch,
  oklch2rgb_abs,
  extractColors,
  getPath,
} from "@wenhaoqi/wasm_design_utils";

await init();
const { L, C, h } = await rgb2oklch(128, 100, 231);
const rgb = await oklch2rgb_abs(L, C, h);

const img = document.querySelector("#photo");
const palette = await extractColors(img, { pixels: 64000 });

const d = await getPath("squircle", 200, 120, 16);
document.querySelector("path").setAttribute("d", d);
```

仅子路径导入：

```js
import { oklch2rgb_rel } from "@wenhaoqi/wasm_design_utils/color";
import extractColors from "@wenhaoqi/wasm_design_utils/extract-colors";
import { getCapsule } from "@wenhaoqi/wasm_design_utils/squircle";
```

### React（仅客户端）

```jsx
import { useEffect, useState } from "react";
import { init, rgb2oklch } from "@wenhaoqi/wasm_design_utils";

export function OklchChip({ r, g, b }) {
  const [label, setLabel] = useState("…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await init();
      const { L, C, h } = await rgb2oklch(r, g, b);
      if (!cancelled) setLabel(`oklch(${L.toFixed(3)} ${C.toFixed(3)} ${h.toFixed(1)})`);
    })();
    return () => { cancelled = true; };
  }, [r, g, b]);

  return <span style={{ fontFamily: "monospace" }}>{label}</span>;
}
```

在 Next.js 等环境中请仅在 **客户端** 使用动态 `import()` 加载本包（依赖 `Image` / WASM；使用自定义 `*Url` 时还需 `fetch`）。

---

## 发布到 npm

包名为 **`@wenhaoqi/wasm_design_utils`**（作用域包）。`package.json` 中已配置 `"publishConfig": { "access": "public" }`，便于在 npm 上发布为**公开**包。

发布到 npm 的压缩包将 WASM 以 base64 嵌入 `src/wasm-bytes/*.js`（不再单独包含 `.wasm` 文件）。在执行 `npm publish` 前任选其一：

1. **做法 A — 提交 embed：**在本机执行 `make wasm`（需安装 [Emscripten](https://emscripten.org/)，且 `emcc` 在 `PATH` 中），会自动运行 `embed-wasm-base64.js`；提交 `src/wasm-bytes/*.js`；或  
2. **做法 B — 发布时再编：**在已安装 `emcc` 的机器上执行 `npm publish`。**`prepublishOnly`** 会运行 `ensure-wasm-built.js`（缺 WASM 则 `make wasm`）再运行 `embed-wasm-base64.js`。

若两种条件都不满足，`npm publish` 会失败并提示原因，避免发出不含 WASM 的损坏包。

```bash
npm login
npm publish
```

本地可先运行 `node scripts/ensure-wasm-built.js` 检查 WASM（与 `prepublishOnly` 逻辑一致）。

---

## 本地开发与构建

### Makefile（推荐）

首次在本机构建 **WASM**、且系统里没有全局 `emcc` 时：

```bash
npm run setup:wasm
```

会在 `./emsdk/` 克隆官方 SDK（已被 git 忽略）、安装最新 Emscripten 并执行 `make wasm`。之后可直接：

```bash
source emsdk/emsdk_env.sh
make wasm
```

```bash
# 生成 bin/*、src/wasm/*.wasm、src/wasm-bytes/*.js，并运行烟测
make all

make native   # 仅 macOS 本地 CLI → bin/
make wasm     # 需 emcc；同时 regenerate src/wasm-bytes/
make test
make clean
npm run embed # 仅重新生成 base64 嵌入（需已有 src/wasm/*.wasm）
```

- **原生** `extract-colors` 依赖 **macOS** 与 `ImageIO`、`CoreGraphics`、`CoreFoundation`。
- **WASM** 使用 `-s STANDALONE_WASM=1`、无胶水脚本，导出符号见 `Makefile`。

### 一键脚本

```bash
./scripts/build_all.sh
```

### 演示页

```bash
make wasm
python3 -m http.server 8000
# 打开 http://localhost:8000/examples/minimal.html
```

---

## 命令行工具（`make native`）

| 命令 | 说明 |
|------|------|
| `bin/rgb2oklch R G B` | 输出 `L C h`（文本） |
| `bin/oklch2rgb L C h [rel]` | 输出 `R G B`；可选第四参数相对色度 0–1 |
| `bin/extract-colors <图片>` | JSON 调色板（与 Web 端同源算法） |
| `bin/squircle_svg squircle|capsule W H R` | 打印 SVG path |

---

## 许可

MIT，见 `LICENSE`。
