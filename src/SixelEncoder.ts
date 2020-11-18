/**
 * Copyright (c) 2019 Joerg Breitbart.
 * @license MIT
 */

import { RGBA8888, RGBColor } from './Types';
import { toRGBA8888, fromRGBA8888, alpha, nearestColorIndex } from './Colors';
import { reduce } from './Quantizer';


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
export function introducer(backgroundSelect: 0 | 1 | 2 = 0): string {
  return `\x1bP0;${backgroundSelect};q`;
}


/**
 * Finalize SIXEL sequence. Write this, when the SIXEL data stream has ended to restore
 * the terminal to normal operation.
 */
export const FINALIZER = '\x1b\\';


/**
 * Convert 6 bit code to SIXEL string.
 */
function codeToSixel(code: number, repeat: number): string {
  const c = String.fromCharCode(code + 63);
  if (repeat > 3) return '!' + repeat + c;
  if (repeat === 3) return c + c + c;
  if (repeat === 2) return c + c;
  return c;
}


/**
 * Create SIXEL data for a 6 pixel band.
 */
function processBand(
  data32: Uint32Array,
  start: number,
  bandHeight: number,
  width: number,
  colorMap: Map<RGBA8888, number>,
  paletteRGB: RGBColor[]): string
{
  // temp buffers to hold various color data
  // last: last seen SIXEL code per color
  // code: current SIXEL code per color
  // accu: count rows with equal SIXEL codes per color
  // slots: palette color --> idx in usedColorIdx
  const last = new Int8Array(paletteRGB.length + 1);
  const code = new Uint8Array(paletteRGB.length + 1);
  const accu = new Uint16Array(paletteRGB.length + 1);
  const slots = new Int16Array(paletteRGB.length + 1);

  last.fill(-1);
  accu.fill(1);
  slots.fill(-1);

  // array to hold band local color idx
  // only those are processed and written to output
  // whenever a new color enters here we have to extend the accu/code handling below
  const usedColorIdx: number[] = [];

  // storage for SIXELs per color in band
  const targets: string[][] = [];

  let oldColor = 0;
  let idx = 0;
  for (let i = 0; i < width; ++i) {
    const p = start + i;
    let rowOffset = 0;
    code.fill(0, 0, usedColorIdx.length);
    for (let row = 0; row < bandHeight; ++row) {
      const color = data32[p + rowOffset];
      // skip expensive color to palette matching if we have same color as before
      if (color !== oldColor) {
        oldColor = color;
        idx = alpha(color) ? colorMap.get(color) : 0;
        if (idx === undefined) {
          idx = nearestColorIndex(color, paletteRGB) + 1;
          colorMap.set(color, idx);
        }
        // extend accu/code handling to new color
        if (slots[idx] === -1) {
          targets.push([]);
          // if not at start catch up by writing 0s up to i for new color
          // (happens during shift below)
          if (i) {
            last[usedColorIdx.length] = 0;
            accu[usedColorIdx.length] = i;
          }
          slots[idx] = usedColorIdx.length;
          usedColorIdx.push(idx);
        }
      }
      // update codes for a row of 6 pixels
      code[slots[idx]] |= 1 << row;
      rowOffset += width;
    }
    // code/last/accu shift, updates SIXELs per color in band
    for (let j = 0; j < usedColorIdx.length; ++j) {
      if (code[j] === last[j]) {
        accu[j]++;
      } else {
        if (~last[j]) {
          targets[j].push(codeToSixel(last[j], accu[j]));
        }
        last[j] = code[j];
        accu[j] = 1;
      }
    }

  }
  // handle remaining SIXELs to EOL
  for (let j = 0; j < usedColorIdx.length; ++j) {
    if (last[j]) {
      targets[j].push(codeToSixel(last[j], accu[j]));
    }
  }
  // write sixel chunk for every color in band
  const result: string[] = [];
  for (let j = 0; j < usedColorIdx.length; ++j) {
    if (!usedColorIdx[j]) continue; // skip background
    result.push('#' + (usedColorIdx[j] - 1) + targets[j].join('') + '$');
  }
  return result.join('');
}


/**
 * sixelEncode - encode pixel data to SIXEL string.
 *
 * The colors of the image get aligned to the given palette, unmatched colors will be translated
 * by euclidean distance. Without proper quantization beforehand this leads to poor output quality,
 * thus consider using a quantizer with custom palette creation and dithering.
 * For transparency only an alpha value of 0 will be respected as fully transparent,
 * other alpha values are set to fully opaque (255). Transparent pixels will be colored by the
 * terminal later on depending on the `backgroundSelect` setting of the introducer.
 *
 * To be in line with the SIXEL spec (DEC STD 070) `palette` should not contain more than 256 colors.
 * Note that older devices limit color registers even further (16 on VT340). Furthermore a high
 * number of colors will have a penalty on creation time, temporary memory usage and
 * the size of the SIXEL data. For simple graphics a rather small palette (16 to 64) might do,
 * for complicated pictures higher should work with 128+.
 *
 * @param data    pixel data
 * @param width   width of the image
 * @param height  height of the image
 * @param palette palette to be applied
 * @param rasterAttributes whether to write raster attributes (true)
 */
