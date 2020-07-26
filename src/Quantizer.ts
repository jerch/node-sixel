/**
 * Copyright (c) 2020 Joerg Breitbart.
 * @license MIT
 *
 * Parts taken from UPNG:
 * MIT License, Copyright (c) 2017 Photopea
 */
import { red, green, blue } from "./Colors";
import { IQuantResult } from "./Types";
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
  colors: number,
  fast_approximation: boolean = true): IQuantResult
{
  const data32 = new Uint32Array(data.buffer);

  // palette creation with kd tree
  const KD = UPNGQuantize.getKDtree(data.slice(), colors);
  var planeDst = UPNGQuantize.planeDst;
  const root = KD[0];
  const leafs = KD[1];

  const f = 1 / 255;
  const indices = new Uint16Array(data32.length);
  let nd: any;
  const len = data32.length;
  if (fast_approximation) {
    for(let i = 0; i < len; ++i) {
      const v = data32[i];
      const r = red(v);
      const g = green(v);
      const b = blue(v);

      // fast approx. within kd descent
      // gives good enough matches for most bigger pictures and high palette colors
      // likely to fail for less palette colors where a single color forms a rather big hyperspace
      nd = root;
      while (nd.left) {
        nd = (planeDst(nd.est, r * f,g * f,b * f, 1) <= 0) ? nd.left : nd.right;
      }
      const idx = nd.ind;
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
  } else {
    for(let i = 0; i < len; ++i) {
      const v = data32[i];
      const r = red(v);
      const g = green(v);
      const b = blue(v);

      // slower matching, but finds the true nearest palette color
      const idx = UPNGQuantize.getNearest(root, r * f, g * f, b * f, 1).ind;
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
  }
  return { indices, palette: leafs.map((el: any) => el.est.rgba) };
}
