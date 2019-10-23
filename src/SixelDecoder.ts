/**
 * Copyright (c) 2019 Joerg Breitbart.
 * @license MIT
 */

import { RGBA8888, UintTypedArray } from './Types';
import { PALETTE_VT340_COLOR, DEFAULT_BACKGROUND, normalizeHLS, normalizeRGB } from './Colors';

// lookup table for for index offsets of SIXEL codes
const OFFSETS: number[][] = [];
for (let i = 0; i < 64; ++i) {
  const indices: number[] = [];
  if (i & 1)  indices.push(0);
  if (i & 2)  indices.push(1);
  if (i & 4)  indices.push(2);
  if (i & 8)  indices.push(3);
  if (i & 16) indices.push(4);
  if (i & 32) indices.push(5);
  OFFSETS.push(indices);
}

/**
 * Class to hold a single sixel band.
 * Used by the parser to hold sixel band data.
 */
class SixelBand {
  public cursor = 0;
  public width = 0;
  public data: Uint32Array;
  constructor(length: number = 4) {
    this.data = new Uint32Array(length * 6);
  }

  /**
   * Get current memory usage of the band.
   */
  public get memUsage(): number {
    // FIXME: calc other stuff too?
    return this.data.length * 4;
  }

  /**
   * Calculate real band height from pixels set.
   */
  public getHeight(): number {
    for (let row = 5; row >= 0; --row) {
      const end = this.width * 6 + row;
      for (let pos = row; pos < end; pos += 6) {
        if (this.data[pos]) {
          return row + 1;
        }
      }
    }
    return 0;
  }

  /**
   * Put a sixel to the band.
   * Called by the parser for any data byte of the sixel stream.
   */
  public put(code: number, color: RGBA8888, repeat: number): void {
    let pos = this.cursor * 6;
    // resize by power of 2 if needed
    const lastPos = pos + repeat * 6 - 6;
    if (lastPos >= this.data.length) {
      let length = this.data.length;
      while (lastPos >= (length *= 2));
      const data = new Uint32Array(length);
      data.set(this.data);
      this.data = data;
    }
    // update cursor and width
    this.cursor += repeat;
    this.width = Math.max(this.width, this.cursor);
    // update data
    if (code) {
      const t = OFFSETS[code];
      const l = t.length;
      while (repeat--) {
        for (let i = 0; i < l; ++i) {
          this.data[pos + t[i]] = color;
        }
        pos += 6;
      }
    }
  }

  /**
   * Copy a single row of pixels to `target`.
   * Low level method to access the band's image data.
   * Not for direct usage (no bound checks), use `SixelImage.toImageData` instead.
   */
  public copyPixelRow(target: Uint32Array, offset: number, row: number, start: number, length: number): void {
    const end = Math.min(this.width, start + length);
    let sOffset = start * 6 + row;
    let pixel = 0;
    for (let i = start; i < end; ++i) {
      if (pixel = this.data[sOffset]) {
        target[offset + i] = pixel;
      }
      sOffset += 6;
    }
  }
}


