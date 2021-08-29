/**
 * Copyright (c) 2021 Joerg Breitbart.
 * @license MIT
 */

export  {
  Decoder,
  DecoderAsync,
  decode,
  decodeAsync,
} from './Decoder';
export {
  toRGBA8888,
  fromRGBA8888,
  PALETTE_ANSI_256,
  PALETTE_VT340_COLOR,
  PALETTE_VT340_GREY
} from './Colors';
export {
  IDecodeResult,
  IDecoderOptions as ISixelDecoderOptions,
  RGBA8888,
  RGBColor
} from './Types';
