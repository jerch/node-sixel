/**
 * Copyright (c) 2019 Joerg Breitbart.
 * @license MIT
 */

import { RGBA8888, RGBColor } from './Types';


// system endianess
export const BIG_ENDIAN = new Uint8Array(new Uint32Array([0xFF000000]).buffer)[0] === 0xFF;
if (BIG_ENDIAN) {
  console.warn('BE platform detected. This version of node-sixel works only on LE properly.');
}

// channel values
export function red(n: RGBA8888): number {
  return n & 0xFF;
}

export function green(n: RGBA8888): number {
  return (n >>> 8) & 0xFF;
}

export function blue(n: RGBA8888): number {
  return (n >>> 16) & 0xFF;
}

export function alpha(n: RGBA8888): number {
  return (n >>> 24) & 0xFF;
}


/**
 * Convert RGB channels to native color RGBA8888.
 */
export function toRGBA8888(r: number, g: number, b: number, a: number = 255): RGBA8888 {
  return ((a & 0xFF) << 24 | (b & 0xFF) << 16 | (g & 0xFF) << 8 | (r & 0xFF)) >>> 0;   // ABGR32
}


/**
 * Convert native color to [r, g, b, a].
 */
export function fromRGBA8888(color: RGBA8888): [number, number, number, number] {
  return [color & 0xFF, (color >> 8) & 0xFF, (color >> 16) & 0xFF, color >>> 24];
}


/**
 * Get index of nearest color in `palette` for `color`.
 * Uses euclidean distance without any luminescence correction.
 */
export function nearestColorIndex(color: RGBA8888, palette: RGBColor[]): number {
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


// color conversions
// HLS taken from: http://www.niwa.nu/2013/05/math-behind-colorspace-conversions-rgb-hsl

function clamp(low: number, high: number, value: number): number {
  return Math.max(low, Math.min(value, high));
}

function h2c(t1: number, t2: number, c: number): number {
  if (c < 0) c += 1;
  if (c > 1) c -= 1;
  return c * 6 < 1
    ? t2 + (t1 - t2) * 6 * c
    : c * 2 < 1
      ? t1
      : c * 3 < 2
        ? t2 + (t1 - t2) * (4 - c * 6)
        : t2;
}

function HLStoRGB(h: number, l: number, s: number): RGBA8888 {
  if (!s) {
    const v = Math.round(l * 255);
    return toRGBA8888(v, v, v);
  }
  const t1 = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const t2 = 2 * l - t1;
  return toRGBA8888(
    clamp(0, 255, Math.round(h2c(t1, t2, h + 1 / 3) * 255)),
    clamp(0, 255, Math.round(h2c(t1, t2, h) * 255)),
    clamp(0, 255, Math.round(h2c(t1, t2, h - 1 / 3) * 255))
  );
}

/**
 * Normalize SIXEL RGB values (percent based, 0-100) to RGBA8888.
 */
export function normalizeRGB(r: number, g: number, b: number): RGBA8888 {
  return (0xFF000000 | Math.round(b / 100 * 255) << 16 | Math.round(g / 100 * 255) << 8 | Math.round(r / 100 * 255)) >>> 0;  // ABGR32
}


/**
 * Normalize SIXEL HLS values to RGBA8888. Applies hue correction of +240°.
 */
export function normalizeHLS(h: number, l: number, s: number): RGBA8888 {
  // Note: hue value is turned by 240° in VT340, all values given as fractions
  return HLStoRGB((h + 240 % 360) / 360, l / 100, s / 100);
}


/**
 * default palettes
 */

/**
 * 16 predefined color registers of VT340 (values in %):
 * ```
 *                R   G   B
 * 0  Black       0   0   0
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
 * ```
 * (*) less saturated
 *
 * @see https://vt100.net/docs/vt3xx-gp/chapter2.html#S2.4
*/
export const PALETTE_VT340_COLOR = [
  normalizeRGB( 0,  0,  0),
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

/**
 * 16 predefined monochrome registers of VT340 (values in %):
 * ```
 *              R   G   B
 * 0  Black     0   0   0
 * 1  Gray-2    13  13  13
 * 2  Gray-4    26  26  26
 * 3  Gray-6    40  40  40
 * 4  Gray-1    6   6   6
 * 5  Gray-3    20  20  20
 * 6  Gray-5    33  33  33
 * 7  White 7   46  46  46
 * 8  Black 0   0   0   0
 * 9  Gray-2    13  13  13
 * 10 Gray-4    26  26  26
 * 11 Gray-6    40  40  40
 * 12 Gray-1    6   6   6
 * 13 Gray-3    20  20  20
 * 14 Gray-5    33  33  33
 * 15 White 7   46  46  46
 * ```
 *
 * @see https://vt100.net/docs/vt3xx-gp/chapter2.html#S2.4
 */
export const PALETTE_VT340_GREY = [
  normalizeRGB( 0,  0,  0),
  normalizeRGB(13, 13, 13),
  normalizeRGB(26, 26, 26),
  normalizeRGB(40, 40, 40),
  normalizeRGB( 6,  6,  6),
  normalizeRGB(20, 20, 20),
  normalizeRGB(33, 33, 33),
  normalizeRGB(46, 46, 46),
  normalizeRGB( 0,  0,  0),
  normalizeRGB(13, 13, 13),
  normalizeRGB(26, 26, 26),
  normalizeRGB(40, 40, 40),
  normalizeRGB( 6,  6,  6),
  normalizeRGB(20, 20, 20),
  normalizeRGB(33, 33, 33),
  normalizeRGB(46, 46, 46)
];

/**
 * 256 predefined ANSI colors.
 *
 * @see https://en.wikipedia.org/wiki/ANSI_escape_code#8-bit
 */
export const PALETTE_ANSI_256 = (() => {
  // 16 lower colors (taken from xterm)
  const p: RGBA8888[] = [
    toRGBA8888(0, 0, 0),
    toRGBA8888(205, 0, 0),
    toRGBA8888(0, 205, 0),
    toRGBA8888(205, 205, 0),
    toRGBA8888(0, 0, 238),
    toRGBA8888(205, 0, 205),
    toRGBA8888(0, 250, 205),
    toRGBA8888(229, 229, 229),
    toRGBA8888(127, 127, 127),
    toRGBA8888(255, 0, 0),
    toRGBA8888(0, 255, 0),
    toRGBA8888(255, 255, 0),
    toRGBA8888(92, 92, 255),
    toRGBA8888(255, 0, 255),
    toRGBA8888(0, 255, 255),
    toRGBA8888(255, 255, 255),
  ];
  // colors up to 232
  const d = [0, 95, 135, 175, 215, 255];
  for (let r = 0; r < 6; ++r) {
    for (let g = 0; g < 6; ++g) {
      for (let b = 0; b < 6; ++b) {
        p.push(toRGBA8888(d[r], d[g], d[b]));
      }
    }
  }
  // grey scale to up 255
  for (let v = 8; v <= 238; v += 10) {
    p.push(toRGBA8888(v, v, v));
  }
  return p;
})();

/**
 * Background: Black by default.
 * Foreground: White by default.
 *
 * Background color is used whenever a fill color is needed and not explicitly set.
 * Foreground color is used as default initial sixel color.
 */
export const DEFAULT_BACKGROUND: RGBA8888 = toRGBA8888(0, 0, 0, 255);
export const DEFAULT_FOREGROUND: RGBA8888 = toRGBA8888(255, 255, 255, 255);
