/**
 * Copyright (c) 2019 Joerg Breitbart.
 * @license MIT
 */

import { ISixelDecoder, RGBA8888, UintTypedArray } from './Types';
import { PALETTE_VT340_COLOR, DEFAULT_BACKGROUND, normalizeHLS, normalizeRGB } from './Colors';


const enum SixelState {
  DATA = 0,
  COMPRESSION = 1,
  ATTR = 2,
  COLOR = 3
}


/**
 * Params storage.
 * Used during parsing to hold up to 32 params of a SIXEL command.
 * 
 * FIXME: needs bound check!
 */
class Params {
  public length = 1;
  public params = new Uint32Array(32);
  public reset(): void {
    this.params[0] = 0;
    this.length = 1;
  }
  public addParam(): void {
    this.params[this.length++] = 0;
  }
  public addDigit(v: number): void {
    this.params[this.length - 1] = this.params[this.length - 1] * 10 + v;
  }
}

const EMPTY_PIXELS = new Uint32Array(0);
const STATIC_CANVAS = new Uint32Array(1024*1024);


/**
 * SixelDecoderL2 - highly optimized SIXEL level 2 decoder.
 * 
 * Other than the general purpose `SixelDecoder` this decoder
 * works only with SIXEL level 2 under the following assumptions:
 * - SIXEL data must start with a valid raster attribute command
 * - attributes were prefetched with `DimensionDecoder`
 * - preallocated image buffer at ctor level, pixels beyond width/height are ignored
 * - pixels are written at their final position, no rotation anymore
 * 
 * These simplifications show roughly 50% speed gain of SIXEL decoding.
 * Furthermore the separation of the dimension extraction allows this
 * decoder to run in a worker, while the terminal still can prepare
 * the needed buffer space synchronously.
 * 
 * 
 * 
 * FIXME: rewrite below ---------------------------------------<<<<<<<<<<<<<<<<<<<<<<<
 * SixelDecoder class.
 *
 * 
 * 
 * The class provides image attributes `width` and `height`.
 * With `toPixelData` the pixel data can be copied to an typed array
 * for further processing.
 *
 * `write` and `writeString` decode SIXEL data streamlined, therefore it
 * is possible to grab partial images during transmission.
 *
 * Note that the class is meant to run behind an escape sequence parser,
 * thus the data should only be the real data part of the sequence and not
 * contain the sequence introducer and finalizer.
 *
 * Further note that this class does not deal with custom pixel sizes/ratios or
 * grid sizes. It always assumes a 1:1 ratio and returns the pixel data without
 * any grid size notion. If you need strict pixel ratio and grid size handling
 * for the final output, eval the DCS SIXEL macro parameter (P1) and horizontal
 * grid size (P3) afterwards in conjunction with the raster attributes held by
 * `rasterRatioNumerator` and `rasterRatioDenominator`.
 */
export class SixelDecoderL2 {
  public rasterRatioNumerator = 0;
  public rasterRatioDenominator = 0;
  public rasterWidth = 0;
  public rasterHeight = 0;
  private _data32: Uint32Array;

  private _maxY = 0;
  private _cursor = 0;
  private _OFFSETS: number[][] = [];
  private _hasRaster = false;
  private _offset = 0;

  private _initial = SixelState.DATA;
  private _state = this._initial;
  private _params = new Params();
  private _color = this.palette[0];

  /**
   * Create a new decoder instance.
   *
   * `fillColor` sets the color of pixels that are not encoded by SIXEL data (background).
   * Depending on the second parameter of the DCS SIXEL sequence (background select - P2)
   * this should either be set to the terminal default background color (P2 = 0 or 2),
   * or to 0 to leave these pixels untouched (P2 = 1). Default is black.
   *
   * `palette` should contain the default palette of the terminal as `RGBA8888[]`.
   * The library provides 3 default palettes - 16 color VT340, 16 greyscale VT340 and
   * 256 ANSI colors (default is 16 color VT340). SIXEL data is likely to alter color entries of the palette,
   * thus make sure to clone your palette if the changes should not be terminal wide (default).
   *
   * `paletteLimit` sets a hard limit of allowed color entries. Any color definitions beyond
   * this limit will be mapped back into the allowed palette size (modulo). Historically
   * terminals had certain hardware limits to represent colors at once (VT340 up to 16 colors registers).
   * Nowadays with most outputs being RGB capable this is a lesser concern,
   * alter this value only if you need strict old device compatibility. By default
   * `paletteLimit` is set to a rather high value (65536) to allow more fine grained colors.
   * The SIXEL spec (DEC STD 070) demands at least 256 registers.
   *
   * @param fillColor background fill color
   * @param palette default palette to start with
   * @param paletteLimit Hard limit for palette slots (default 65536). Values higher than the limit get mapped back.
   */
  constructor(
    public fillColor: RGBA8888 = DEFAULT_BACKGROUND,
    public palette: RGBA8888[] = Object.assign([], PALETTE_VT340_COLOR),
    public paletteLimit: number = 65536,
    public buffer?: Uint32Array) {
    this._data32 = STATIC_CANVAS; // EMPTY_PIXELS;
  }

