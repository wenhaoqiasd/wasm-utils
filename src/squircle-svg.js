// squircle / capsule SVG path（浏览器 ESM + squircle-svg.wasm）

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

async function instantiateWasmWithFallback(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  const ct = resp.headers.get("content-type") || "";

  const memory = new WebAssembly.Memory({ initial: 64, maximum: 16384 });
  const imports = {
    wasi_snapshot_preview1: createWasiStub(memory),
    env: { memory, abort() { }, emscripten_notify_memory_growth() { } },
  };

  if (WebAssembly.instantiateStreaming && ct.includes("application/wasm")) {
    const { instance } = await WebAssembly.instantiateStreaming(resp, imports);
    return instance;
  }

  const buf = await resp.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(buf, imports);
  return instance;
}

let _inst = null;
let _mem = null;
let _ready = false;
let _initPromise = null;

function resolveWasmUrl(options = {}) {
  const wasmUrl = options.wasmUrl ?? "./wasm/squircle-svg.wasm";
  if (typeof wasmUrl === "string" && wasmUrl.includes("://")) return wasmUrl;
  return new URL(wasmUrl, import.meta.url).href;
}

async function ensureReady(options = {}) {
  if (_ready) return;
  if (_initPromise) return _initPromise;
  const url = resolveWasmUrl(options);
  _initPromise = (async () => {
    const inst = await instantiateWasmWithFallback(url);
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
