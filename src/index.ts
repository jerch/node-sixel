/**
 * Copyright (c) 2019, 2021 Joerg Breitbart.
 * @license MIT
 */

export  {
  Decoder,
  DecoderAsync,
  decode,
  decodeAsync,
} from './Decoder';

export {
  sixelEncode,
  introducer,
  FINALIZER,
  image2sixel
} from './SixelEncoder';

export {
  toRGBA8888,
  fromRGBA8888,
  PALETTE_ANSI_256,
  PALETTE_VT340_COLOR,
  PALETTE_VT340_GREY,
  DEFAULT_BACKGROUND,
  DEFAULT_FOREGROUND
} from './Colors';

export {
  IDecodeResult,
  IDecoderOptions,
  RGBA8888,
  RGBColor,
  UintTypedArray
} from './Types';
