// OKLCH ↔ sRGB（浏览器 ESM，独立 WASM）
// - init：并行加载 oklch2rgb.wasm 与 rgb2oklch.wasm（幂等）
// - rgb2oklch / oklch2rgb_abs / oklch2rgb_rel：高层 API

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

async function instantiateWasmWithFallback(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);

    const ct = resp.headers.get("content-type") || "";
    if (WebAssembly.instantiateStreaming && ct.includes("application/wasm")) {
      const { instance } = await WebAssembly.instantiateStreaming(resp, {});
      return instance;
    }
    const { instance } = await WebAssembly.instantiate(await resp.arrayBuffer(), {});
    return instance;
  } catch {
    const resp2 = await fetch(url);
    if (!resp2.ok) throw new Error(`Failed to fetch ${url}: ${resp2.status}`);
    const buf = await resp2.arrayBuffer();

    const memory = new WebAssembly.Memory({ initial: 256, maximum: 16384 });
    const imports = {
      wasi_snapshot_preview1: createWasiStub(memory),
      env: { memory, abort() { }, emscripten_notify_memory_growth() { } },
    };
    const { instance } = await WebAssembly.instantiate(buf, imports);
    return instance;
  }
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
  const {
    oklch2rgbUrl = new URL("./wasm/oklch2rgb.wasm", import.meta.url).href,
    rgb2oklchUrl = new URL("./wasm/rgb2oklch.wasm", import.meta.url).href,
  } = options;

  const okUrl =
    typeof oklch2rgbUrl === "string" && oklch2rgbUrl.includes("://")
      ? oklch2rgbUrl
      : new URL(oklch2rgbUrl, import.meta.url).href;
  const rgbUrl =
    typeof rgb2oklchUrl === "string" && rgb2oklchUrl.includes("://")
      ? rgb2oklchUrl
      : new URL(rgb2oklchUrl, import.meta.url).href;

  _initPromise = (async () => {
    const [okInst, rgbInst] = await Promise.all([
      instantiateWasmWithFallback(okUrl),
      instantiateWasmWithFallback(rgbUrl),
    ]);
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
