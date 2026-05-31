// squircle / capsule SVG path（浏览器 ESM + squircle-svg.wasm）
// 默认从内联 base64 bytes 实例化，避免浏览器扩展/隐私盾牌拦截 .wasm fetch。

import { SQUIRCLE_SVG_WASM_BASE64 } from "./wasm-bytes/squircle-svg.js";
import {
  createEmscriptenImports,
  loadWasmInstance,
  resolveWasmUrl,
} from "./wasm-runtime.js";

let _inst = null;
let _mem = null;
let _ready = false;
let _initPromise = null;

async function ensureReady(options = {}) {
  if (_ready) return;
  if (_initPromise) return _initPromise;
  const url = options.wasmUrl ? resolveWasmUrl(options.wasmUrl) : undefined;
  _initPromise = (async () => {
    const inst = await loadWasmInstance({
      base64: SQUIRCLE_SVG_WASM_BASE64,
      url,
      imports: createEmscriptenImports({ initialPages: 64 }),
    });
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
