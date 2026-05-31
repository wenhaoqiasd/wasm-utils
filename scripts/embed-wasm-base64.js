import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmDir = resolve(root, "src/wasm");
const srcDir = resolve(root, "src");

function wasmBase64(name) {
  return readFileSync(resolve(wasmDir, name)).toString("base64");
}

function jsString(value) {
  return JSON.stringify(value);
}

const oklch2rgb = jsString(wasmBase64("oklch2rgb.wasm"));
const rgb2oklch = jsString(wasmBase64("rgb2oklch.wasm"));
const extractColors = jsString(wasmBase64("extract-colors.wasm"));
const squircleSvg = jsString(wasmBase64("squircle-svg.wasm"));

writeFileSync(
  resolve(srcDir, "color-convert.js"),
  `// OKLCH ↔ sRGB（浏览器 ESM，独立 WASM）
// - init：并行加载 oklch2rgb.wasm 与 rgb2oklch.wasm（幂等）
// - rgb2oklch / oklch2rgb_abs / oklch2rgb_rel：高层 API
// - 默认从内联 base64 bytes 实例化，避免浏览器扩展/隐私盾牌拦截 .wasm fetch。

const OKLCH2RGB_WASM_BASE64 = ${oklch2rgb};
const RGB2OKLCH_WASM_BASE64 = ${rgb2oklch};

function decodeBase64(b64) {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  throw new Error("No base64 decoder available");
}

function createWasiStub(memory) {
  function ret0() { return 0; }
  function fd_write(_fd, _iov, _iovcnt, pOut) {
    try { new DataView(memory.buffer).setUint32(pOut >>> 0, 0, true); } catch { }
    return 0;
  }
  function random_get(ptr, len) {
    try {
      const dst = new Uint8Array(memory.buffer, ptr >>> 0, len >>> 0);
      crypto.getRandomValues(dst);
    } catch { }
    return 0;
  }
  function proc_exit(code) { throw new Error("WASI proc_exit: " + code); }
  return {
    args_get: ret0,
    args_sizes_get: (pArgc, pArgvBufSize) => {
      try {
        const view = new DataView(memory.buffer);
        view.setUint32(pArgc >>> 0, 0, true);
        view.setUint32(pArgvBufSize >>> 0, 0, true);
      } catch { }
      return 0;
    },
    environ_get: ret0,
    environ_sizes_get: (pCount, pBufSize) => {
      try {
        const view = new DataView(memory.buffer);
        view.setUint32(pCount >>> 0, 0, true);
        view.setUint32(pBufSize >>> 0, 0, true);
      } catch { }
      return 0;
    },
    fd_write,
    random_get,
    proc_exit,
  };
}

function createImports() {
  const memory = new WebAssembly.Memory({ initial: 256, maximum: 16384 });
  return {
    wasi_snapshot_preview1: createWasiStub(memory),
    env: { memory, abort() { }, emscripten_notify_memory_growth() { } },
  };
}

async function instantiateFromBase64(b64) {
  const { instance } = await WebAssembly.instantiate(decodeBase64(b64), createImports());
  return instance;
}

async function instantiateFromUrl(url) {
  const imports = createImports();
  if (WebAssembly.instantiateStreaming) {
    try {
      const { instance } = await WebAssembly.instantiateStreaming(fetch(url), imports);
      return instance;
    } catch { }
  }
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(\`Failed to fetch \${url}: \${resp.status}\`);
  const { instance } = await WebAssembly.instantiate(await resp.arrayBuffer(), imports);
  return instance;
}

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

  const okInstPromise = oklch2rgbUrl
    ? instantiateFromUrl(typeof oklch2rgbUrl === "string" && oklch2rgbUrl.includes("://")
      ? oklch2rgbUrl
      : new URL(oklch2rgbUrl, import.meta.url).href)
    : instantiateFromBase64(OKLCH2RGB_WASM_BASE64);
  const rgbInstPromise = rgb2oklchUrl
    ? instantiateFromUrl(typeof rgb2oklchUrl === "string" && rgb2oklchUrl.includes("://")
      ? rgb2oklchUrl
      : new URL(rgb2oklchUrl, import.meta.url).href)
    : instantiateFromBase64(RGB2OKLCH_WASM_BASE64);

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
`,
);

