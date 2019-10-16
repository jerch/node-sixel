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
export type UintTypedArray = Uint8Array | Uint16Array | Uint32Array;
export type HistogramType = Map<RGBA8888, number>;
export type RGBColor = [number, number, number];

/** system endianess */
const BIG_ENDIAN = new Uint8Array(new Uint32Array([0xFF000000]).buffer)[0] === 0xFF;

function red(n: RGBA8888): number {
  return (BIG_ENDIAN ? n >>> 24 : n) & 0xFF;
}

function green(n: RGBA8888): number {
  return (BIG_ENDIAN ? n >>> 16 : n >>> 8) & 0xFF;
}

function blue(n: RGBA8888): number {
  return (BIG_ENDIAN ? n >>> 8 : n >>> 16) & 0xFF;
}

function alpha(n: RGBA8888): number {
  return (BIG_ENDIAN ? n : n >>> 24) & 0xFF;
}

export function toRGBA8888(r: number, g: number, b: number, a: number = 255): RGBA8888 {
  return (BIG_ENDIAN)
    ? ((r & 0xFF) << 24 | (g & 0xFF) << 16 | (b % 0xFF) << 8 | (a & 0xFF)) >>> 0    // RGBA32
    : ((a & 0xFF) << 24 | (b & 0xFF) << 16 | (g & 0xFF) << 8 | (r & 0xFF)) >>> 0;   // ABGR32
}

export function fromRGBA8888(color: RGBA8888): number[] {
  return (BIG_ENDIAN)
    ? [color >>> 24, (color >> 16) & 0xFF, (color >> 8) & 0xFF, color & 0xFF]
    : [color & 0xFF, (color >> 8) & 0xFF, (color >> 16) & 0xFF, color >>> 24];
}

function nearestColorIdx(color: RGBA8888, palette: RGBColor[]): number {
  const r = red(color);
  const g = green(color);
  const b = blue(color);
  
  let min = Number.MAX_SAFE_INTEGER;
  let idx = -1;

  // use euclidean distance (manhattan gives very poor results)
  for (let i = 0; i < palette.length; ++i) {
    const dr = r - palette[i][0];
    const dg = g - palette[i][1];
    const db = b - palette[i][2];
    const d = dr * dr + dg * dg + db * db;
    if (!d) return i;
    if (d < min) {
      min = d;
      idx = i;
    }
  }

  return idx;
}