  /**
   * Get current memory usage of the image data in bytes.
   * Can be used to restrict image handling if memory is limited.
   *
   * Note: This only accounts the image pixel data storage, the real value
   * will be slightly higher due to some additional JS object overhead.
   */
  public get memUsage(): number {
    return this._data32.length * 4;
  }

  public get data(): Uint8ClampedArray {
    return new Uint8ClampedArray(this._data32.buffer);
  }

  /**
   * Put SIXEL `code` at current cursor position `repeat` times.
   * 
   * FIXME: Do x bound check, but no y check (shall be done in decode).
   */
  private _put(code: number, color: RGBA8888, repeat: number) {
    // FIXME: x and y bound checks!!!
    if (code && this._hasRaster) {
      const t = this._OFFSETS[code];
      const l = t.length;
      let offset = this._offset + this._cursor;
      for (let i = 0; i < l; ++i) {
        const pos = offset + t[i];
        this._data32[pos] = color;
        for (let r = 1; r < repeat; ++r) {
          this._data32[pos + r] = color;
        }
      }
    }
    this._cursor += repeat;
  }

  private _putS(code: number, color: RGBA8888) {
    // FIXME: x and y bound checks!!!
    // if (!code) return;
    const t = this._OFFSETS[code];
    const l = t.length;
    const offset = this._offset + this._cursor;
    for (let i = 0; i < l; ++i) {
      this._data32[offset + t[i]] = color;
    }
  }

  private jumper(code: number): void {
    switch (code) {
      case 33:
        this._state = SixelState.COMPRESSION;
        break;
      case 35:
        this._state = SixelState.COLOR;
        break;
      case 36:
        this._cursor = 0;
        break;
      case 45:
        this._maxY += 6;
        this._offset = this._maxY * this.rasterWidth;
        this._cursor = 0;
        break;
      case 34:
        this._state = SixelState.ATTR;
        break;
    }
  }

  public decode(data: UintTypedArray, start: number = 0, end: number = data.length): void {
    for (let i = start; i < end; ++i) {
      let code = data[i] & 0x7F;
      switch (this._state) {
        case SixelState.DATA:
          if (code > 62) {
            this._putS(code - 63, this._color);
            this._cursor++;
          } else this.jumper(code);
          break;
        case SixelState.COMPRESSION:
          if (code > 47 && code < 58) {
            this._params.addDigit(code - 48);
          } else if (code > 62) {
            this._put(code - 63, this._color, this._params.params[0]);
            this._params.reset();
            this._state = SixelState.DATA;
          } else switch (code) {
            case 33:
              this._params.addParam();
              break;
            case 35:
              this._params.reset();
              this._state = SixelState.COLOR;
              break;
            case 36:
              this._params.reset();
              this._cursor = 0;
              break;
            case 45:
              this._params.reset();
              this._maxY += 6;
              this._offset = this._maxY * this.rasterWidth;
              this._cursor = 0;
              break;
            case 34:
              this._params.reset();
              this._state = SixelState.ATTR;
              break;
          }
          break;
        case SixelState.COLOR:
          if (code > 47 && code < 58) {
            this._params.addDigit(code - 48);
          } else if (code === 59) {
            this._params.addParam();
          } else if (code > 62 || code === 33 || code === 35 || code === 36 || code === 45) {
            if (this._params.length === 1) {
              // color select with modulo palette length
              this._color = this.palette[this._params.params[0] % this.paletteLimit] >>> 0;
            } else if (this._params.length === 5) {
              // range test for all params
              // cancel whole command if not passing all
              if (this._params.params[1] < 3
                && this._params.params[1] === 1 ? this._params.params[2] <= 360 : this._params.params[2] <= 100
                && this._params.params[2] <= 100
                && this._params.params[3] <= 100) {
                switch (this._params.params[1]) {
                  case 2:  // RGB
                    this.palette[this._params.params[0] % this.paletteLimit] = this._color = normalizeRGB(
                      this._params.params[2], this._params.params[3], this._params.params[4]);
                    break;
                  case 1:  // HLS
                    this.palette[this._params.params[0] % this.paletteLimit] = this._color = normalizeHLS(
                      this._params.params[2], this._params.params[3], this._params.params[4]);
                    break;
                  case 0:  // illegal, only apply color switch
                    this._color = this.palette[this._params.params[0] % this.paletteLimit] >>> 0;
                }
              }
            }
            this._params.reset();
            if (code > 62) {
              this._put(code - 63, this._color, 1);
              this._state = SixelState.DATA;
            } else this.jumper(code);
          }
          break;
        case SixelState.ATTR:
          if (code > 47 && code < 58) {
            this._params.addDigit(code - 48);
          } else if (code === 59) {
            this._params.addParam();
          } else {
            // FIXME: to be removed
            if (!this._cursor && !this._maxY) {
              if (this._params.length === 4) {
                // Note: we only use width and height later on
                this.rasterRatioNumerator = this._params.params[0];
                this.rasterRatioDenominator = this._params.params[1];
                this.rasterWidth = this._params.params[2];
                this.rasterHeight = this._params.params[3];
                // TODO: recycle buffer? -- ctor option for external allocator
                // FIXME: move to ctor...
                //this._data32 = new Uint32Array(this.rasterWidth * this.rasterHeight);
                //this._data32.fill(this.fillColor);
                for (let i = 0; i < 64; ++i) {
                  const indices: number[] = [];
                  if (i & 1) indices.push(0 * this.rasterWidth);
                  if (i & 2) indices.push(1 * this.rasterWidth);
                  if (i & 4) indices.push(2 * this.rasterWidth);
                  if (i & 8) indices.push(3 * this.rasterWidth);
                  if (i & 16) indices.push(4 * this.rasterWidth);
                  if (i & 32) indices.push(5 * this.rasterWidth);
                  this._OFFSETS.push(indices);
                }
                this._hasRaster = true;
              }
            }
            this._params.reset();
            if (code > 62) {
              this._put(code - 63, this._color, 1);
              this._state = SixelState.DATA;
            } else this.jumper(code);
          }
      }
    }
  }