/**
 * Parser:
 * FIXME - better STD 070 conformance
 *
 * STATE          MEANING                   ACTION                    NEXT STATE
 * DATA
 *    63 - 126    data bytes                draw                      DATA
 *    33 !        compression               ignore                    COMPRESSION
 *    34 "        raster attributes         ignore                    ATTR
 *    35 #        color                     ignore                    COLOR
 *    36 $        carriage return           cr                        DATA
 *    45 -        line feed                 lf                        DATA
 *    other                                 ignore                    DATA
 *
 * COMPRESSION
 *    48 - 57     digits                    store param               COMPRESSION
 *    63 - 126    data bytes                repeated draw             DATA
 *    33 !        compression               shift param               COMPRESSION
 *    other                                 ignore                    COMPRESSION
 *
 * ATTR
 *    48 - 57     digits                    store param               ATTR
 *    59 ;        param separator           shift param               ATTR
 *    63 - 126    data bytes                apply param(ATTR)*        DATA
 *    33 !        compression               apply param(ATTR)         COMPRESSION
 *    34 "        raster attributes         apply param(ATTR)         ATTR
 *    35 #        color                     apply param(ATTR)         COLOR
 *    36 $        carriage return           apply param(ATTR)         DATA
 *    45 -        line feed                 apply param(ATTR)         DATA
 *    other                                 ignore                    ATTR
 *
 * COLOR
 *    48 - 57     digits                    store param               COLOR
 *    59 ;        param separator           shift param               COLOR
 *    63 - 126    data bytes                apply param(COLOR)*       DATA
 *    33 !        compression               apply param(COLOR)        COMPRESSION
 *    34 "        raster attributes         apply param(COLOR)        ATTR
 *    35 #        color                     apply param(COLOR)        COLOR
 *    36 $        carriage return           apply param(COLOR)        DATA
 *    45 -        line feed                 apply param(COLOR)        DATA
 *    other                                 ignore                    COLOR
 *
 * * need to draw here (inspect next state)
 */

const enum SixelState {
  DATA = 0,
  COMPRESSION = 1,
  ATTR = 2,
  COLOR = 3
}

const enum SixelAction {
  IGNORE = 0,
  DRAW = 1,
  CR = 2,
  LF = 3,
  REPEATED_DRAW = 4,
  STORE_PARAM = 5,
  SHIFT_PARAM = 6,
  APPLY_PARAM = 7
}

function r(low: number, high: number): number[] {
  let c = high - low;
  const arr = new Array(c);
  while (c--) {
    arr[c] = --high;
  }
  return arr;
}

class TransitionTable {
  public table: Uint8Array;
  constructor(length: number) {
    this.table = new Uint8Array(length);
  }
  add(code: number, state: number, action: number, next: number): void {
    this.table[state << 7 | code] = action << 4 | next;
  }
  addMany(codes: number[], state: number, action: number, next: number): void {
    for (let i = 0; i < codes.length; i++) {
      this.table[state << 7 | codes[i]] = action << 4 | next;
    }
  }
}

const SIXEL_TABLE = (() => {
  const table = new TransitionTable(512); //  4 STATES * 128 codes --> max. index (3 << 7) | 127
  const states: number[] = r(SixelState.DATA, SixelState.COLOR + 1);
  let state: any;

  // default transition for all states
  for (state in states) {
    // Note: ignore never changes state
    table.addMany(r(0x00, 0x80), state, SixelAction.IGNORE, state);
  }
  // DATA state
  table.addMany(r(63, 127), SixelState.DATA, SixelAction.DRAW, SixelState.DATA);
  table.add(33, SixelState.DATA, SixelAction.IGNORE, SixelState.COMPRESSION);
  table.add(34, SixelState.DATA, SixelAction.IGNORE, SixelState.ATTR);
  table.add(35, SixelState.DATA, SixelAction.IGNORE, SixelState.COLOR);
  table.add(36, SixelState.DATA, SixelAction.CR, SixelState.DATA);
  table.add(45, SixelState.DATA, SixelAction.LF, SixelState.DATA);
  // COMPRESSION
  table.addMany(r(48, 58), SixelState.COMPRESSION, SixelAction.STORE_PARAM, SixelState.COMPRESSION);
  table.addMany(r(63, 127), SixelState.COMPRESSION, SixelAction.REPEATED_DRAW, SixelState.DATA);
  table.add(33, SixelState.COMPRESSION, SixelAction.SHIFT_PARAM, SixelState.COMPRESSION);
  // ATTR
  table.addMany(r(48, 58), SixelState.ATTR, SixelAction.STORE_PARAM, SixelState.ATTR);
  table.add(59, SixelState.ATTR, SixelAction.SHIFT_PARAM, SixelState.ATTR);
  table.addMany(r(63, 127), SixelState.ATTR, SixelAction.APPLY_PARAM, SixelState.DATA);
  table.add(33, SixelState.ATTR, SixelAction.APPLY_PARAM, SixelState.COMPRESSION);
  table.add(34, SixelState.ATTR, SixelAction.APPLY_PARAM, SixelState.ATTR);
  table.add(35, SixelState.ATTR, SixelAction.APPLY_PARAM, SixelState.COLOR);
  table.add(36, SixelState.ATTR, SixelAction.APPLY_PARAM, SixelState.DATA);
  table.add(45, SixelState.ATTR, SixelAction.APPLY_PARAM, SixelState.DATA);
  // COLOR
  table.addMany(r(48, 58), SixelState.COLOR, SixelAction.STORE_PARAM, SixelState.COLOR);
  table.add(59, SixelState.COLOR, SixelAction.SHIFT_PARAM, SixelState.COLOR);
  table.addMany(r(63, 127), SixelState.COLOR, SixelAction.APPLY_PARAM, SixelState.DATA);
  table.add(33, SixelState.COLOR, SixelAction.APPLY_PARAM, SixelState.COMPRESSION);
  table.add(34, SixelState.COLOR, SixelAction.APPLY_PARAM, SixelState.ATTR);
  table.add(35, SixelState.COLOR, SixelAction.APPLY_PARAM, SixelState.COLOR);
  table.add(36, SixelState.COLOR, SixelAction.APPLY_PARAM, SixelState.DATA);
  table.add(45, SixelState.COLOR, SixelAction.APPLY_PARAM, SixelState.DATA);
  return table;
})();

