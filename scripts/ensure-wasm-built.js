#!/usr/bin/env node
/**
 * Runs before `npm publish`: ensure four standalone WASM files exist under src/wasm/.
 * If missing, tries `make wasm` (requires Emscripten / emcc on PATH).
 */
import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmDir = join(root, "src", "wasm");
const required = [
  "oklch2rgb.wasm",
  "rgb2oklch.wasm",
  "extract-colors.wasm",
  "squircle-svg.wasm",
];

function allPresent() {
  return required.every((name) => {
    const p = join(wasmDir, name);
    try {
      return existsSync(p) && statSync(p).size > 0;
    } catch {
      return false;
    }
  });
}

if (allPresent()) {
  console.log("[prepublish] WASM artifacts already present under src/wasm/.");
  process.exit(0);
}

console.error("[prepublish] WASM files missing; running `make wasm`...");
const make = spawnSync("make", ["wasm"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (make.status !== 0 || make.error) {
  console.error(
    "[prepublish] `make wasm` failed. Install Emscripten, ensure `emcc` is on PATH, run `make wasm`,",
    "then publish — or commit the four `.wasm` files under src/wasm/."
  );
  process.exit(1);
}

if (!allPresent()) {
  console.error("[prepublish] WASM files still missing after `make wasm`.");
  process.exit(1);
}

console.log("[prepublish] WASM build succeeded.");
