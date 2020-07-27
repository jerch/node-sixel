/**
 * Copyright (c) 2020 Joerg Breitbart.
 * @license MIT
 *
 * Parts taken from UPNG:
 * MIT License, Copyright (c) 2017 Photopea
 */
import { red, green, blue, fromRGBA8888 } from "./Colors";
import { IQuantResult, RGBColor, RGBA8888 } from "./Types";
const UPNGQuantize = require('../upng').quantize;


function clamp8Bit(value: number): number {
  return value >= 255 ? 255 : value < 0 ? 0 : value;
}


function applyError(value: number, r:number, g:number, b:number): number {
  return ((0xFF00 | clamp8Bit(blue(value) + b))
          << 8    | clamp8Bit(green(value) + g))
          << 8    | clamp8Bit(red(value) + r);
}


/**
 * The internal quantizer currently relies on the kd tree quanization from UPNG.
 *
 * Planned:
 *  - SIXEL optimized quantizer without alpha channel and reduced RGB (only 1M colors possible)
 *  - better/customizable dithering algos
 *  - separate palette creation from image reduction
 *  - support for predefined palette (needs reconstruction of kd tree)
 *  - grayscale / monochrome transformations
 *
 * FIXME: Dithering should respect image dimensions.
 */
export function reduce(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  colors: number): IQuantResult
{
  const data32 = new Uint32Array(data.buffer);

  // palette creation with kd tree
  const KD = UPNGQuantize.getKDtree(data.slice(), colors);
  const leafs = KD[1];
  const palette = leafs.map((el: any) => fromRGBA8888(el.est.rgba));
  const cm = new ColorMatcher(palette);

  const indices = new Uint16Array(data32.length);
  const len = data32.length;
  for(let i = 0; i < len; ++i) {
    const v = data32[i];
    const r = red(v);
    const g = green(v);
    const b = blue(v);

    // boxed matching - compromise between exact match and performance
    const idx = cm.nearest(v);
    indices[i] = idx;

    // dithering - FIXME: find better algo in terms of output quality and speed
    const vp = leafs[idx].est.rgba;
    let er = (r - red(vp)) >> 2;
    let eg = (g - green(vp)) >> 2;
    let eb = (b - blue(vp)) >> 2;

    //FIXME: respect idx overflow / left and right border
    data32[i + 1] = applyError(data32[i + 1], er, eg, eb)
    data32[i + width] = applyError(data32[i + width], er, eg, eb)

    er >>= 1;
    eg >>= 1;
    eb >>= 1;
    data32[i + width - 1] = applyError(data32[i + width - 1], er, eg, eb);
    data32[i + width + 1] = applyError(data32[i + width + 1], er, eg, eb);
  }
  return { indices, palette: leafs.map((el: any) => el.est.rgba) };
}


/**
 * Class to do nearest palette color matching with 16x16x16 boxes.
 */
class ColorMatcher {
  private _boxes: {[key: number]: number[]} = {};
  private _boxes2: {[key: number]: number[]} = {};
  constructor(public palette: RGBColor[], radius: number = 14, radius2: number = 42) {
    // limit: search sphere to add palette points from
    // limit2: outer search sphere for uncertain area
    // the value is chosen to get an error rate > 5%
    // while not penalizing runtime too much (inner sphere is good trade off)
    const limit = radius * radius * 3;
    const limit2 = radius2 * radius2 * 3;
    for (let i = 0; i < 4096; ++i) {
      const x = i >> 8;
      const y = i >> 4 & 15;
      const z = i & 15;
      this._nearestPoints(i, (x<<4) + 8, (y<<4) + 8, (z<<4) + 8, limit, limit2);
    }
  }
  private _nearestPoints(box: number, r: number, g: number, b: number, limit: number, limit2: number): void {  
    let min = Number.MAX_SAFE_INTEGER;
    let idx = -1;
    const pointIndices: number[] = [];
    const pointIndices2: number[] = [];
    for (let i = 0; i < this.palette.length; ++i) {
      const p_color = this.palette[i];
      const d = this._distance(r, g, b, p_color[0], p_color[1], p_color[2]);
      if (d < min) {
        min = d;
        idx = i;
      }
      if (d < limit) {
        pointIndices.push(i);
      } else if (d < limit2) {
        pointIndices2.push(i);
      }
    }
    if (pointIndices.length === 0) {
      pointIndices.push(idx);
    }
    this._boxes[box] = pointIndices;
    this._boxes2[box] = pointIndices2;
  }
  private _distance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return dr * dr + dg * dg + db * db;
  }
  public nearest(color: RGBA8888): number {
    const r = red(color);
    const g = green(color);
    const b = blue(color);
    const box = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const indices = this._boxes[box];
    let min = Number.MAX_SAFE_INTEGER;
    let idx = -1;
    // inner sphere handling
    for (let i = 0; i < indices.length; ++i) {
      const p_color = this.palette[indices[i]];
      const d = this._distance(r, g, b, p_color[0], p_color[1], p_color[2]);
      if (!d) return indices[i];
      if (d < min) {
        min = d;
        idx = indices[i];
      }
    }
    // check for outer sphere if point is within uncertain area (d > 8*8 + 8*8 + 8*8)
    if (this._distance(r, g, b, (r & 0xF0) + 8, (g & 0xF0) + 8, (b & 0xF0) + 8) > 192) {
      const indices = this._boxes2[box];
      for (let i = 0; i < indices.length; ++i) {
        const p_color = this.palette[indices[i]];
        const d = this._distance(r, g, b, p_color[0], p_color[1], p_color[2]);
        if (d < min) {
          min = d;
          idx = indices[i];
        }
      }
    }
    return idx;
  }
}
