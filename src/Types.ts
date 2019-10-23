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
