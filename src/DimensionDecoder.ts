/**
 * Copyright (c) 2021 Joerg Breitbart.
 * @license MIT
 */

import { Params } from './Params';
import { UintTypedArray, SixelState, ISixelDimensions } from './Types';


/**
 * Helper decoder to get image dimensions from raster attributes.
 * 
 * Useful to synchronously extract image dimensions,
 * while the expensive data decoding can be offloaded.
 * 
 * Meant to be used in conjunction with a level 2 decoder as follows:
 * - feed early chunks to DimensionDecoder until it returns a `ISixelDimensions`
 * - level 2 result: use `width` and `height` to create a SixelDecoderL2 instance
 *   and resume async decoding at `result.index` of the last chunk in the new decoder instance
 * - level 1 result: no valid raster attributes could be derived, image can only be decoded
 *   synchronously by SixelDecoder with real band handling (again feed from `result.index`)
 * 
 * After calling `reset` the decoder instance can be reused with a new SIXEL data stream.
 */
export class DimensionDecoder {
  private _state = SixelState.DATA;
  private _params = new Params();
  private _buffer = new Uint8Array(64);

  public decodeString(data: string, start: number = 0, end: number = data.length): ISixelDimensions | undefined {
    let p = start;
    while (p < end) {
      const length = Math.min(end - p, 64);
      let j = p;
      for (let i = 0; i < length; ++i, ++j) {
        this._buffer[i] = data.charCodeAt(j);
      }
      const dim = this.decode(this._buffer, 0, length);
      if (dim) {
        dim.index += p;
        return dim;
      }
      p += length;
    }
  }

  public decode(data: UintTypedArray, start: number = 0, end: number = data.length): ISixelDimensions | undefined {
    for (let i = start; i < end; ++i) {
      const code = data[i];
      if (this._state === SixelState.DATA) {
        if ((code > 62 && code < 127) || code === 33 || code === 35 || code === 36 || code === 45) {
          return { numerator: -1, denominator: -1, width: -1, height: -1, index: i, level: 1 };
        } else if (code === 34) {
          this._state = SixelState.ATTR;
        }
      } else if (this._state === SixelState.ATTR) {
        if (code > 46 && code < 58) {
          this._params.addDigit(code - 48);
        } else if (code === 59) {
          this._params.addParam();
        } else {
          if (this._params.length === 4) {
            return {
              numerator: this._params.params[0],
              denominator: this._params.params[1],
              width: this._params.params[2],
              height: this._params.params[3],
              index: i,
              level: 2
            };
          }
          return { numerator: -1, denominator: -1, width: -1, height: -1, index: i, level: 1 };
        }
      }
    }
  }

  public reset(): void {
    this._params.reset();
    this._state = SixelState.DATA;
  }
}