/**
 * 16 predefined color registers of VT340
 *
 * taken from https://vt100.net/docs/vt3xx-gp/chapter2.html#S2.4
 * Table 2-3 VT340 Default Color Map Map Location  Default Color
 * * These colors are less saturated than colors 1 through 6.
 *                R   G   B
 * 0  Black       0  0  0
 * 1  Blue        20  20  80
 * 2  Red         80  13  13
 * 3  Green       20  80  20
 * 4  Magenta     80  20  80
 * 5  Cyan        20  80  80
 * 6  Yellow      80  80  20
 * 7  Gray 50%    53  53  53
 * 8  Gray 25%    26  26  26
 * 9  Blue*       33  33  60
 * 10 Red*        60  26  26
 * 11 Green*      33  60  33
 * 12 Magenta*    60  33  60
 * 13 Cyan*       33  60  60
 * 14 Yellow*     60  60  33
 * 15 Gray 75%    80  80  80
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
  normalizeRGB(80, 80, 80)
];

const DEFAULT_BACKGROUND: RGBA8888 = toRGBA8888(0, 0, 0, 255);

// color conversions
function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hlsToRgb(h: number, l: number, s: number): RGBA8888 {
  let r;
  let g;
  let b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return (BIG_ENDIAN)
    ? (Math.round(r * 255) << 24 | Math.round(g * 255) << 16 | Math.round(b * 255) << 8 | 0xFF) >>> 0   // RGBA32
    : (0xFF000000 | Math.round(b * 255) << 16 | Math.round(g * 255) << 8 | Math.round(r * 255)) >>> 0;  // ABGR32
}

function normalizeRGB(r: number, g: number, b: number): RGBA8888 {
  return (BIG_ENDIAN)
    ? (Math.round(r / 100 * 255) << 24 | Math.round(g / 100 * 255) << 16 | Math.round(b / 100 * 255) << 8 | 0xFF) >>> 0   // RGBA32
    : (0xFF000000 | Math.round(b / 100 * 255) << 16 | Math.round(g / 100 * 255) << 8 | Math.round(r / 100 * 255)) >>> 0;  // ABGR32
}

function normalizeHLS(h: number, l: number, s: number): RGBA8888 {
  // Note: hue value is turned by 240° in VT340
  return hlsToRgb((h + 240) / 360 - 1, l / 100, s / 100);
}

// helper to write a decimal number to a typed array in a speedy fashion
const numStack = new Uint8Array(20);
function numToDigits(n: number, target: Uint8Array, pos: number): number {
  n >>>= 0;
  let c = 0;
  while (n) {
    numStack[c] = n % 10 + 48;
    n = Math.floor(n / 10);
    c++;
  }
  if (!c) {
    numStack[c] = 48;
    c++;
  }
  while (c) {
    target[pos++] = numStack[--c];
  }
  return pos;
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
  public data: Uint16Array;
  public palette: Set<RGBA8888> = new Set<RGBA8888>();
  public posInPal: Map<RGBA8888, number> = new Map<RGBA8888, number>();
  private _currentPalIdx: number;
  private _currentColor: RGBA8888;
  constructor(length: number = 4) {
    this.data = new Uint16Array(length * 6);
    // every band has one slot for transparent (background)
    this.palette.add(0);
    this.posInPal.set(0, 0);
    this._currentPalIdx = 0;
    this._currentColor = 0;
  }

  /**
   * Get current memory usage of the band.
   */
  public get memUsage(): number {
    // FIXME: calc palette and stuff
    return this.data.length * 2;
  }

  /**
   * Add a sixel to the band.
   * Called by the parser for any data byte of the sixel stream.
   */
  public addSixel(code: number, color: RGBA8888): void {
    const pos = this._cursor * 6;
    // resize by power of 2 if needed
    if (pos >= this.data.length) {
      const newData = new Uint16Array(this.data.length * 2);
      newData.set(this.data);
      this.data = newData;
    }
    // check for palette entry, add if needed
    if (color !== this._currentColor) {
      if (!this.palette.has(color)) {
        this.palette.add(color);
        this.posInPal.set(color, this.palette.size - 1);
        this._currentPalIdx = this.palette.size - 1;
      } else {
        this._currentPalIdx = this.posInPal.get(color);
      }
      this._currentColor = color;
    }
    // update data
    code -= 63;
    for (let p = 0; p < 6; ++p) {
      if (code & (1 << p)) {
        this.data[pos + p] = this._currentPalIdx;
      }
    }
    // update cursor pos and length
    this._cursor++;
    this.width = Math.max(this.width, this._cursor);
  }

  public addSixels(data: UintTypedArray, start: number, end: number, color: RGBA8888): void {
    for (let pos = start; pos < end; ++pos) {
      this.addSixel(data[pos], color);
    }
  }

  /**
   * Carriage return.
   */
  public cr(): void {
    this._cursor = 0;
  }

  /**
   * Copy a single row of pixels to `target`.
   * Low level method to access the band's image data.
   * Not for direct usage (no bound checks), use `SixelImage.toImageData` instead.
   */
  public copyPixelRow(target: Uint32Array, offset: number, row: number, start: number, length: number, pal: RGBA8888[]): void {
    const end = Math.min(this.width, start + length);
    let pixel = 0;
    for (let i = start; i < end; ++i) {
      if (pixel = pal[this.data[i * 6 + row]]) {
        target[offset + i] = pixel;
      }
    }
  }

  public insertPixelRow(
    source: Uint32Array, yStart: number, length: number,
    colorMap: Map<RGBA8888, RGBA8888> | null,
    bandHeight: number): void
  {
    const start = yStart * length;
    let c = 0;
    let oldColor = 0;
    let oldIdx = 0;
    for (let i = 0; i < length; ++i) {
      const pos = start + i;
      let rowOffset = 0;
      for (let row = 0; row < bandHeight; ++row) {
        let color = source[pos + rowOffset];
        if (colorMap) color = colorMap.get(color);
        if (color !== oldColor) {
          if (this.palette.has(color)) {
            oldIdx = this.posInPal.get(color);
          } else {
            this.palette.add(color);
            this.posInPal.set(color, this.palette.size - 1);
            oldIdx = this.palette.size - 1;
          }
          oldColor = color;
        }
        this.data[c++] = oldIdx;
        rowOffset += length;
      }
      c += 6 - bandHeight;
    }
  }

  public toSixelRow(target: Uint8Array, posInPal: Map<RGBA8888, number>, cb: Function, width: number, buffer: ArrayBuffer): void {
    const end = Math.min(this.width, width) * 6;
    const colors = [...this.palette];
    const length = colors.length;

    // create temp buffers to hold color data
    let offset = 0;
    const last = new Int8Array(buffer, offset, length);
    offset += (length + 3) & ~3;
    const code = new Uint8Array(buffer, offset, length);
    offset += (length + 3) & ~3;
    const accu = new Uint16Array(buffer, offset, length * 2);
    offset += (length * 2 + 3) & ~3;
    const pos = new Uint16Array(buffer, offset, length * 2);
    offset += (length * 2 + 3) & ~3;

    // holds temp all data for a single color
    const targets: Uint8Array[] = [];
    for (let i = 0; i < length; ++i) {
      targets[i] = new Uint8Array(buffer, offset, width);
      offset += (width + 3) & ~3;
    }
    last.fill(-1);
    accu.fill(1);
    pos.fill(0);

    for (let cursor = 0; cursor < end;) {
      code.fill(0);
      code[this.data[cursor++]] |= 1;
      code[this.data[cursor++]] |= 2;
      code[this.data[cursor++]] |= 4;
      code[this.data[cursor++]] |= 8;
      code[this.data[cursor++]] |= 16;
      code[this.data[cursor++]] |= 32;
      for (let i = 0; i < length; ++i) {
        if (code[i] === last[i]) {
          accu[i]++;
        } else {
          if (~last[i]) {
            pos[i] = this._codeToSixel(last[i], accu[i], targets[i], pos[i]);
          }
          last[i] = code[i];
          accu[i] = 1;
        }
      }
    }

    for (let i = 0; i < length; ++i) {
      if (last[i]) {
        pos[i] = this._codeToSixel(last[i], accu[i], targets[i], pos[i]);
      }
    }
    
    // write sixel chunk for every color in band
    let targetPos = 0;
    for (let i = 0; i < length; ++i) {
      const color = colors[i];
      if (!alpha(color)) continue;  // skip "holey" pixels
      target[targetPos++] = 35; // #
      targetPos = numToDigits(posInPal.get(color), target, targetPos);
      target.set(targets[i].subarray(0, pos[i]), targetPos);
      targetPos += pos[i];
      target[targetPos++] = 36; // $
      cb(target.subarray(0, targetPos));
      targetPos = 0;
    }
  }

  private _codeToSixel(code: number, repeat: number, target: Uint8Array, pos: number): number {
    code += 63;
    if (repeat > 3) {
      target[pos++] = 33; '!'
      pos = numToDigits(repeat, target, pos);
      target[pos++] = code;
    } else {
      while (repeat--) {
        target[pos++] = code;
      }
    }
    return pos;
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
    this.table[state << 8 | code] = action << 4 | next;
  }
  addMany(codes: number[], state: number, action: number, next: number): void {
    for (let i = 0; i < codes.length; i++) {
      this.table[state << 8 | codes[i]] = action << 4 | next;
    }
  }
}

