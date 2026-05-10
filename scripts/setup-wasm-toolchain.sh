#!/usr/bin/env bash
# Optional one-shot: install Emscripten SDK under ./emsdk (gitignored), then make wasm.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ ! -f "$ROOT/emsdk/emsdk" ]]; then
  echo "Cloning emsdk into $ROOT/emsdk ..."
  git clone --depth 1 https://github.com/emscripten-core/emsdk.git "$ROOT/emsdk"
fi
cd "$ROOT/emsdk"
./emsdk install latest
./emsdk activate latest
# shellcheck disable=SC1091
source ./emsdk_env.sh
cd "$ROOT"
make wasm
echo "OK: WASM outputs in src/wasm/"
