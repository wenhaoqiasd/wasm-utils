export interface SquircleOptions {
  /** 可选：外部托管的 squircle-svg.wasm（绝对 URL 或相对 import.meta.url）；默认内联 base64 */
  wasmUrl?: string;
}

export function initSquircleWasm(options?: SquircleOptions): Promise<void>;

export function getSquircle(
  width: number,
  height: number,
  radius: number,
  options?: SquircleOptions
): Promise<string>;

export function getCapsule(
  width: number,
  height: number,
  radius: number,
  options?: SquircleOptions
): Promise<string>;

export function getPath(
  shape: "squircle" | "capsule" | string,
  width: number,
  height: number,
  radius: number,
  options?: SquircleOptions
): Promise<string>;
