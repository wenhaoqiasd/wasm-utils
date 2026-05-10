export interface ExtractColorSwatch {
  hex: string;
  red: number;
  green: number;
  blue: number;
  area: number;
  hue: number;
  saturation: number;
  lightness: number;
  intensity: number;
}

export interface ExtractColorsOptions {
  /** 默认 `./wasm/extract-colors.wasm` */
  wasmUrl?: string;
  pixels?: number;
  distance?: number;
  saturationDistance?: number;
  lightnessDistance?: number;
  hueDistance?: number;
  crossOrigin?: string;
  colorValidator?: (r: number, g: number, b: number, a: number) => boolean;
}

export function initExtractColorsWasm(options?: Pick<ExtractColorsOptions, "wasmUrl">): Promise<void>;

declare function extractColors(
  input: string | HTMLImageElement | ImageData | { data: ArrayLike<number>; width: number; height: number },
  opts?: ExtractColorsOptions
): Promise<ExtractColorSwatch[]>;

export default extractColors;
