export interface IColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

type UintTypedArray = Uint8Array | Uint16Array | Uint32Array;


/*
taken from https://vt100.net/docs/vt3xx-gp/chapter2.html#S2.4
Table 2-3 VT340 Default Color Map Map Location 	Default Color
* These colors are less saturated than colors 1 through 6.
              R   G   B
0 	Black   	0 	0 	0
1 	Blue 	    20 	20 	80
2 	Red 	    80 	13 	13
3 	Green 	  20 	80 	20
4 	Magenta 	80 	20 	80
5 	Cyan 	    20 	80 	80
6 	Yellow 	  80 	80 	20
7 	Gray 50% 	53 	53 	53
8 	Gray 25% 	26 	26 	26
9 	Blue* 	  33 	33 	60
10 	Red* 	    60 	26 	26
11 	Green* 	  33 	60 	33
12 	Magenta* 	60 	33 	60
13 	Cyan* 	  33 	60 	60
14 	Yellow* 	60 	60 	33
15 	Gray 75% 	80 	80 	80
*/

/**
 * 16 predefined color registers of VT340
 */
const DEFAULT_COLORS = [
  normalizeRGB(0, 0, 0),
  normalizeRGB(20, 20, 80),
  normalizeRGB(80, 13, 13),
  normalizeRGB(20, 80, 20),
  normalizeRGB(80, 20, 80),
  normalizeRGB(20, 80, 80),
  normalizeRGB(80, 80, 20),
  normalizeRGB(53, 53, 53),
  normalizeRGB(26, 26, 26),
  normalizeRGB(33, 33, 60),
  normalizeRGB(60, 26, 26),
  normalizeRGB(33, 60, 33),
  normalizeRGB(60, 33, 60),
  normalizeRGB(33, 60, 60),
  normalizeRGB(60, 60, 33),
  normalizeRGB(80, 80, 80),
];

const DEFAULT_BACKGROUND = {
  r: 0,
  g: 0,
  b: 0,
  a: 0
}

// color conversions
function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hlsToRgb(h: number, l: number, s: number): IColor {
  let r;
  let g
  let b;

  if (s == 0) {
    r = g = b = l;
  } else {
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255), a: 255 };
}

function normalizeRGB(r: number, g: number, b: number): IColor {
  return { r: Math.round(r / 100 * 255), g: Math.round(g / 100 * 255), b: Math.round(b / 100 * 255), a: 255 };
}

function normalizeHLS(h: number, l: number, s: number): IColor {
  // Note: hue value is turned by 240° in VT340
  return hlsToRgb((h + 240) / 360 - 1, l / 100, s / 100);
}


/**
 * Class to hold a single sixel band.
 * The underlying data storage grows with `addSixel` if needed.
 * For multiple colors reset the the band cursor with `CR()`.
 * The class stores information about touched pixels, thus will not
 * overdraw a pixel with a default color that was never touched.
 */
class SixelBand {
  private _cursor = 0;
  public width = 0;
  public data: Uint8ClampedArray;
  public touched: Uint8ClampedArray;
  constructor(length: number = 4) {
    this.data = new Uint8ClampedArray(length * 6 * 4);
    this.touched = new Uint8ClampedArray(length);
  }

  /**
   * Add a sixel to the band.
   * Called by the parser for any data byte of the sixel stream.
   */
  public addSixel(code: number, color: IColor): void {
    const pos = this._cursor * 24;
    // resize by power of 2 if needed
    if (pos >= this.data.length) {
      const data = new Uint8ClampedArray(this.data.length * 2);
      data.set(this.data);
      this.data = data;
      const touched = new Uint8ClampedArray(this.width * 2);
      touched.set(this.touched);
      this.touched = touched;
    }
    // update data
    code -= 63;
    this.touched[this._cursor] |= code;
    for (let p = 0; p < 6; ++p) {
      if (code & (1 << p)) {
        this.data[pos + p * 4] = color.r;
        this.data[pos + p * 4 + 1] = color.g;
        this.data[pos + p * 4 + 2] = color.b;
        this.data[pos + p * 4 + 3] = color.a;
      }
    }
    // update cursor pos and length
    this._cursor++;
    this.width = Math.max(this.width, this._cursor);
  }

  public addSixels(data: UintTypedArray, start: number, end: number, color: IColor): void {
    for (let pos = start; pos < end; ++pos) {
      this.addSixel(data[pos], color);
    }
  }

  /**
   * Carriage return.
   */
  public CR(): void {
    this._cursor = 0;
  }

