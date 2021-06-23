/**
 * Copyright (c) 2019 Joerg Breitbart.
 * @license MIT
 */

export { RGBA8888, RGBColor } from './Types';
export { toRGBA8888, fromRGBA8888, DEFAULT_BACKGROUND, PALETTE_ANSI_256, PALETTE_VT340_COLOR, PALETTE_VT340_GREY } from './Colors';
export { SixelDecoder } from './SixelDecoder';
export { sixelEncode, introducer, FINALIZER, image2sixel } from './SixelEncoder';
export { DimensionDecoder } from './DimensionDecoder';
export { WasmDecoder, WasmDecoderAsync, canUseWasm } from './WasmDecoder';
