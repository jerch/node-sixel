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

/**
 * wasm decoder export interface.
 */
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

/**
 * Decoder options.
 */
export interface IDecoderOptions {
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

/**
 * Return type of decode and decodeAsync.
 */
export interface IDecodeResult {
  width: number;
  height: number;
  data32: Uint32Array;
}


/**
 * Internal types.
 */


// decoder options used internally
export type IDecoderOptionsInternal = {
  [P in keyof IDecoderOptions]-?: IDecoderOptions[P];
};

// type helper for DecoderAsync
export interface InstanceLike extends WebAssembly.Instance {
  module?: WebAssembly.Module;
  instance?: WebAssembly.Instance;
}


/**
 * OLD (to be removed)
 */

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
