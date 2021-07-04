/**
 * Copyright (c) 2019 Joerg Breitbart.
 * @license MIT
 */


/**
 * This type denotes the byte order for 32 bit color values.
 * The resulting word order depends on the system endianess:
 *  - big endian    - RGBA32
 *  - bittle endian - ABGR32
 *
 * Use `toRGBA8888` and `fromRGBA8888` to convert the color values
 * respecting the system endianess.
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


export interface ISixelDecoder {
  /** basic image dimensions, either set upfront in ctor (wasm) or determined at runtime */
  width: number;
  height: number;
  decode(data: UintTypedArray, start?: number, end?: number): void;
  /** pixel data in RGBA32 */
  data32: Uint32Array;

  // upcoming settings
  operationMode?: 'terminal' | 'printer';  // make terminal indirection working
  palette: Uint32Array;                   // for real terminal-shared to get/set palette: []RGBA888

  // questionable, yet easy to polyfill
  rasterWidth?: number;
  rasterHeight?: number;
  rasterRatioNumerator?: number;
  rasterRatioDenominator?: number;
  fillColor?: RGBA8888;
  memoryUsage?: number;
  decodeString?(data: string, start: number, end: number): void;

  // questionable, tricky to polyfill/to be removed
  realWidth?: number;
  realHeight?: number;
  toPixelData?(): void;
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
