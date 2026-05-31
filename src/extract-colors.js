// 图片主色 / 调色板提取（浏览器 ESM + extract-colors.wasm）
// 默认导出 extractColors；initExtractColorsWasm 可显式预加载。
// 默认从内联 base64 bytes 实例化，避免浏览器扩展/隐私盾牌拦截 .wasm fetch。

import { EXTRACT_COLORS_WASM_BASE64 } from "./wasm-bytes/extract-colors.js";
import {
  createExtractColorsImports,
  getExtractColorsMemory,
  loadWasmInstance,
  resolveWasmUrl,
} from "./wasm-runtime.js";

let extractExports = null;
let extractMemory = null;
let _wasmPromise = null;

let _sharedCanvas = null;
function getSharedCanvas() {
  if (_sharedCanvas) return _sharedCanvas;
  _sharedCanvas = document.createElement("canvas");
  return _sharedCanvas;
}

let _sharedCtx2D = null;
function getShared2DContext() {
  if (_sharedCtx2D) return _sharedCtx2D;
  const canvas = getSharedCanvas();
  _sharedCtx2D = canvas.getContext("2d", { willReadFrequently: true });
  return _sharedCtx2D;
}

async function loadExtractColorsWasm(options = {}) {
  if (_wasmPromise) return _wasmPromise;
  _wasmPromise = (async () => {
    const instance = await loadWasmInstance({
      base64: EXTRACT_COLORS_WASM_BASE64,
      url: options.wasmUrl ? resolveWasmUrl(options.wasmUrl) : undefined,
      imports: createExtractColorsImports(),
    });
    const exports = instance.exports;
    extractExports = exports;
    extractMemory = getExtractColorsMemory(exports);
    if (!extractMemory) throw new Error("wasm memory not found");
    return exports;
  })();
  return _wasmPromise;
}

async function ensureWasmReady(options) {
  if (extractExports) return;
  await loadExtractColorsWasm(options);
}

export async function initExtractColorsWasm(options) {
  await ensureWasmReady(options ?? {});
}

export default async function extractColors(input, opts) {
  await ensureWasmReady(opts);

  const toImageData = async () => {
    if (typeof input === "string") {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = (opts && opts.crossOrigin) ?? "";
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("image load error"));
        el.src = input;
      });
      return extractImageDataViaCanvas(img, opts && opts.pixels);
    }
    if (isImageData(input)) return input;
    if (isImageDataAlt(input)) {
      const u8 = input.data instanceof Uint8ClampedArray ? input.data : new Uint8ClampedArray(input.data);
      return createImageDataFromRaw(u8, input.width, input.height);
    }
    return extractImageDataViaCanvas(input, opts && opts.pixels);
  };

  const imageData = await toImageData();
  if (!extractExports || !extractMemory) throw new Error("WASM 未就绪");

  const { width, height, data } = imageData;
  const hasCustomValidator = typeof (opts && opts.colorValidator) === "function";
  const len = data.byteLength >>> 0;
  const ptr = extractExports.get_pixels_buffer(len) >>> 0;
  if (!ptr) throw new Error("get_pixels_buffer 失败");
  const heapU8 = new Uint8Array(extractMemory.buffer, ptr, len);
  if (hasCustomValidator) {
    const validator = opts.colorValidator;
    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (!validator(r, g, b, a)) {
        heapU8[i] = r; heapU8[i + 1] = g; heapU8[i + 2] = b; heapU8[i + 3] = 0;
      } else {
        heapU8[i] = r; heapU8[i + 1] = g; heapU8[i + 2] = b; heapU8[i + 3] = a;
      }
    }
  } else {
    heapU8.set(data);
  }

  const pixels = Math.max(1, Math.floor((opts && opts.pixels) ?? 64000));
  const distance = clamp01((opts && opts.distance) ?? 0.22);
  const satDist = clamp01((opts && opts.saturationDistance) ?? 0.2);
  const lightDist = clamp01((opts && opts.lightnessDistance) ?? 0.2);
  const hueDist = clamp01((opts && opts.hueDistance) ?? 1 / 12);
  const alphaThreshold = hasCustomValidator ? 1 : 250;
  const maxColors = 64;

  const outPtr = extractExports.extract_colors_from_rgba_js(
    ptr,
    width | 0,
    height | 0,
    pixels | 0,
    +distance,
    +satDist,
    +lightDist,
    +hueDist,
    alphaThreshold | 0,
    maxColors | 0
  ) >>> 0;
  if (!outPtr) throw new Error("extract_colors_from_rgba_js 失败");

  const f64 = new Float64Array(extractMemory.buffer, outPtr, 1 + 8 * 64);
  const m = Math.max(0, Math.min(64, Math.floor(f64[0])));
  const out = [];
  for (let i = 0; i < m; i++) {
    const base = 1 + i * 8;
    const red = Math.round(f64[base + 0]);
    const green = Math.round(f64[base + 1]);
    const blue = Math.round(f64[base + 2]);
    const hue = f64[base + 3];
    const intensity = f64[base + 4];
    const lightness = f64[base + 5];
    const saturation = f64[base + 6];
    const area = f64[base + 7];
    const hex = `#${[red, green, blue].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    out.push({ hex, red, green, blue, area, hue, saturation, lightness, intensity });
  }
  out.sort((a, b) => {
    const bPower = (b.intensity + 0.1) * (0.9 - b.area);
    const aPower = (a.intensity + 0.1) * (0.9 - a.area);
    return bPower - aPower;
  });
  return out;
}

function isImageData(x) {
  return x && typeof x === "object" && typeof x.width === "number" && typeof x.height === "number" && x.data instanceof Uint8ClampedArray;
}
function isImageDataAlt(x) {
  return x && typeof x === "object" && typeof x.width === "number" && typeof x.height === "number" && x.data && typeof x.data.length === "number";
}
function extractImageDataViaCanvas(source, targetPixels = 64000) {
  const canvas = getSharedCanvas();
  const ctx = getShared2DContext();
  const w0 = source.naturalWidth ?? source.videoWidth ?? source.width;
  const h0 = source.naturalHeight ?? source.videoHeight ?? source.height;
  const total = Math.max(1, (w0 | 0) * (h0 | 0));
  const scale = Math.min(1, Math.sqrt(Math.max(1, Math.floor(targetPixels)) / total));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const needResize = canvas.width !== w || canvas.height !== h;
  if (needResize) {
    canvas.width = w; canvas.height = h;
    ctx.imageSmoothingEnabled = false; ctx.imageSmoothingQuality = "low";
  } else {
    ctx.clearRect(0, 0, w, h);
  }
  ctx.drawImage(source, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
function clamp01(n) { return Math.min(1, Math.max(0, Number(n))); }
function createImageDataFromRaw(data, width, height) {
  try { return new ImageData(data, width, height); }
  catch (_e) {
    const canvas = getSharedCanvas();
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(width, height);
    img.data.set(data);
    return img;
  }
}