export function sixelEncode(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  palette: RGBA8888[] | RGBColor[],
  rasterAttributes: boolean = true): string
{
  // some sanity checks
  if (!data.length || !width || !height) {
    return '';
  }
  if (width * height * 4 !== data.length) {
    throw new Error('wrong geometry of data');
  }
  if (!palette || !palette.length) {
    throw new Error('palette must not be empty');
  }

  // cleanup/prepare palettes
  // paletteWithZero: holds background color in slot 0
  // paletteRGB: list of [R, G, B] for ED calc
  const paletteWithZero: RGBA8888[] = [0];
  const paletteRGB: RGBColor[] = [];
  for (let i = 0; i < palette.length; ++i) {
    let color = palette[i];
    if (typeof color === 'number') {
      if (!alpha(color)) continue;
      color = toRGBA8888(...fromRGBA8888(color));
    } else {
      color = toRGBA8888(...color);
    }
    if (!~paletteWithZero.indexOf(color)) {
      paletteWithZero.push(color);
      paletteRGB.push(fromRGBA8888(color).slice(0, -1) as RGBColor);
    }
  }

  // SIXEL data storage
  const chunks: string[] = [];

  // write raster attributes (includes image dimensions) - " Pan ; Pad ; Ph ; Pv
  // note: Pan/Pad are set to dummies (not eval'd by any terminal)
  if (rasterAttributes) {
    chunks.push(`"1;1;${width};${height}`);
  }

  // create palette and write color entries
  for (let [idx, [r, g, b]] of paletteRGB.entries()) {
    chunks.push(`#${idx};2;${Math.round(r / 255 * 100)};${Math.round(g / 255 * 100)};${Math.round(b / 255 * 100)}`);
  }

  // color --> slot
  // if color does not match a palette color a suitable slot will be calculated from ED later on
  const colorMap = new Map<RGBA8888, number>(paletteWithZero.map((el, idx) => [el, idx]));

  // process in bands of 6 pixels
  const bands: string[] = [];
  const data32 = new Uint32Array(data.buffer);
  for (let b = 0; b < height; b += 6) {
    bands.push(processBand(data32, b * width, height - b >= 6 ? 6 : height - b, width, colorMap, paletteRGB));
  }
  chunks.push(bands.join('-\n'));
  return chunks.join('');
}


/**
 * Create SIXEL data for a 6 pixel band.
 * Same as `processBand`, but for correctly indexed colors.
 */
function processBandIndexed(
  indices: Uint16Array,
  start: number,
  bandHeight: number,
  width: number,
  last: Int8Array,
  code: Uint8Array,
  accu: Uint16Array,
  slots: Int16Array): string
{
  // reset buffers
  last.fill(-1);
  code.fill(0);
  accu.fill(1);
  slots.fill(-1);

  // array to hold band local color idx
  // only those are processed and written to output
  // whenever a new color enters here we have to extend the accu/code handling below
  const usedColorIdx: number[] = [];

  // storage for SIXELs per color in band
  const targets: string[][] = [];

  for (let i = 0; i < width; ++i) {
    const p = start + i;
    let rowOffset = 0;
    code.fill(0, 0, usedColorIdx.length);
    for (let row = 0; row < bandHeight; ++row) {
      const idx = indices[p + rowOffset] + 1;   // FIXME: handle alpha = 0 case
      if (slots[idx] === -1) {
        targets.push([]);
        // if not at start catch up by writing 0s up to i for new color
        // (happens during shift below)
        if (i) {
          last[usedColorIdx.length] = 0;
          accu[usedColorIdx.length] = i;
        }
        slots[idx] = usedColorIdx.length;
        usedColorIdx.push(idx);
      }
      // update codes for a row of 6 pixels
      code[slots[idx]] |= 1 << row;
      rowOffset += width;
    }
    // code/last/accu shift, updates SIXELs per color in band
    for (let j = 0; j < usedColorIdx.length; ++j) {
      if (code[j] === last[j]) {
        accu[j]++;
      } else {
        if (~last[j]) {
          targets[j].push(codeToSixel(last[j], accu[j]));
        }
        last[j] = code[j];
        accu[j] = 1;
      }
    }

  }
  // handle remaining SIXELs to EOL
  for (let j = 0; j < usedColorIdx.length; ++j) {
    if (last[j]) {
      targets[j].push(codeToSixel(last[j], accu[j]));
    }
  }
  // write sixel chunk for every color in band
  const result: string[] = [];
  for (let j = 0; j < usedColorIdx.length; ++j) {
    if (!usedColorIdx[j]) continue; // skip background
    result.push('#' + (usedColorIdx[j] - 1) + targets[j].join('') + '$');
  }
  return result.join('');
}

