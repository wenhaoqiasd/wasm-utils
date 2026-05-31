/** Shared WASM load helpers (internal; not a public export path). */

export function decodeBase64(b64) {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  throw new Error("No base64 decoder available");
}

export function resolveWasmUrl(urlOrRelative, baseUrl = import.meta.url) {
  if (typeof urlOrRelative === "string" && urlOrRelative.includes("://")) {
    return urlOrRelative;
  }
  return new URL(urlOrRelative, baseUrl).href;
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
  function writeZeroPair(view, a, b) {
    try {
      view.setUint32(a >>> 0, 0, true);
      view.setUint32(b >>> 0, 0, true);
    } catch { }
  }
  return {
    args_get: ret0,
    args_sizes_get: (pArgc, pArgvBufSize) => {
      writeZeroPair(new DataView(memory.buffer), pArgc, pArgvBufSize);
      return 0;
    },
    environ_get: ret0,
    environ_sizes_get: (pCount, pBufSize) => {
      writeZeroPair(new DataView(memory.buffer), pCount, pBufSize);
      return 0;
    },
    fd_write,
    random_get,
    proc_exit,
  };
}

/** Emscripten standalone WASM (oklch2rgb, rgb2oklch, squircle-svg). */
export function createEmscriptenImports({ initialPages = 256, maximumPages = 16384 } = {}) {
  const memory = new WebAssembly.Memory({ initial: initialPages, maximum: maximumPages });
  return {
    wasi_snapshot_preview1: createWasiStub(memory),
    env: { memory, abort() { }, emscripten_notify_memory_growth() { } },
  };
}

const EXTRACT_ENV_MEMORY = new WebAssembly.Memory({ initial: 256, maximum: 2048 });
const EXTRACT_ENV_TABLE = new WebAssembly.Table({ initial: 0, element: "anyfunc" });

/** extract-colors.wasm import object (Emscripten + extra WASI stubs). */
export function createExtractColorsImports() {
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
    memory: EXTRACT_ENV_MEMORY,
    table: EXTRACT_ENV_TABLE,
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

export function getExtractColorsMemory(exports) {
  const exportedMem = exports && exports.memory;
  return exportedMem instanceof WebAssembly.Memory ? exportedMem : EXTRACT_ENV_MEMORY;
}

export async function instantiateWasmFromBase64(base64, imports) {
  const { instance } = await WebAssembly.instantiate(decodeBase64(base64), imports);
  return instance;
}

export async function instantiateWasmFromUrl(url, imports) {
  if (WebAssembly.instantiateStreaming) {
    try {
      const { instance } = await WebAssembly.instantiateStreaming(fetch(url), imports);
      return instance;
    } catch { }
  }
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  const { instance } = await WebAssembly.instantiate(await resp.arrayBuffer(), imports);
  return instance;
}

/** Default: inline base64. Pass `url` to fetch an externally hosted `.wasm`. */
export async function loadWasmInstance({ base64, url, imports }) {
  if (url) return instantiateWasmFromUrl(url, imports);
  return instantiateWasmFromBase64(base64, imports);
}