  /**
   * Copy a single row of pixels to `target`.
   * Low level method to access the band's image data.
   * Not for direct usage (no bound checks), use `SixelImage.toImageData` instead.
   */
  public copyPixelRow(target: Uint8ClampedArray, offset: number, row: number, start: number, length: number): void {
    const end = Math.min(this.width, start + length);
    const touchMask = 1 << row;
    row *= 4;
    for (let i = start; i < end; ++i) {
      if ((this.touched[i] & touchMask)) {
        const idx = i * 24;
        target[offset + i * 4] = this.data[idx + row];
        target[offset + i * 4 + 1] = this.data[idx + row + 1];
        target[offset + i * 4 + 2] = this.data[idx + row + 2];
        target[offset + i * 4 + 3] = this.data[idx + row + 3];
      }
    }
  }
}


/**
 * Parser:
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
  COLOR = 3,
  START = 4   // only used for withESC
}

const enum SixelAction {
  ignore = 0,
  draw = 1,
  cr = 2,
  lf = 3,
  repeatedDraw = 4,
  storeParam = 5,
  shiftParam = 6,
  applyParam = 7
}

function r(low: number, high: number): number[] {
  let c = high - low;
  const arr = new Array(c);
  while (c--) {
    arr[c] = --high;
  }
  return arr;
}

export class TransitionTable {
  public table: Uint8Array;
  constructor(length: number) {
    this.table = new Uint8Array(length);
  }
  add(code: number, state: number, action: number, next: number): void {
    this.table[state << 8 | code] = action << 4 | next;
  }
  addMany(codes: number[], state: number, action: number, next: number): void {
    for (let i = 0; i < codes.length; i++) {
      this.table[state << 8 | codes[i]] = action << 4 | next;
    }
  }
}

export const SIXEL_TABLE = (() => {
  const table = new TransitionTable(1280); //  5 STATES * 256 codes
  const states: number[] = r(SixelState.DATA, SixelState.COLOR + 1);
  let state: any;

  // default transition
  for (state in states) {
    for (let code = 0; code <= 0x7F; ++code) {
      table.add(code, state, SixelAction.ignore, state); // ignore never changes state
    }
  }
  // DATA state
  table.addMany(r(63, 127), SixelState.DATA, SixelAction.draw, SixelState.DATA);
  table.add(33, SixelState.DATA, SixelAction.ignore, SixelState.COMPRESSION);
  table.add(34, SixelState.DATA, SixelAction.ignore, SixelState.ATTR);
  table.add(35, SixelState.DATA, SixelAction.ignore, SixelState.COLOR);
  table.add(36, SixelState.DATA, SixelAction.cr, SixelState.DATA);
  table.add(45, SixelState.DATA, SixelAction.lf, SixelState.DATA);
  // COMPRESSION
  table.addMany(r(48, 58), SixelState.COMPRESSION, SixelAction.storeParam, SixelState.COMPRESSION);
  table.addMany(r(63, 127), SixelState.COMPRESSION, SixelAction.repeatedDraw, SixelState.DATA);
  // ATTR
  table.addMany(r(48, 58), SixelState.ATTR, SixelAction.storeParam, SixelState.ATTR);
  table.add(59, SixelState.ATTR, SixelAction.shiftParam, SixelState.ATTR);
  table.addMany(r(63, 127), SixelState.ATTR, SixelAction.applyParam, SixelState.DATA);
  table.add(33, SixelState.ATTR, SixelAction.applyParam, SixelState.COMPRESSION);
  table.add(34, SixelState.ATTR, SixelAction.applyParam, SixelState.ATTR);
  table.add(35, SixelState.ATTR, SixelAction.applyParam, SixelState.COLOR);
  table.add(36, SixelState.ATTR, SixelAction.applyParam, SixelState.DATA);
  table.add(45, SixelState.ATTR, SixelAction.applyParam, SixelState.DATA);
  // COLOR
  table.addMany(r(48, 58), SixelState.COLOR, SixelAction.storeParam, SixelState.COLOR);
  table.add(59, SixelState.COLOR, SixelAction.shiftParam, SixelState.COLOR);
  table.addMany(r(63, 127), SixelState.COLOR, SixelAction.applyParam, SixelState.DATA);
  table.add(33, SixelState.COLOR, SixelAction.applyParam, SixelState.COMPRESSION);
  table.add(34, SixelState.COLOR, SixelAction.applyParam, SixelState.ATTR);
  table.add(35, SixelState.COLOR, SixelAction.applyParam, SixelState.COLOR);
  table.add(36, SixelState.COLOR, SixelAction.applyParam, SixelState.DATA);
  table.add(45, SixelState.COLOR, SixelAction.applyParam, SixelState.DATA);
  return table;
})();


/**
 * Sixel image class.
 * 
 * Create an image from sixel data with `SixelImage.fromData`.
 * The class provides image attributes `width` and `height`.
 * With `toImageData` the pixel data can be copied to an `ImageData`
 * for further processing.
 * 
 * TODO:
 *  - streamline input
 *  - parameters from escape sequence (setZero)
 *  - use width/height from attr if present
 */