  /**
   * Decodes SIXEL bytes and updates the image data. This is done as a stream,
   * therefore it is possible to grab partially transmitted images.
   * `data` can be any array like type with single byte values per index position.
   *
   * Note: This method is only meant for the data part of a SIXEL DCS sequence,
   * to properly handle full sequences consider running `SixelDecoder` behind
   * an escape sequence parser.
   */
  public decode_old(data: UintTypedArray, start: number = 0, end: number = data.length): void {
    for (let i = start; i < end; ++i) {
      const code = data[i] & 0x7F;
      if (this._state === SixelState.DATA) {
        if (code > 62 && code < 127) this._put(code - 63, this._color, 1);
        else switch (code) {
          case 33:
            this._state = SixelState.COMPRESSION;
            break;
          case 35:
            this._state = SixelState.COLOR;
            break;
          case 36:
            this._cursor = 0;
            break;
          case 45:
            this._maxY += 6;
            this._offset = this._maxY * this.rasterWidth;
            this._cursor = 0;
            break;
          case 34:
            this._state = SixelState.ATTR;
            break;
        }
        // if (code > 62 && code < 127) {
        //   this._put(code - 63, this._color, 1);
        // } else if (code === 33) {
        //   this._state = SixelState.COMPRESSION;
        // } else if (code === 34) {
        //   this._state = SixelState.ATTR;
        // } else if (code === 35) {
        //   this._state = SixelState.COLOR;
        // } else if (code === 36) {
        //   this._cursor = 0;
        // } else if (code === 45) {
        //   this._maxY += 6;
        //   this._offset = this._maxY * this.rasterWidth;
        //   this._cursor = 0;
        // }
      } else if (this._state === SixelState.COMPRESSION) {
        if (code > 47 && code < 58) {
          this._params.addDigit(code - 48);
        } else if (code > 62 && code < 127) {
          this._put(code - 63, this._color, this._params.params[0]);
          this._params.reset();
          this._state = SixelState.DATA;
        } else if (code === 33) {
          this._params.addParam();
        } // FIXME: CR LF COLOR COMPRESSION handling missing
      } else if (this._state === SixelState.COLOR) {
        if (code > 47 && code < 58) {
          this._params.addDigit(code - 48);
        } else if (code === 59) {
          this._params.addParam();
        } else if ((code > 62 && code < 127) || code === 33 || code === 35 || code === 36 || code === 45) {

          if (this._params.length === 1) {
            // color select with modulo palette length
            this._color = this.palette[this._params.params[0] % this.paletteLimit] >>> 0;
          } else if (this._params.length === 5) {
            // range test for all params
            // cancel whole command if not passing all
            if (this._params.params[1] < 3
              && this._params.params[1] === 1 ? this._params.params[2] <= 360 : this._params.params[2] <= 100
              && this._params.params[2] <= 100
              && this._params.params[3] <= 100) {
              switch (this._params.params[1]) {
                case 2:
                  // RGB
                  this.palette[this._params.params[0] % this.paletteLimit] = this._color = normalizeRGB(
                    this._params.params[2], this._params.params[3], this._params.params[4]);
                  break;
                case 1:
                  // HLS
                  this.palette[this._params.params[0] % this.paletteLimit] = this._color = normalizeHLS(
                    this._params.params[2], this._params.params[3], this._params.params[4]);
                  break;
                case 0:
                  // illegal, only apply color switch
                  this._color = this.palette[this._params.params[0] % this.paletteLimit] >>> 0;
              }
            }
          }
          this._params.reset();
          if (code > 62 && code < 127) {
            this._put(code - 63, this._color, 1);
            this._state = SixelState.DATA;
          } else if (code === 33) {
            this._state = SixelState.COMPRESSION;
          } else if (code === 34) {
            this._state = SixelState.ATTR;
          } else if (code === 35) {
            this._state = SixelState.COLOR;
          } else if (code === 36) {
            this._cursor = 0;
          } else if (code === 45) {
            this._maxY += 6;
            this._offset = this._maxY * this.rasterWidth;
            this._cursor = 0;
          }
        }
      } else {
        if (code > 47 && code < 58) {
          this._params.addDigit(code - 48);
        } else if (code === 59) {
          this._params.addParam();
        } else {
          if (!this._cursor && !this._maxY) {
            if (this._params.length === 4) {
              // Note: we only use width and height later on
              this.rasterRatioNumerator = this._params.params[0];
              this.rasterRatioDenominator = this._params.params[1];
              this.rasterWidth = this._params.params[2];
              this.rasterHeight = this._params.params[3];
              // TODO: recycle buffer? -- ctor option for external allocator
              // FIXME: move to ctor...
              this._data32 = new Uint32Array(this.rasterWidth * this.rasterHeight);
              this._data32.fill(this.fillColor);
              for (let i = 0; i < 64; ++i) {
                const indices: number[] = [];
                if (i & 1) indices.push(0 * this.rasterWidth);
                if (i & 2) indices.push(1 * this.rasterWidth);
                if (i & 4) indices.push(2 * this.rasterWidth);
                if (i & 8) indices.push(3 * this.rasterWidth);
                if (i & 16) indices.push(4 * this.rasterWidth);
                if (i & 32) indices.push(5 * this.rasterWidth);
                this._OFFSETS.push(indices);
              }
              this._hasRaster = true;
            }
          }
          this._params.reset();
          if (code > 62 && code < 127) {
            this._put(code - 63, this._color, 1);
            this._state = SixelState.DATA;
          } else if (code === 33) {
            this._state = SixelState.COMPRESSION;
          } else if (code === 34) {
            this._state = SixelState.ATTR;
          } else if (code === 35) {
            this._state = SixelState.COLOR;
          } else if (code === 36) {
            this._cursor = 0;
          } else if (code === 45) {
            this._maxY += 6;
            this._offset = this._maxY * this.rasterWidth;
            this._cursor = 0;
          }
        }
      }
    }
  }

  // FIXME: to be removed
  public toPixelData(
    target: Uint8ClampedArray, width: number, height: number,
    dx: number = 0, dy: number = 0,
    sx: number = 0, sy: number = 0, swidth: number = this.width, sheight: number = this.height,
    fillColor: RGBA8888 = this.fillColor): Uint8ClampedArray {
    new Uint32Array(target.buffer).set(this._data32);
    return target;
  }
  private _buffer: Uint8Array;
  public decodeString(data: string, start: number = 0, end: number = data.length): void {
    if (!this._buffer || this._buffer.length < end - start) {
      this._buffer = new Uint8Array(end - start);
    }
    let j = 0;
    for (let i = start; i < end; ++i) {
      this._buffer[j++] = data.charCodeAt(i);
    }
    this.decode(this._buffer, 0, j);
  }
  public get width(): number {
    return this.rasterWidth;
  }
  public get height(): number {
    return this.rasterHeight;
  }
  public get realWidth(): number {
    return this.rasterWidth;
  }
  public get realHeight(): number {
    return this.rasterHeight;
  }

  public pixelPtr(): Uint32Array {
    return this._data32.subarray(0, this.width * this.height);
  }
}

