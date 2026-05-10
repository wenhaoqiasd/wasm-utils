#!/usr/bin/env bash
# One-shot builder: native (macOS) + WASM + smoke tests
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="${SCRIPT_DIR%/scripts}"
cd "$ROOT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

say() { printf "${YELLOW}==>${NC} %s\n" "$*"; }
ok() { printf "${GREEN}[OK]${NC} %s\n" " $*"; }
fail() { printf "${RED}[FAIL]${NC} %s\n" " $*"; }

mkdir -p bin src/wasm

say "Building native binaries (clang)"
clang -O3 -march=native -ffast-math -std=c11 native/oklch2rgb.c -o bin/oklch2rgb
clang -O3 -march=native -ffast-math -std=c11 native/rgb2oklch.c -o bin/rgb2oklch
clang -O3 -ffast-math -std=c11 native/extract-colors.c -o bin/extract-colors \
  -framework ImageIO -framework CoreGraphics -framework CoreFoundation
clang -O3 -march=native -ffast-math -std=c11 native/squircle_svg.c -o bin/squircle_svg
ok "Native build done"

if ! command -v emcc >/dev/null 2>&1; then
  fail "emcc not found in PATH. Install Emscripten or source emsdk_env.sh"
  exit 1
fi

say "Building WASM (standalone, no entry)"
emcc -O3 -ffast-math -s STANDALONE_WASM=1 -Wl,--no-entry \
  -Wl,--export=oklch2rgb_calc_js -Wl,--export=oklch2rgb_calc_rel_js \
  native/oklch2rgb.c -o src/wasm/oklch2rgb.wasm
emcc -O3 -ffast-math -s STANDALONE_WASM=1 -Wl,--no-entry \
  -Wl,--export=rgb2oklch_calc_js \
  native/rgb2oklch.c -o src/wasm/rgb2oklch.wasm
emcc -O3 -ffast-math -s STANDALONE_WASM=1 -Wl,--no-entry \
  -Wl,--export=get_pixels_buffer -Wl,--export=extract_colors_from_rgba_js \
  native/extract-colors.c -o src/wasm/extract-colors.wasm
emcc -O3 -ffast-math -s STANDALONE_WASM=1 -Wl,--no-entry \
  -Wl,--export=squircle_path_js -Wl,--export=capsule_path_js \
  native/squircle_svg.c -o src/wasm/squircle-svg.wasm
ok "WASM build done"

say "Running smoke tests"
OC_OUT=$(bin/oklch2rgb 0.7 0.2 30)
if [ "$OC_OUT" = "255 101 81" ]; then
  ok "oklch2rgb: 0.7 0.2 30 => $OC_OUT"
else
  fail "oklch2rgb unexpected: $OC_OUT (expected 255 101 81)"
  exit 2
fi

RO_OUT=$(bin/rgb2oklch 255 255 255)
if [ "$RO_OUT" = "1 0 0" ]; then
  ok "rgb2oklch: 255 255 255 => $RO_OUT"
else
  fail "rgb2oklch unexpected: $RO_OUT (expected 1 0 0)"
  exit 3
fi

say "All done"