writeFileSync(
  resolve(srcDir, "extract-colors.js"),
  `// 图片主色 / 调色板提取（浏览器 ESM + extract-colors.wasm）
// 默认导出 extractColors；initExtractColorsWasm 可显式预加载。
// 默认从内联 base64 bytes 实例化，避免浏览器扩展/隐私盾牌拦截 .wasm fetch。

const EXTRACT_COLORS_WASM_BASE64 = ${extractColors};

function decodeBase64(b64) {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  throw new Error("No base64 decoder available");
}

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

const ENV_MEMORY = new WebAssembly.Memory({ initial: 256, maximum: 2048 });
const ENV_TABLE = new WebAssembly.Table({ initial: 0, element: "anyfunc" });

function resolveWasmUrl(urlOrRelative) {
  if (typeof urlOrRelative === "string" && urlOrRelative.includes("://")) {
    return urlOrRelative;
  }
  return new URL(urlOrRelative, import.meta.url).href;
}

function createImportObject() {
  const wasiNoop = () => 0;
  const wasiShim = {
    args_get: wasiNoop,
    args_sizes_get: wasiNoop,
    environ_get: wasiNoop,
    environ_sizes_get: wasiNoop,
    fd_close: wasiNoop,
    fd_fdstat_get: wasiNoop,
    fd_seek: wasiNoop,
    fd_write: wasiNoop,
    proc_exit: wasiNoop,
    random_get: wasiNoop,
    clock_time_get: wasiNoop,
  };
  const envShim = {
    abort: () => { },
    abort_: () => { },
    __assert_fail: () => { },
    emscripten_notify_memory_growth: () => { },
    memory: ENV_MEMORY,
    table: ENV_TABLE,
    __stack_pointer: new WebAssembly.Global({ value: "i32", mutable: true }, 0),
    __data_end: new WebAssembly.Global({ value: "i32", mutable: false }, 0),
    __heap_base: new WebAssembly.Global({ value: "i32", mutable: false }, 0),
  };
  return {
    wasi_snapshot_preview1: wasiShim,
    wasi_unstable: wasiShim,
    env: envShim,
  };
}

async function instantiateFromBase64() {
  const { instance } = await WebAssembly.instantiate(decodeBase64(EXTRACT_COLORS_WASM_BASE64), createImportObject());
  return instance;
}

async function instantiateFromUrl(resolvedUrl) {
  const importObject = createImportObject();
  if ("instantiateStreaming" in WebAssembly) {
    try {
      const { instance } = await WebAssembly.instantiateStreaming(fetch(resolvedUrl), importObject);
      return instance;
    } catch { }
  }
  const resp = await fetch(resolvedUrl);
  if (!resp.ok) throw new Error(\`fetch extract-colors wasm failed: \${resp.status} \${resp.statusText}\`);
  const buf = await resp.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(buf, importObject);
  return instance;
}

async function loadExtractColorsWasm(options = {}) {
  if (_wasmPromise) return _wasmPromise;
  _wasmPromise = (async () => {
    const instance = options.wasmUrl
      ? await instantiateFromUrl(resolveWasmUrl(options.wasmUrl))
      : await instantiateFromBase64();
    const exports = instance.exports;
    const exportedMem = exports && exports.memory;
    const mem = exportedMem instanceof WebAssembly.Memory ? exportedMem : ENV_MEMORY;
    if (!mem) throw new Error("wasm memory not found");
    extractExports = exports;
    extractMemory = mem;
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
    const hex = \`#\${[red, green, blue].map((v) => v.toString(16).padStart(2, "0")).join("")}\`;
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
`,
);