const SIXEL_TABLE = (() => {
  const table = new TransitionTable(1024); //  4 STATES * 256 codes
  const states: number[] = r(SixelState.DATA, SixelState.COLOR + 1);
  let state: any;

  // default transition for all states
  for (state in states) {
    // Note: ignore never changes state
    table.addMany(r(0x00, 0x100), state, SixelAction.IGNORE, state);
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
 * Sixel image class.
 *
 * The class provides image attributes `width` and `height`.
 * With `toImageData` the pixel data can be copied to an `ImageData`
 * for further processing.
 * 
 * `write` and `writeString` decode SIXEL data streamlined, therefore it
 * is possible to grab partial images during transmission.
 * Note that the class is meant to run behind an escape sequence parser,
 * thus the data should only be the real data part of the sequence and not
 * contain the introducer and finalizer.
 * The constructor takes an optional argument `fillColor`. This color gets
 * applied to non zero pixels later on during `toImageData`.
 * 
 * With the class method `fromImageData` it is possible to create an instance
 * from existing image data.
 * 
 * `toSixelBytes` encodes the image information to SIXEL in byte chunks.
 * `toSixelString` encodes the image to SIXEL in string representation
 * (use with care for big images).
 */
export class SixelImage {
  /**
   * Create escape sequence introducer for SIXEL.
   * Should be written to the terminal before any SIXEL data.
   * 
   * A SIXEL DSC sequence understands 3 parameters, but only the second one (background select) is supported
   * by some terminals. Therefore only this parameter is exposed.
   * 
   * backgroundSelect:
   *  - 0   device default action (most terminals will apply background color)
   *  - 1   no action (no change to zero bit value grid positions)
   *  - 2   set to background color - zero bit value grid positions are set to background color (device dependent).
   * 
   * @see https://www.vt100.net/docs/vt3xx-gp/chapter14.html
   * @param backgroundSelect background color setting (default = 0)
   */
  public static introducer(backgroundSelect: number = 0): string {
    return `\x1bP0;${backgroundSelect};q`;
  }

  /**
   * Finalize SIXEL sequence. Write this, when the SIXEL data stream has ended to restore
   * the terminal to normal operation.
   */
  public static finalizer(): string {
    return '\x1b\\';
  }

  /**
   * Inspect all colors and generate palette replacement mapping.
   * Respects alpha 0 as transparent, other alpha values are stripped.
   */
  private static _genColorMap(data32: Uint32Array, palette: RGBA8888[] | RGBColor[]): Map<RGBA8888, RGBA8888> {
    if (!palette.length) {
      throw new Error('palette must not be empty');
    }
    const colorMap = new Map<RGBA8888, RGBA8888>();
    const paletteWithZero = (typeof palette[0] === 'number')
      ? (palette as RGBA8888[]).slice()
      : (palette as RGBColor[]).map(v => toRGBA8888(v[0], v[1], v[2]));
    paletteWithZero.unshift(0);
    const rgbPalette = (typeof palette[0] === 'number')
      ? (palette as RGBA8888[]).map(v => fromRGBA8888(v).slice(0, -1) as RGBColor)
      : (palette as RGBColor[]).slice();
    for (let i = 0; i < data32.length; ++i) {
      const color = data32[i];
      if (!colorMap.has(color)) {
        // 0 for transparent, others are shifted by 1
        colorMap.set(color, alpha(color) ? paletteWithZero[nearestColorIdx(color, rgbPalette) + 1] : 0);
      }
    }
    return colorMap;
  }

  /**
   * Create SixelImage from image pixel data (alternative constructor).
   * 
   * The colors of the sixel image get aligned to the given palette (defaults to 16 colors of VT340)
   * by euclidean distance without further image processing. Without proper quantization beforehand
   * this leads to poor output, thus consider using a quantizer with custom palette creation and dithering.  
   * For transparency only an alpha value of 0 will be respected as fully transparent,
   * other alpha values are set to fully opaque (255). Transparent pixels will be colored by the
   * terminal later on depending on the `backgroundSelect` setting of the introducer.
   * 
   * @param data    pixel data
   * @param width   width of the image
   * @param height  height of the image
   * @param palette optional, palette to be applied
   */
  public static fromImageData(
    data: Uint8ClampedArray | Uint8Array, width: number, height: number,
    palette: RGBA8888[] | RGBColor[] = DEFAULT_COLORS, safePalette: boolean = false): SixelImage
  {
    if (width * height * 4 !== data.length) {
      throw new Error('wrong geometry of data');
    }
    const data32 = new Uint32Array(data.buffer);
    // skip color -> palette map creation if we have a safe palette
    const colorMap = safePalette ? null : this._genColorMap(data32, palette);
    const img = new SixelImage();
    img._width = width;
    img._height = height;

    // full 6 pixel bands
    const fullBands = Math.floor(height / 6);
    for (let b = 0; b < fullBands; ++b) {
      const band = new SixelBand(width);
      band.width = width;
      img._bands.push(band);
      band.insertPixelRow(data32, b * 6, width, colorMap, 6);
    }

    // underfull last band
    const fullHeight = fullBands * 6;
    if (fullHeight < height) {
      const band = new SixelBand(width);
      band.width = width;
      img._bands.push(band);
      band.insertPixelRow(data32, fullHeight, width, colorMap, height - fullHeight);
    }

    return img; 
  }

  private _initialState = SixelState.DATA;
  private _currentState = this._initialState;
  public _bands: SixelBand[] = [];
  private _params: number[] = [0];
  private _colors: RGBA8888[] = Object.assign([], DEFAULT_COLORS);
  private _currentColor = this._colors[0];
  private _currentBand: SixelBand = null;
  private _width = 0;
  private _height = 0;
  private _chunk: Uint8Array;

  constructor(public fillColor: RGBA8888 = DEFAULT_BACKGROUND) {}

  public get height(): number {
    return this._height || this._bands.length * 6;
  }

  public get width(): number {
    return this._width || Math.max.apply(null, this._bands.map(el => el.width)) | 0;
  }

  /**
   * Get current memory usage of the image data in bytes.
   * Can be used to restrict image handling if memory is limited.
   * Note: This only accounts the image pixel data storage, the real value
   * will be slightly higher due to some JS object overhead.
   */
  public get memUsage(): number {
    return this._bands.reduce((accu, cur) => accu + cur.memUsage, 0);
  }

  /**
   * Write SIXEL string data to the image.
   */
  public writeString(data: string, start: number = 0, end: number = data.length): void {
    const bytes = new Uint8Array(end - start);
    let j = 0;
    for (let i = start; i < end; ++i) {
      bytes[j++] = data.charCodeAt(i);
    }
    this.write(bytes);
  }

  /**
   * Write SIXEL bytes to the image.
   */
  public write(data: UintTypedArray, start: number = 0, end: number = data.length): void {
    let currentState = this._currentState;
    let dataStart = -1;
    let band: SixelBand = this._currentBand;
    let color: RGBA8888 = this._currentColor;
    let params = this._params;

    for (let i = start; i < end; ++i) {
      const code = data[i] & 0xFF;
      const transition = SIXEL_TABLE.table[currentState << 8 | (code < 0x7F ? code : 0xFF)] | 0;
      switch (transition >> 4) {
        case SixelAction.DRAW:
          dataStart = (~dataStart) ? dataStart : i;
          break;
        case SixelAction.IGNORE:
          if (currentState === SixelState.DATA && ~dataStart) {
            if (!band) {
              band = new SixelBand(this.width || 4);
              this._bands.push(band);
            }
            band.addSixels(data, dataStart, i, color);
          }
          dataStart = -1;
          break;
        case SixelAction.REPEATED_DRAW:
          if (!band) {
            band = new SixelBand(this.width || 4);
            this._bands.push(band);
          }
          let repeat = 0;
          for (let i = 0; i < params.length; ++i) {
            repeat += params[i];
          }
          for (let i = 0; i < repeat; ++i) {
            band.addSixel(code, color);
          }
          dataStart = -1;
          params = [0];
          break;
        case SixelAction.STORE_PARAM:
          params[params.length - 1] = params[params.length - 1] * 10 + code - 48;
          break;
        case SixelAction.SHIFT_PARAM:
          params.push(0);
          break;
        case SixelAction.CR:
          if (~dataStart) {
            if (!band) {
              band = new SixelBand(this.width || 4);
              this._bands.push(band);
            }
            band.addSixels(data, dataStart, i, color);
            dataStart = -1;
          }
          if (band) {
            band.cr();
          }
          break;
        case SixelAction.LF:
          if (~dataStart) {
            if (!band) {
              band = new SixelBand(this.width || 4);
              this._bands.push(band);
            }
            band.addSixels(data, dataStart, i, color);
            dataStart = -1;
          }
          band = null;
          break;
        case SixelAction.APPLY_PARAM:
          if (currentState === SixelState.COLOR) {
            if (params.length >= 5) {
              if (params[1] === 1) {
                // HLS color, angle as mod 260, LS in % clamped to 100
                this._colors[params[0]] = color = normalizeHLS(
                  params[2] % 360,
                  Math.min(params[3], 100),
                  Math.min(params[4], 100)
                );
              } else if (params[1] === 2) {
                // RGB color in %, clamped to 100
                this._colors[params[0]] = color = normalizeRGB(
                  Math.min(params[2], 100),
                  Math.min(params[3], 100),
                  Math.min(params[4], 100)
                );
              }
            } else if (params.length === 1) {
              color = this._colors[params[0]] || this._colors[0];
            }
          } else if (currentState === SixelState.ATTR) {
            // we only use width and height
            if (params.length === 4) {
              this._width = params[2];
              this._height = params[3];
            }
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
        band = new SixelBand(this.width || 4);
        this._bands.push(band);
      }
      band.addSixels(data, dataStart, end, color);
    }

    // save state and buffers
    this._currentState = currentState;
    this._currentColor = color;
    this._params = params;
    this._currentBand = band;
  }

  /**
   * Write image data into `target`.
   * `target` should be specified with correct `width` and `height`.
   * `dx` and `dy` mark the destination offset.
   * `sx` and `sy` mark the source offset, `swidth` and `sheight` the size to be copied.
   * With `fillColor` the default fill color set in the ctor can be overwritten.
   * Returns the modified `target`.
   */
  public toImageData(
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
    let pal = [...this._bands[bandIdx].palette];
    while (bandIdx < this._bands.length && i < sheight) {
      const offset = (dy + i) * width + dx;
      if (fillColor) {
        target32.fill(fillColor, offset, offset + swidth);
      }
      this._bands[bandIdx].copyPixelRow(target32, offset - sx, p, sx, swidth, pal);
      p++;
      i++;
      if (p === 6) {
        bandIdx++;
        if (bandIdx < this._bands.length) {
          pal = [...this._bands[bandIdx].palette];
        }
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

  /**
   * Output image as chunks of SIXEL bytes.
   * 
   * `cb` will be called with the current SIXEL data in `chunk` until the whole image
   * was transmitted. `chunk` is borrowed, thus the data should be copied/written right away.
   * 
   * Note: The output contains only the SIXEL image data (no escape sequence introducer / finalizer).
   * 
   * @param cb  callback to process a single SIXEL chunk (borrowed)
   */
  public toSixelBytes(cb: (chunk: Uint8Array) => void): void {
    // exit early if we have no image data
    if (!this.width || !this.height) {
      return;
    }

    // prepare chunk buffer
    if (!this._chunk || this._chunk.length < this.width + 100) {
      this._chunk = new Uint8Array(this.width + 100);
    }

    // get colors of image
    const imageColors = new Set<RGBA8888>();
    for (let i = 0; i < this._bands.length; ++i) {
      const colors = this._bands[i].palette;
      for (let color of colors) {
        imageColors.add(color);
      }
    }

    // translate RGBA8888 colors to [R, G, B, A]
    const rgbColors = new Map<RGBA8888, number[]>();
    for (let color of imageColors) {
      rgbColors.set(color, fromRGBA8888(color));
    }

    /**
     * create SIXEL data stream
     */
    // write position in chunk buffer
    let pos = 0;

    // write raster attributes (includes image dimensions) - " Pan ; Pad ; Ph ; Pv
    // note: Pan/Pad are set to dummies (not eval'd by any terminal)
    this._chunk[pos++] = 34; // "
    this._chunk[pos++] = 49; // 1
    this._chunk[pos++] = 59; // ;
    this._chunk[pos++] = 49; // 1
    this._chunk[pos++] = 59; // ;
    pos = numToDigits(this.width, this._chunk, pos);
    this._chunk[pos++] = 59; // ;
    pos = numToDigits(this.height, this._chunk, pos);
    this._chunk[pos++] = 10; // \n
    cb(this._chunk.subarray(0, pos));
    pos = 0;
    
    // create palette and write color entries
    // note: we simply push all found colors into the palette
    // thus do not ensure a certain palette size here
    const positionInPalette = new Map<RGBA8888, number>();
    let count = 0;
    for (let [color, [r, g, b, a]] of rgbColors) {
      if (a) {
        positionInPalette.set(color, count);
        this._chunk[pos++] = 35; // #
        pos = numToDigits(count++, this._chunk, pos);
        this._chunk[pos++] = 59; // ;
        this._chunk[pos++] = 50; // 2
        this._chunk[pos++] = 59; // ;
        pos = numToDigits(Math.round(r / 255 * 100), this._chunk, pos);
        this._chunk[pos++] = 59; // ;
        pos = numToDigits(Math.round(g / 255 * 100), this._chunk, pos);
        this._chunk[pos++] = 59; // ;
        pos = numToDigits(Math.round(b / 255 * 100), this._chunk, pos);
        this._chunk[pos++] = 10; // \n
        cb(this._chunk.subarray(0, pos));
        pos = 0;
      }
    }

    // create arraybuffer to hold temp band data
    const longestPal = (Math.max(...this._bands.map(band => band.palette.size)) + 3) & ~3;
    const alignedWidth = (this.width + 3) & ~3;
    const buffer = new ArrayBuffer(
        longestPal                // const last = new Int8Array(colors.length);
      + longestPal                // const code = new Uint8Array(colors.length);
      + longestPal * 2            // const accu = new Uint16Array(colors.length);
      + longestPal * 2            // const pos = new Uint16Array(colors.length);
      + longestPal * alignedWidth // color targets
    );

    // write data for each color of all bands
    // skips color entries with alpha 0 ("holey pixels" - to be colored by `backgroundSelect`)
    for (let i = 0; i < this._bands.length; ++i) {
      this._bands[i].toSixelRow(this._chunk, positionInPalette, cb, this.width, buffer);
      if (i < this._bands.length - 1) {
        this._chunk[pos++] = 45; // -
        this._chunk[pos++] = 10; // \n
        cb(this._chunk.subarray(0, pos));
        pos = 0;
      }
    }
    if (pos) {
      cb(this._chunk.subarray(0, pos));
      pos = 0;
    }
  }

  /**
   * Output image as SIXEL string.
   * Use with care for big images (the string might grow very big).
   * 
   * Note: The output contains only the SIXEL image data (no escape sequence introducer / finalizer).
   */
  public toSixelString(): string {
    let result: string[] = [];
    this.toSixelBytes(chunk => result.push(String.fromCharCode.apply(null, chunk)));
    return result.join('');
  }
}