export class SixelImage {
  public initialState = SixelState.DATA;
  public currentState = this.initialState;
  public bands: SixelBand[] = [];
  public params: number[] = [0];
  public colors: IColor[] = Object.assign([], DEFAULT_COLORS);
  public currentColor = this.colors[0];

  constructor(
    public setZero: number = 0,
    public backgroundColor: IColor = DEFAULT_BACKGROUND) { }

  public get height(): number {
    return this.bands.length * 6;
  }

  public get width(): number {
    return Math.max.apply(null, this.bands.map(el => el.width));
  }

  public writeString(data: string): void {
    const bytes = new Uint8Array(data.length);
    const l = data.length;
    for (let i = 0; i < l; ++i) {
      bytes[i] = data.charCodeAt(i);
    }
    this.write(bytes);
  }

  /**
   * Write sixel data to the image.
   * Decodes the sixel data and creates the image.
   */
  public write(data: UintTypedArray, start: number = 0, end: number = data.length): void {
    let currentState = this.currentState;
    let dataStart = -1;
    let band: SixelBand = null;
    let color: IColor = this.currentColor;
    let params = this.params;

    for (let i = start; i < end; ++i) {
      const code = data[i];
      const transition = SIXEL_TABLE.table[currentState << 8 | (code < 0x7F ? code : 0xFF)];
      switch (transition >> 4) {
        case SixelAction.ignore:
          if (currentState === SixelState.DATA && ~dataStart) {
            if (!band) {
              band = new SixelBand();
              this.bands.push(band);
            }
            band.addSixels(data, dataStart, i, color);
          }
          dataStart = -1;
          break;
        case SixelAction.draw:
          dataStart = (~dataStart) ? dataStart : i;
          break;
        case SixelAction.cr:
          if (~dataStart) {
            if (!band) {
              band = new SixelBand();
              this.bands.push(band);
            }
            band.addSixels(data, dataStart, i, color);
            dataStart = -1;
          }
          if (band) {
            band.CR();
          }
          break;
        case SixelAction.lf:
          if (~dataStart) {
            if (!band) {
              band = new SixelBand();
              this.bands.push(band);
            }
            band.addSixels(data, dataStart, i, color);
            dataStart = -1;
          }
          band = null;
          break;
        case SixelAction.repeatedDraw:
          if (!band) {
            band = new SixelBand();
            this.bands.push(band);
          }
          const repeat = params[0];
          for (let i = 0; i < repeat; ++i) {
            band.addSixel(code, color);
          }
          dataStart = -1;
          params = [0];
          break;
        case SixelAction.storeParam:
          params[params.length - 1] = params[params.length - 1] * 10 + code - 48;
          break;
        case SixelAction.shiftParam:
          params.push(0);
          break;
        case SixelAction.applyParam:
          if (currentState === SixelState.COLOR) {
            if (params.length >= 5) {
              if (params[1] === 1) {
                // HLS color
                this.colors[params[0]] = color = normalizeHLS(params[2], params[3], params[4]);
              } else if (params[1] === 2) {
                // RGB color
                this.colors[params[0]] = color = normalizeRGB(params[2], params[3], params[4]);
              }
            } else if (params.length === 1) {
              color = this.colors[params[0]] || this.colors[0];
            }
          } else if (currentState === SixelState.ATTR) {
            // TODO
          }
          params = [0];
          dataStart = -1;
          if ((transition & 15) === SixelState.DATA && code > 62 && code < 127) {
            dataStart = i;
          }
          break;
      }
      currentState = transition & 15;
    }
    if (currentState === SixelState.DATA && ~dataStart) {
      if (!band) {
        band = new SixelBand();
        this.bands.push(band);
      }
      band.addSixels(data, dataStart, data.length, color);
    }
    // TODO: preserve state for chunked writes
  }

  /**
   * Write image data into `target`.
   * `target` should be specified with correct `width` and `height`.
   * `dx` and `dy` mark the destination offset.
   * `sx` and `sy` mark the source offset, `swidth` and `sheight` the size to be copied.
   */
  public toImageData(
    target: Uint8ClampedArray, width: number, height: number,
    dx: number = 0, dy: number = 0,
    sx: number = 0, sy: number = 0, swidth: number = this.width, sheight: number = this.height): Uint8ClampedArray {
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
    const rx = width - dx;
    const ry = height - dy;
    swidth = Math.min(swidth, rx, this.width);
    sheight = Math.min(sheight, ry, this.height);
    if (swidth <= 0 || sheight <= 0) {
      return;
    }
    // copy data
    let p = sy % 6;
    let bandIdx = (sy / 6) | 0;
    let i = 0;
    while (bandIdx < this.bands.length && bandIdx * 6 + p < sy + sheight) {
      const offset = ((dy + i) * width + dx) * 4;
      this.bands[bandIdx].copyPixelRow(target, offset, p, sx, swidth);
      p++;
      i++;
      if (p === 6) {
        bandIdx++;
        p = 0;
      }
    }
    return target;
  }
}