/**
 * sixelEncodeIndexed - encode indexed image data to SIXEL string.
 * Same as `sixelEncode`, but for correctly indexed colors.
 */
export function sixelEncodeIndexed(
  indices: Uint16Array,
  width: number,
  height: number,
  palette: RGBA8888[] | RGBColor[],
  rasterAttributes: boolean = true): string
{
  // some sanity checks
  if (!indices.length || !width || !height) {
    return '';
  }
  if (width * height !== indices.length) {
    throw new Error('wrong geometry of data');
  }
  if (!palette || !palette.length) {
    throw new Error('palette must not be empty');
  }

  // cleanup/prepare palettes
  // paletteWithZero: holds background color in slot 0
  // paletteRGB: list of [R, G, B] for ED calc
  const paletteWithZero: RGBA8888[] = [0];
  const paletteRGB: RGBColor[] = [];
  for (let i = 0; i < palette.length; ++i) {
    let color = palette[i];
    if (typeof color === 'number') {
      if (!alpha(color)) continue;
      color = toRGBA8888(...fromRGBA8888(color));
    } else {
      color = toRGBA8888(...color);
    }
    if (!~paletteWithZero.indexOf(color)) {
      paletteWithZero.push(color);
      paletteRGB.push(fromRGBA8888(color).slice(0, -1) as RGBColor);
    }
  }

  // SIXEL data storage
  const chunks: string[] = [];

  // write raster attributes (includes image dimensions) - " Pan ; Pad ; Ph ; Pv
  // note: Pan/Pad are set to dummies (not eval'd by any terminal)
  if (rasterAttributes) {
    chunks.push(`"1;1;${width};${height}`);
  }

  // create palette and write color entries
  for (let [idx, [r, g, b]] of paletteRGB.entries()) {
    chunks.push(`#${idx};2;${Math.round(r / 255 * 100)};${Math.round(g / 255 * 100)};${Math.round(b / 255 * 100)}`);
  }

  // temp buffers to hold various color data on band level
  // last: last seen SIXEL code per color
  // code: current SIXEL code per color
  // accu: count rows with equal SIXEL codes per color
  // slots: palette color --> idx in usedColorIdx
  const last = new Int8Array(paletteRGB.length + 1);
  const code = new Uint8Array(paletteRGB.length + 1);
  const accu = new Uint16Array(paletteRGB.length + 1);
  const slots = new Int16Array(paletteRGB.length + 1);

  // process in bands of 6 pixels
  const bands: string[] = [];
  for (let b = 0; b < height; b += 6) {
    bands.push(processBandIndexed(indices, b * width, height - b >= 6 ? 6 : height - b, width,
      last, code, accu, slots));
  }
  chunks.push(bands.join('-\n'));
  return chunks.join('');
}


/**
 * Convenient method to create a full SIXEL escape sequence for given image data.
 *
 * Quantization is done by the internal quantizer with dithering. By default the quantizer
 * will use a faster color approximation for `max_colors >= 128`. This works great for real
 * pictures, but might lead to visable color artefacts on graphics. In that case you can switch
 * to the exact color matching with `fast = false`.
 *
 * Dithering is only done on 4 neighboring pixels, which again works great for real pictures
 * to level out hard color plane borders, but might show moiré or striping artefacts on
 * color gradients. Currently the dithering is not configurable, resort to custom quantizer
 * library in conjunction with `sixelEncode` if you observe dithering issues.
 *
 * @param data              pixel data
 * @param width             width of the image
 * @param height            height of the image
 * @param maxColors         max colors of the created palette
 * @param fast              whether to use fast color approximation
 * @param backgroundSelect  background select behavior for transparent pixels
 */
export function image2sixel(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  maxColors: number = 256,
  backgroundSelect: 0 | 1 | 2 = 0): string
{
  // FIXME: sixelEncodeIndexed does not yet handle transparent pixels
  // FIXME: dithering in reduce does not yet respect image width/height
  const { indices, palette } = reduce(data, width, maxColors);
  const sixelData = sixelEncodeIndexed(indices, width, height, palette);
  return [introducer(backgroundSelect), sixelData, FINALIZER].join('');
}
