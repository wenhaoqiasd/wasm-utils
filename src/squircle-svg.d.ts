export interface SquircleOptions {
  /** 默认 `./wasm/squircle-svg.wasm` */
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
