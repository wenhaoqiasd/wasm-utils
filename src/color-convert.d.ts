/** 预加载 oklch2rgb 与 rgb2oklch 两块 WASM（幂等）。 */
export function init(options?: {
  /** 默认 `./wasm/oklch2rgb.wasm`（相对本模块）或完整 URL */
  oklch2rgbUrl?: string;
  /** 默认 `./wasm/rgb2oklch.wasm` */
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
