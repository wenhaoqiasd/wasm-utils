SHELL := /bin/bash

# Compiler settings
CC      ?= clang
CFLAGS  ?= -O3 -ffast-math -std=c11
NATIVE_EXTRA ?= -march=native

# Emscripten settings
EMCC    ?= emcc
EMFLAGS ?= -O3 -ffast-math -s STANDALONE_WASM=1 -Wl,--no-entry

NATIVE_DIR := native
BIN_DIR    := bin
WASM_DIR   := src/wasm

# Files
NATIVE_BINS := $(BIN_DIR)/oklch2rgb $(BIN_DIR)/rgb2oklch $(BIN_DIR)/extract-colors $(BIN_DIR)/squircle_svg
WASM_BINS   := $(WASM_DIR)/oklch2rgb.wasm $(WASM_DIR)/rgb2oklch.wasm $(WASM_DIR)/extract-colors.wasm $(WASM_DIR)/squircle-svg.wasm

.PHONY: all native wasm test clean

all: native wasm test

native: $(BIN_DIR) $(NATIVE_BINS)

$(BIN_DIR)/oklch2rgb: $(NATIVE_DIR)/oklch2rgb.c | $(BIN_DIR)
	$(CC) $(CFLAGS) $(NATIVE_EXTRA) $< -o $@

$(BIN_DIR)/rgb2oklch: $(NATIVE_DIR)/rgb2oklch.c | $(BIN_DIR)
	$(CC) $(CFLAGS) $(NATIVE_EXTRA) $< -o $@

$(BIN_DIR)/extract-colors: $(NATIVE_DIR)/extract-colors.c | $(BIN_DIR)
	$(CC) $(CFLAGS) $< -o $@ \
	  -framework ImageIO -framework CoreGraphics -framework CoreFoundation

$(BIN_DIR)/squircle_svg: $(NATIVE_DIR)/squircle_svg.c | $(BIN_DIR)
	$(CC) $(CFLAGS) $(NATIVE_EXTRA) $< -o $@

wasm: $(WASM_DIR) $(WASM_BINS)
	node scripts/embed-wasm-base64.js

$(WASM_DIR)/oklch2rgb.wasm: $(NATIVE_DIR)/oklch2rgb.c | $(WASM_DIR)
	$(EMCC) $(EMFLAGS) \
	  -Wl,--export=oklch2rgb_calc_js \
	  -Wl,--export=oklch2rgb_calc_rel_js \
	  $< -o $@

$(WASM_DIR)/rgb2oklch.wasm: $(NATIVE_DIR)/rgb2oklch.c | $(WASM_DIR)
	$(EMCC) $(EMFLAGS) \
	  -Wl,--export=rgb2oklch_calc_js \
	  $< -o $@

$(WASM_DIR)/extract-colors.wasm: $(NATIVE_DIR)/extract-colors.c | $(WASM_DIR)
	$(EMCC) $(EMFLAGS) \
	  -Wl,--export=get_pixels_buffer \
	  -Wl,--export=extract_colors_from_rgba_js \
	  $< -o $@

$(WASM_DIR)/squircle-svg.wasm: $(NATIVE_DIR)/squircle_svg.c | $(WASM_DIR)
	$(EMCC) $(EMFLAGS) \
	  -Wl,--export=squircle_path_js \
	  -Wl,--export=capsule_path_js \
	  $< -o $@

$(BIN_DIR):
	mkdir -p $(BIN_DIR)

$(WASM_DIR):
	mkdir -p $(WASM_DIR)

test: native
	@set -e; \
	OC_OUT=$$($(BIN_DIR)/oklch2rgb 0.7 0.2 30); \
	if [[ "$$OC_OUT" == "255 101 81" ]]; then \
	  echo "[OK] oklch2rgb: $$OC_OUT"; \
	else \
	  echo "[FAIL] oklch2rgb => $$OC_OUT (expect 255 101 81)"; exit 2; \
	fi; \
	RO_OUT=$$($(BIN_DIR)/rgb2oklch 255 255 255); \
	if [[ "$$RO_OUT" == "1 0 0" ]]; then \
	  echo "[OK] rgb2oklch: $$RO_OUT"; \
	else \
	  echo "[FAIL] rgb2oklch => $$RO_OUT (expect 1 0 0)"; exit 3; \
	fi; \
	if command -v node >/dev/null 2>&1; then \
	  node scripts/verify_capsule_equiv.js; \
	else \
	  echo "[SKIP] capsule verify (node not found)"; \
	fi

clean:
	rm -f $(NATIVE_BINS)
	rm -f $(WASM_BINS)
