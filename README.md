# @wenhaoqi/wasm_design_utils

Browser-first **ESM** package: **sRGB ↔ OKLCH** conversion in WebAssembly, **image palette extraction**, and SVG **`d` paths** for **squircle / capsule** shapes. Also ships **C CLI tools** buildable on macOS (`extract-colors` reads images via ImageIO / CoreGraphics).

**[简体中文](https://unpkg.com/@wenhaoqi/wasm_design_utils@latest/README.zh-CN.md)**

## Repository layout

| Path | Purpose |
|------|---------|
| `native/*.c` | Algorithms and CLI sources |
| `src/*.js` | Browser loaders/wrappers (`import.meta.url` resolves WASM next to each module under `src/wasm/`) |
| `src/wasm/*.wasm` | Emscripten outputs (run `make wasm`; generate from source if not checked in) |
| `bin/*` | Native binaries from `make native` (ignored by git by default) |
| `examples/minimal.html` | Static demo (serve over HTTP; build WASM first) |

## Install

```bash
npm install @wenhaoqi/wasm_design_utils
```

The package is **ESM-only** (`"type": "module"`). TypeScript definitions ship as `.d.ts`.

### Subpath exports

| Entry | Scope |
|-------|--------|
| `@wenhaoqi/wasm_design_utils` | Barrel export (API below) |
| `@wenhaoqi/wasm_design_utils/color` | OKLCH ↔ sRGB only |
| `@wenhaoqi/wasm_design_utils/extract-colors` | Palette extraction only |
| `@wenhaoqi/wasm_design_utils/squircle` | Squircle / capsule paths only |

Bundlers (Vite, Webpack 5+, etc.) treat `src/wasm/*.wasm` as assets. If WASM files are missing, run `make wasm` in this repo or place the four `.wasm` files under `src/wasm/` in the published package.

---

## Browser API overview

### Color: `init`, `rgb2oklch`, `oklch2rgb_abs`, `oklch2rgb_rel`

| Function | Description |
|----------|-------------|
| `init(options?)` | Preloads `oklch2rgb.wasm` and `rgb2oklch.wasm` in parallel (idempotent). Optional `oklch2rgbUrl`, `rgb2oklchUrl` (relative to this module or absolute URL). |
| `rgb2oklch(r, g, b)` | sRGB 8-bit channels 0–255 → `{ L, C, h }` (L ∈ [0, 1], `h` in degrees). |
| `oklch2rgb_abs(L, C, h)` | Absolute chroma OKLCH → `{ R, G, B }`. |
| `oklch2rgb_rel(L, h, rel)` | **Relative chroma** `rel` ∈ [0, 1]: uses that fraction of the maximum in-gamut chroma at the given L and h (ignores a separate C input) → `{ R, G, B }`. |

Default WASM URLs resolve from each module to `./wasm/oklch2rgb.wasm` and `./wasm/rgb2oklch.wasm`.

### Palette: `extractColors`, `initExtractColorsWasm`

| Function | Description |
|----------|-------------|
| `initExtractColorsWasm(options?)` | Preloads `extract-colors.wasm`; optional `wasmUrl`. |
| `extractColors(input, opts?)` | Extracts a palette from a **URL string**, **HTMLImageElement**, **ImageData**, or `{ data, width, height }`. Returns objects such as `{ hex, red, green, blue, hue, intensity, lightness, saturation, area, … }` with the same ordering rules as the implementation. |

Common options: `pixels`, `distance`, `saturationDistance`, `lightnessDistance`, `hueDistance`, `crossOrigin`, `colorValidator(r,g,b,a)`.

### Smooth corners (SVG paths): `initSquircleWasm`, `getSquircle`, `getCapsule`, `getPath`

| Function | Description |
|----------|-------------|
| `initSquircleWasm(options?)` | Preloads `squircle-svg.wasm`; optional `wasmUrl`. |
| `getSquircle(w, h, r)` | SVG path **`d`** string for a squircle. |
| `getCapsule(w, h, r)` | SVG path **`d`** string for a capsule. |
| `getPath(shape, w, h, r)` | Dispatches when `shape` is `'squircle'` or `'capsule'`. |

---

## JavaScript usage (per API)

Imports use the package root or subpaths, for example `"@wenhaoqi/wasm_design_utils"` and `"@wenhaoqi/wasm_design_utils/color"`.

### Color

#### `init(options?)`

Warms up both color WASM modules. Optional: conversion functions call this implicitly on first use.

```js
import { init } from "@wenhaoqi/wasm_design_utils";

await init();
```

Custom WASM locations (absolute URL or path resolved by your bundler):

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
// L ∈ [0, 1], C ≥ 0, h in degrees (0 when C ≈ 0)
```

#### `oklch2rgb_abs(L, C, h)`

```js
import { oklch2rgb_abs } from "@wenhaoqi/wasm_design_utils";

const { R, G, B } = await oklch2rgb_abs(0.63, 0.25, 29.2);
```

#### `oklch2rgb_rel(L, h, rel)`

```js
import { oklch2rgb_rel } from "@wenhaoqi/wasm_design_utils";

// rel ∈ [0, 1]: fraction of max in-gamut chroma at this L and hue
const { R, G, B } = await oklch2rgb_rel(0.7, 40, 0.5);
```

### Palette

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

// Loaded <img> / Image / canvas-backed bitmap
const swatches = await extractColors(document.querySelector("#photo"));
```

```js
// Image URL (use crossOrigin when the image is cross-origin)
const fromHttp = await extractColors("https://example.com/photo.jpg", {
  crossOrigin: "anonymous",
});
```

```js
// Clustering / sampling controls (defaults match the implementation)
const tuned = await extractColors(img, {
  pixels: 64000,
  distance: 0.22,
  saturationDistance: 0.2,
  lightnessDistance: 0.2,
  hueDistance: 1 / 12,
});
```

```js
// Drop-in pixel filter before clustering
const maskBg = await extractColors(img, {
  colorValidator: (r, g, b, a) => a > 128,
});
```

Each swatch includes fields such as `hex`, `red`, `green`, `blue`, `hue`, `intensity`, `lightness`, `saturation`, `area`.

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

## Combined example (vanilla ESM)

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

Subpath-only imports:

```js
import { oklch2rgb_rel } from "@wenhaoqi/wasm_design_utils/color";
import extractColors from "@wenhaoqi/wasm_design_utils/extract-colors";
import { getCapsule } from "@wenhaoqi/wasm_design_utils/squircle";
```

### React (client-only)

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

In Next.js or similar, load this package only on the **client** (dynamic `import()`), since it relies on `fetch`, `Image`, and WebAssembly.

---

## Publishing to npm

Package name: **`@wenhaoqi/wasm_design_utils`** (scoped). `package.json` includes `"publishConfig": { "access": "public" }` so the package can be published as **public** on the npm registry.

The published tarball **must** contain the four WebAssembly files under `src/wasm/` (`oklch2rgb.wasm`, `rgb2oklch.wasm`, `extract-colors.wasm`, `squircle-svg.wasm`). Before `npm publish`:

1. **Option A — Commit WASM:** run `make wasm` (requires [Emscripten](https://emscripten.org/) / `emcc` on your `PATH`), then commit the generated `src/wasm/*.wasm` files; or  
2. **Option B — Build on publish:** run `npm publish` on a machine where `emcc` is available. The **`prepublishOnly`** script runs `scripts/ensure-wasm-built.js`, which checks for those files and runs `make wasm` if any are missing.

If neither applies, `npm publish` will fail with a clear error — this avoids shipping a broken package without WASM.

```bash
npm login
npm publish
```

To verify WASM locally without publishing: `node scripts/ensure-wasm-built.js` (same logic as `prepublishOnly`).

---

## Development & build

### Makefile

First-time WebAssembly build without global `emcc`:

```bash
npm run setup:wasm
```

This clones [`emsdk`](https://github.com/emscripten-core/emsdk) into `./emsdk/` (ignored by git), installs the latest SDK, and runs `make wasm`. Later builds:

```bash
source emsdk/emsdk_env.sh
make wasm
```

```bash
# Build bin/* and src/wasm/*.wasm, then run smoke tests
make all

make native   # macOS CLI only → bin/
make wasm     # requires emcc on PATH (or use emsdk_env.sh above)
make test
make clean
```

- Native **`extract-colors`** requires **macOS** with `ImageIO`, `CoreGraphics`, and `CoreFoundation`.
- **WASM** is built with `-s STANDALONE_WASM=1` and no Emscripten glue; exported symbols are listed in the `Makefile`.

### Shell script

```bash
./scripts/build_all.sh
```

### Demo page

```bash
make wasm
python3 -m http.server 8000
# Open http://localhost:8000/examples/minimal.html
```

---

## CLI tools (`make native`)

| Command | Description |
|---------|-------------|
| `bin/rgb2oklch R G B` | Prints `L C h` |
| `bin/oklch2rgb L C h [rel]` | Prints `R G B`; optional fourth arg is relative chroma 0–1 |
| `bin/extract-colors <image>` | JSON palette (same core algorithm as the web path) |
| `bin/squircle_svg squircle|capsule W H R` | Prints SVG path |

---

## License

MIT — see `LICENSE`.