writeFileSync(
  resolve(srcDir, "squircle-svg.js"),
  `// squircle / capsule SVG path（浏览器 ESM + squircle-svg.wasm）
// 默认从内联 base64 bytes 实例化，避免浏览器扩展/隐私盾牌拦截 .wasm fetch。

const SQUIRCLE_SVG_WASM_BASE64 = ${squircleSvg};

function decodeBase64(b64) {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  throw new Error("No base64 decoder available");
}

function createWasiStub(memory) {
  function ret0() { return 0; }
  function fd_write(_fd, _iov, _iovcnt, pOut) {
    try { new DataView(memory.buffer).setUint32(pOut >>> 0, 0, true); } catch { }
    return 0;
  }
  function random_get(ptr, len) {
    try {
      const dst = new Uint8Array(memory.buffer, ptr >>> 0, len >>> 0);
      crypto.getRandomValues(dst);
    } catch { }
    return 0;
  }
  function proc_exit(code) { throw new Error("WASI proc_exit: " + code); }
  return {
    args_get: ret0,
    args_sizes_get: (pArgc, pArgvBufSize) => { try { const v = new DataView(memory.buffer); v.setUint32(pArgc >>> 0, 0, true); v.setUint32(pArgvBufSize >>> 0, 0, true); } catch { } return 0; },
    environ_get: ret0,
    environ_sizes_get: (pCount, pBufSize) => { try { const v = new DataView(memory.buffer); v.setUint32(pCount >>> 0, 0, true); v.setUint32(pBufSize >>> 0, 0, true); } catch { } return 0; },
    fd_write,
    random_get,
    proc_exit,
  };
}

function createImports() {
  const memory = new WebAssembly.Memory({ initial: 64, maximum: 16384 });
  return {
    wasi_snapshot_preview1: createWasiStub(memory),
    env: { memory, abort() { }, emscripten_notify_memory_growth() { } },
  };
}

async function instantiateFromBase64() {
  const { instance } = await WebAssembly.instantiate(decodeBase64(SQUIRCLE_SVG_WASM_BASE64), createImports());
  return instance;
}

async function instantiateFromUrl(url) {
  const imports = createImports();
  if (WebAssembly.instantiateStreaming) {
    try {
      const { instance } = await WebAssembly.instantiateStreaming(fetch(url), imports);
      return instance;
    } catch { }
  }
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(\`Failed to fetch \${url}: \${resp.status}\`);
  const { instance } = await WebAssembly.instantiate(await resp.arrayBuffer(), imports);
  return instance;
}

let _inst = null;
let _mem = null;
let _ready = false;
let _initPromise = null;

function resolveWasmUrl(options = {}) {
  const wasmUrl = options.wasmUrl;
  if (!wasmUrl) return null;
  if (typeof wasmUrl === "string" && wasmUrl.includes("://")) return wasmUrl;
  return new URL(wasmUrl, import.meta.url).href;
}

async function ensureReady(options = {}) {
  if (_ready) return;
  if (_initPromise) return _initPromise;
  const url = resolveWasmUrl(options);
  _initPromise = (async () => {
    const inst = url ? await instantiateFromUrl(url) : await instantiateFromBase64();
    _inst = inst.exports;
    _mem = _inst.memory;
    _ready = true;
  })();
  return _initPromise;
}

function readCString(ptr) {
  ptr = ptr >>> 0;
  const u8 = new Uint8Array(_mem.buffer);
  let end = ptr;
  while (end < u8.length && u8[end] !== 0) end++;
  return new TextDecoder().decode(u8.subarray(ptr, end));
}

export async function initSquircleWasm(options) {
  await ensureReady(options ?? {});
}

export async function getSquircle(width, height, radius, options) {
  await ensureReady(options);
  const p = _inst.squircle_path_js(+width, +height, +radius) >>> 0;
  if (!p) throw new Error("squircle_path_js returned 0");
  return readCString(p);
}

export async function getCapsule(width, height, radius, options) {
  await ensureReady(options);
  const p = _inst.capsule_path_js(+width, +height, +radius) >>> 0;
  if (!p) throw new Error("capsule_path_js returned 0");
  return readCString(p);
}

export async function getPath(shape, width, height, radius, options) {
  const s = String(shape).toLowerCase();
  if (s === "squircle") return getSquircle(width, height, radius, options);
  if (s === "capsule") return getCapsule(width, height, radius, options);
  throw new Error("Unknown shape: " + shape);
}
`,
);

console.log("Embedded WASM base64 into src modules.");
