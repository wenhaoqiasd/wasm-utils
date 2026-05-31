/** 预加载 oklch2rgb 与 rgb2oklch 两块 WASM（幂等）。默认内联 base64；传 URL 则从外部 fetch。 */
export function init(options?: {
  /** 可选：外部托管的 oklch2rgb.wasm（绝对 URL 或相对 import.meta.url） */
  oklch2rgbUrl?: string;
  /** 可选：外部托管的 rgb2oklch.wasm */
  rgb2oklchUrl?: string;
}): Promise<void>;

/** sRGB 8 位（0–255）→ OKLCH */
export function rgb2oklch(
  r: number,
  g: number,
  b: number
): Promise<{ L: number; C: number; h: number }>;

/** OKLCH 绝对色度 → sRGB */
export function oklch2rgb_abs(
  L: number,
  C: number,
  h: number
): Promise<{ R: number; G: number; B: number }>;

/** OKLCH 相对色度 rel∈[0,1]（在 L、h 下占 gamut 色度比例）→ sRGB */
export function oklch2rgb_rel(
  L: number,
  h: number,
  rel: number
): Promise<{ R: number; G: number; B: number }>;