/**
 * Params storage.
 * Used during parsing to hold up to 32 params of a SIXEL command.
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


/**
 * SixelDecoder class.
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
export class SixelDecoder {
  public bands: SixelBand[] = [];
  public rasterRatioNumerator = 0;
  public rasterRatioDenominator = 0;
  public rasterWidth = 0;
  public rasterHeight = 0;

  private _initialState = SixelState.DATA;
  private _currentState = this._initialState;
  private _params = new Params();
  private _currentColor = this.palette[0];
  private _currentBand: SixelBand;
  private _buffer: Uint8Array;

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
    public paletteLimit: number = 65536)
  {
    this._currentBand = new SixelBand(4);
    this.bands.push(this._currentBand);
  }

  /**
   * Pixel width of the image. May update during `write`, either from raster attributes or the longest
   * SIXEL band found. Other than stated in the SIXEL specification (DEC STD 070) a width from raster
   * attributes takes precedence, for spec conform behavior use `realWidth` instead.
   */
  public get width(): number {
    return this.rasterWidth || this.realWidth;
  }

  /**
   * Pixel height of the image. May update during `write`, either from raster attributes or the longest
   * SIXEL band found. Other than stated in the SIXEL specification (DEC STD 070) a height from raster
   * attributes takes precedence, for spec conform behavior use `realHeight` instead.
   */
  public get height(): number {
    return this.rasterHeight || this.realHeight;
  }

  /**
   * Real height of the image. Other than `width` this returns the real height taken
   * by image data, which can differ from the value given by raster attributes.
   * `realWidth` is more in line with DEC STD 070, by which image handling should
   * not rely on raster attributes. We still default to `width` in `toPixelData` since
   * the raster attributes most likely reflect the image creator's intention better.
   */
  public get realWidth(): number {
    return Math.max.apply(null, this.bands.map(el => el.width));
  }

  /**
   * Real height of the image. Other than `height` this returns the real height taken
   * by image data, which can differ from the value given by raster attributes.
   * `realHeight` is more in line with DEC STD 070, by which image handling should
   * not rely on raster attributes. We still default to `height` in `toPixelData` since
   * the raster attributes most likely reflect the image creator's intention better.
   * 
   * Note: The height of the last band is handled special - if it contains no image data
   * (empty line of 6 pixel rows) we interpret it as an intentional empty line feed,
   * thus count the full height as 6 pixels. For partial data we calculate the real height.
   */
  public get realHeight(): number {
    if (this.bands.length === 1 && !this.bands[0].getHeight()) return 0;
    return (this.bands.length - 1) * 6 + this.bands[this.bands.length - 1].getHeight() || 6;
  }

  /**
   * Get current memory usage of the image data in bytes.
   * Can be used to restrict image handling if memory is limited.
   * 
   * Note: This only accounts the image pixel data storage, the real value
   * will be slightly higher due to some additional JS object overhead.
   */
  public get memUsage(): number {
    return this.bands.reduce((accu, cur) => accu + cur.memUsage, 0);
  }

  /**
   * Decodes SIXEL string and updates the image data.
   * Same as `decode` but with string data instead.
   */
  public decodeString(data: string, start: number = 0, end: number = data.length): void {
    if (!this._buffer || this._buffer.length < end -start) {
      this._buffer = new Uint8Array(end - start);
    }
    let j = 0;
    for (let i = start; i < end; ++i) {
      this._buffer[j++] = data.charCodeAt(i);
    }
    this.decode(this._buffer, 0, j);
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
  public decode(data: UintTypedArray, start: number = 0, end: number = data.length): void {
    let currentState = this._currentState;
    let band: SixelBand = this._currentBand;
    let color: RGBA8888 = this._currentColor;
    let params = this._params;

    for (let i = start; i < end; ++i) {
      // STD 070: GR --> GL (stripping 8th bit), C1 should not never occur here
      // (already handled by escape sequence parser)
      let code = data[i] & 0x7F;
      const transition = SIXEL_TABLE.table[currentState << 7 | code];
      switch (transition >> 4) {
        case SixelAction.DRAW:
          band.put(code - 63, color, 1);
          break;
        case SixelAction.IGNORE:
          break;
        case SixelAction.STORE_PARAM:
          params.addDigit(code - 48);
          break;
        case SixelAction.APPLY_PARAM:
          if (currentState === SixelState.COLOR) {
            /**
             * # Pc [; Pu ; Px ; Py ; Pz]
             * STD 070:
             *  - Pc:     0 - 255 (or larger)
             *  - Pu:     0 illegal, 1 HLS, 2 RGB
             *  - Px:     0 - 100 (R in RGB), 0 - 360 (H in HLS)
             *  - Py/Pz:  0 - 100
             * 
             * rules:
             *  - Pc only     --> color select (+ mapping back for higher numbers)
             *  - all params  --> color definition + color select
             *  - illegal values for Pu, Px, Py, Pz cancel whole command (incl. color select)
             *  - Pu 0 cancels color definition
             *  - for color definition all should be specified (omitted default to 0: #0;2;;; --> #0;2;0;0;0)
             *  - unclear: Does #0;2 also expand to #0;2;0;0;0? --> currently skipped as illegal sequence
             */
            if (params.length === 1) {
              // color select with modulo palette length
              color = this.palette[params.params[0] % this.palette.length] | 0;
            } else if (params.length === 5) {
              // range test for all params
              // cancel whole command if not passing all
              const PcPassed = params.params[1] < 3;
              const PxPassed = params.params[1] === 1 ? params.params[2] <= 360 :  params.params[2] <= 100;
              const PyPassed = params.params[2] <= 100;
              const PzPassed = params.params[3] <= 100;
              if (PcPassed && PxPassed && PyPassed && PzPassed) {
                if (params.params[1] === 1) {
                  // HLS color
                  this.palette[params.params[0] % this.paletteLimit] = color = normalizeHLS(params.params[2], params.params[3], params.params[4]);
                } else if (params.params[1] === 2) {
                  // RGB color
                  this.palette[params.params[0] % this.paletteLimit] = color = normalizeRGB(params.params[2], params.params[3], params.params[4]);
                }
                // color select with modulo palette length
                // also executed for Pu = 0
                color = this.palette[params.params[0] % this.palette.length] | 0;
              }
            }
          } else if (currentState === SixelState.ATTR) {
            // STD 070: apply only if we have no sixels yet
            if (this.bands.length === 1 && !band.cursor) {
              if (params.length === 4) {
                // Note: we only use width and height later on
                this.rasterRatioNumerator = params.params[0];
                this.rasterRatioDenominator = params.params[1];
                this.rasterWidth = params.params[2];
                this.rasterHeight = params.params[3];
              }
            }
          }
          params.reset();
          // read ahead: if next state is DATA we already got a char to handle here
          if ((transition & 15) === SixelState.DATA && code > 62 && code < 127) {
            band.put(code - 63, color, 1);
          }
          break;
        case SixelAction.REPEATED_DRAW:
          let repeat = 0;
          for (let i = 0; i < params.length; ++i) {
            // support for stacking repeat (produced by VT240): !255!255...
            // STD 070: !0 == !1
            repeat += params.params[i] || 1;
          }
          band.put(code - 63, color, repeat);
          params.reset();
          break;
        case SixelAction.CR:
          band.cursor = 0;
          break;
        case SixelAction.SHIFT_PARAM:
          params.addParam();
          break;
        case SixelAction.LF:
          band = new SixelBand(this.width || 4);
          this.bands.push(band);
          break;
      }
      currentState = transition & 15;
    }

    // save state and buffers
    this._currentState = currentState;
    this._currentColor = color;
    this._params = params;
    this._currentBand = band;
  }

  /**
   * Write pixel data to `target`.
   * `target` should be specified with correct `width` and `height`.
   * `dx` and `dy` mark the destination offset.
   * `sx` and `sy` mark the source offset, `swidth` and `sheight` the size to be copied.
   * With `fillColor` the default fill color set in the ctor can be overwritten.
   * Returns the modified `target`.
   * 
   * Note: This method does not respect custom aspect ratios, it always assumes 1:1.
   * Use `rasterRatioNumerator` and `rasterRatioDenominator` on the returned data
   * to apply different pixel shapes / ratios afterwards.
   */
  public toPixelData(
    target: Uint8ClampedArray, width: number, height: number,
    dx: number = 0, dy: number = 0,
    sx: number = 0, sy: number = 0, swidth: number = this.width, sheight: number = this.height,
    fillColor: RGBA8888 = this.fillColor): Uint8ClampedArray
  {
    if (dx < 0 || dy < 0 || sx < 0 || sy < 0 || swidth < 0 || sheight < 0) {
      throw new Error('negative values are invalid');
    }
    if (width * height * 4 !== target.length) {
      throw new Error('wrong geometry of target');
    }
    // border checks
    if (dx >= width || dy >= height) {
      return target;
    }
    if (sx >= this.width || sy >= this.height) {
      return target;
    }
    // determine copy area
    swidth = Math.min(swidth, width - dx, this.width);
    sheight = Math.min(sheight, height - dy, this.height);
    if (swidth <= 0 || sheight <= 0) {
      return target;
    }
    // copy data on 32 bit values
    const target32 = new Uint32Array(target.buffer);
    let p = sy % 6;
    let bandIdx = (sy / 6) | 0;
    let i = 0;
    while (bandIdx < this.bands.length && i < sheight) {
      const offset = (dy + i) * width + dx;
      if (fillColor) {
        target32.fill(fillColor, offset, offset + swidth);
      }
      this.bands[bandIdx].copyPixelRow(target32, offset - sx, p, sx, swidth);
      p++;
      i++;
      if (p === 6) {
        bandIdx++;
        p = 0;
      }
    }
    if (fillColor) {
      while (i < sheight) {
        const offset = (dy + i) * width + dx;
        target32.fill(fillColor, offset, offset + swidth);
        i++;
      }
    }
    return target;
  }
}
