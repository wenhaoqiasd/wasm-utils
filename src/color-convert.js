// OKLCH ↔ sRGB（浏览器 ESM，独立 WASM）
// - init：并行加载两块 WASM（幂等）
// - rgb2oklch / oklch2rgb_abs / oklch2rgb_rel：高层 API
// - 默认从内联 base64 bytes 实例化，避免浏览器扩展/隐私盾牌拦截 .wasm fetch。

import { OKLCH2RGB_WASM_BASE64 } from "./wasm-bytes/oklch2rgb.js";
import { RGB2OKLCH_WASM_BASE64 } from "./wasm-bytes/rgb2oklch.js";
import {
  createEmscriptenImports,
  loadWasmInstance,
  resolveWasmUrl,
} from "./wasm-runtime.js";

let okExports = null;
let okMem = null;
let rgbExports = null;
let rgbMem = null;
let _ready = false;
let _initPromise = null;

async function ensureReady(options = {}) {
  if (_ready) return;
  if (_initPromise) return _initPromise;
  const { oklch2rgbUrl, rgb2oklchUrl } = options;

  const okInstPromise = loadWasmInstance({
    base64: OKLCH2RGB_WASM_BASE64,
    url: oklch2rgbUrl ? resolveWasmUrl(oklch2rgbUrl) : undefined,
    imports: createEmscriptenImports({ initialPages: 256 }),
  });
  const rgbInstPromise = loadWasmInstance({
    base64: RGB2OKLCH_WASM_BASE64,
    url: rgb2oklchUrl ? resolveWasmUrl(rgb2oklchUrl) : undefined,
    imports: createEmscriptenImports({ initialPages: 256 }),
  });

  _initPromise = (async () => {
    const [okInst, rgbInst] = await Promise.all([okInstPromise, rgbInstPromise]);
    okExports = okInst.exports;
    okMem = okExports.memory;
    rgbExports = rgbInst.exports;
    rgbMem = rgbExports.memory;
    _ready = true;
  })();
  return _initPromise;
}

/** 预加载两块颜色转换 WASM；与首次调用转换函数效果相同，可提前并行初始化。 */
export async function init(options) {
  await ensureReady(options ?? {});
}

export async function oklch2rgb_abs(L, C, h) {
  await ensureReady();
  const ptr = okExports.oklch2rgb_calc_js(+L, +C, +h) >>> 0;
  const i32 = new Int32Array(okMem.buffer, ptr, 3);
  return { R: i32[0] | 0, G: i32[1] | 0, B: i32[2] | 0 };
}

export async function oklch2rgb_rel(L, h, rel) {
  await ensureReady();
  const r = Math.max(0, Math.min(1, Number(rel)));
  const ptr = okExports.oklch2rgb_calc_rel_js(+L, +h, r) >>> 0;
  const i32 = new Int32Array(okMem.buffer, ptr, 3);
  return { R: i32[0] | 0, G: i32[1] | 0, B: i32[2] | 0 };
}

export async function rgb2oklch(r, g, b) {
  await ensureReady();
  const ptr = rgbExports.rgb2oklch_calc_js(r | 0, g | 0, b | 0) >>> 0;
  const f64 = new Float64Array(rgbMem.buffer, ptr, 3);
  return { L: f64[0], C: f64[1], h: f64[2] };
}
