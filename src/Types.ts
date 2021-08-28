/**
 * Copyright (c) 2019 Joerg Breitbart.
 * @license MIT
 */


/**
 * This type denotes the byte order for 32 bit color values.
 * The resulting word order depends on the system endianess:
 *  - big endian    - RGBA32
 *  - little endian - ABGR32
 *
 * Use `toRGBA8888` and `fromRGBA8888` to convert the color values
 * respecting the system endianess.
 *
 * Note: BE handling got removed from the library, thus this type
 * will always contain ABGR32.
 */
export type RGBA8888 = number;

/**
 * Unsigned typed array supported by `SixelDecoder.decode`.
 */
export type UintTypedArray = Uint8Array | Uint16Array | Uint32Array;

/**
 * RGB color as array of channels (without alpha channel).
 */
export type RGBColor = [number, number, number];

/**
 * Return value from internal quantizer.
 */
export interface IQuantResult {
  /** image data as palette indices (max. 2^16 colors supported) */
  indices: Uint16Array;
  /** array with quantized colors */
  palette: number[];
}









export interface IWasmDecoderExports extends Record<string, WebAssembly.ExportValue> {
  memory: WebAssembly.Memory;
  get_state_address(): number;
  get_chunk_address(): number;
  get_p0_address(): number;
  get_palette_address(): number;
  init(sixelColor: number, fillColor: number, paletteLimit: number, truncate: number): void;
  decode(start: number, end: number): void;
  current_width(): number;
}

export interface ISixelDecoderOptions {
  /**
   * Maximum memory in bytes a decoder instance is allowed to allocate during decoding.
   * Exceeding this value will reset the decoder (abort current decoding + release memory)
   * and throw an exception.
   * The default of 256 MB is chosen rather high as an emergency stop.
   * Setting this to 0 will skip the memory checks.
   */
  memoryLimit?: number;
  /**
   * Standard sixel foreground color (default: white).
   * This color should have a high contrast to the background fill color.
   * The value can be overridden for individual images at `init`.
   */
  sixelColor?: RGBA8888;
  /**
   * Standard background fill color (default: black).
   * This color should have a high contrast to the sixel foreground color.
   * The value can be overridden for individual images at `init`.
   */
  fillColor?: RGBA8888;
  /**
   * Standard palette to be used by the decoder.
   * Default is 16-color palette of VT340 (PALETTE_VT340_COLOR).
   */
  palette?: Uint32Array;
  /**
   * Standard palette size limit.
   * Color registers in image data exceeding this value will be mapped back with modulo.
   * Default is 256, as suggest by the specification.
   * Maximum is the wasm compile time setting PALETTE_SIZE (default: 4096).
   */
  paletteLimit?: number;
  /**
   * Whether to allow truncating of the image to given dimensions from raster attributes.
   * This setting only applies to images, that follow the level 2 format.
   * Default is true.
   */
  truncate?: boolean;
}

export type ISixelDecoderOptionsInternal = {
  [P in keyof ISixelDecoderOptions]-?: ISixelDecoderOptions[P];
};

export interface InstanceLike extends WebAssembly.Instance {
  module?: WebAssembly.Module;
  instance?: WebAssembly.Instance;
}

export interface IDecodeResult {
  width: number;
  height: number;
  data32: Uint32Array;
}







// OLD (to be removed)

export interface IRasterAttributes {
  numerator: number;
  denominator: number;
  width: number;
  height: number;
}

export interface ISixelDecoderCtor {
  new(opts?: ISixelDecoderOptionsInternal): ISixelDecoder;
}

export interface ISixelDecoder {
  width: number;
  height: number;
  rasterAttributes: IRasterAttributes;
  realWidth: number;
  realHeight: number;
  fillColor: RGBA8888;
  memoryUsage: number;
  decode(data: UintTypedArray, start?: number, end?: number): void;
  decodeString(data: string, start: number, end: number): void;
  newImage(fillColor?: number, palette?: Uint32Array, paletteLimit?: number): void;
  reset?(): void;

  // image data
  palette: Uint32Array;     // palette colors - issue: how to go about fill color? (xterm uses slot 0)
  data32?: Uint32Array;     // pixels in RGBA | indexed (with fillColor at paletteLength)

  // do we need this?maybe to do indexed --> canvas transition for terminal mode, NOOP in printer mode
  endImage?(): Uint8Array | Uint16Array | Uint32Array;
}

export interface ISixelDecoderImpl {
  width: number;
  height: number;
  init(width: number, height: number, fillColor?: RGBA8888, palette?: Uint32Array, paletteLimit?: number): void;
  decode(data: UintTypedArray, start?: number, end?: number): void;
  decodeString(data: string, start?: number, end?: number): void;
  readonly data32: Uint32Array;
  readonly palette: Uint32Array;
  readonly memoryUsage: number;
}


export const enum SixelState {
  DATA = 0,
  COMPRESSION = 1,
  ATTR = 2,
  COLOR = 3
}

export const enum SixelAction {
  IGNORE = 0,
  DRAW = 1,
  CR = 2,
  LF = 3,
  REPEATED_DRAW = 4,
  STORE_PARAM = 5,
  SHIFT_PARAM = 6,
  APPLY_PARAM = 7
}

export interface ISixelDimensions {
  // pixel ratio values (ignored by SixelDecoder)
  numerator: number;
  denominator: number;
  // image width
  width: number;
  // image height
  height: number;
  // index in active chunk to continue decoding
  index: number;
  // SIXEL conformance level
  level: 1 | 2;
}
