/**
 * Copyright (c) 2019 Joerg Breitbart.
 * @license MIT
 */

import * as assert from 'assert';
import { SixelDecoder, toRGBA8888, sixelEncode } from './index';
import { RGBA8888 } from './Types';

describe('encode - decode cycles', () => {
  let source32: Uint32Array;
  let source8: Uint8ClampedArray;
  let target32: Uint32Array;
  let target8: Uint8ClampedArray;
  beforeEach(() => {
    // test with max 100x100 pixel data
    source32 = new Uint32Array(100 * 100);
    source8 = new Uint8ClampedArray(source32.buffer);
    target32 = new Uint32Array(100 * 100);
    target8 = new Uint8ClampedArray(target32.buffer);
  });
  it('10x1 black', () => {
    // prepare data
    for (let i = 0; i < 10; ++i) source32[i] = toRGBA8888(0, 0, 0);
    // encode
    const sixels = sixelEncode(source8.subarray(0, 10 * 4), 10, 1, [toRGBA8888(0, 0, 0)]);
    // decode
    const imgDec = new SixelDecoder(0);
    imgDec.decodeString(sixels);
    imgDec.toPixelData(target8.subarray(0, 10 * 4), 10, 1);
    // compare
    assert.deepStrictEqual(target8, source8);
    assert.strictEqual(imgDec.width, 10);
    assert.strictEqual(imgDec.height, 1);
    assert.strictEqual(imgDec.memUsage, 16 * 6 * 4);  // 4 --> 8 --> 16 * 6 * 4
  });
  it('1x10 black', () => {
    // prepare data
    for (let i = 0; i < 10; ++i) source32[i] = toRGBA8888(0, 0, 0);
    // encode
    const sixels = sixelEncode(source8.subarray(0, 10 * 4), 1, 10, [toRGBA8888(0, 0, 0)]);
    // decode
    const imgDec = new SixelDecoder(0);
    imgDec.decodeString(sixels);
    imgDec.toPixelData(target8.subarray(0, 10 * 4), 1, 10);
    // compare
    assert.deepStrictEqual(target8, source8);
    assert.strictEqual(imgDec.width, 1);
    assert.strictEqual(imgDec.height, 10);
    assert.strictEqual(imgDec.realHeight, 10);
    assert.strictEqual(imgDec.memUsage, (4 + 1) * 6 * 4); // (4 + 1) * 6 * 4
  });
  it('10x1 with 8 colors', () => {
    // prepare data
    const palette: RGBA8888[] = [
      toRGBA8888(0, 0, 0),
      toRGBA8888(255, 0, 0),
      toRGBA8888(0, 255, 0),
      toRGBA8888(0, 0, 255),
      toRGBA8888(255, 255, 0),
      toRGBA8888(255, 0, 255),
      toRGBA8888(0, 255, 255),
      toRGBA8888(255, 255, 255)
    ];
    for (let i = 0; i < 8; ++i) source32[i] = palette[i];
    // encode
    const sixels = sixelEncode(source8.subarray(0, 8 * 4), 8, 1, palette);
    // decode
    const imgDec = new SixelDecoder(0);
    imgDec.decodeString(sixels);
    imgDec.toPixelData(target8.subarray(0, 8 * 4), 8, 1);
    // compare
    assert.deepStrictEqual(target8, source8);
    assert.strictEqual(imgDec.width, 8);
    assert.strictEqual(imgDec.height, 1);
  });
  it('100x100 with 256 random colors (noise)', () => {
    // prepare data
    // generate 256 random colors
    const strippedPal: number[] = [];
    while (strippedPal.length < 256) {
      const v = Math.floor(Math.random() * (255 << 16 | 255 << 8 | 255));
      if (!~strippedPal.indexOf(v)) strippedPal.push(v);
    }
    // convert to sixel palette
    const palette: RGBA8888[] = [];
    for (let i = 0; i < 256; ++i) {
      const v = strippedPal[i];
      // we have to do a normalization to 100 steps in between
      // channels values between cannot be expressed in SIXEL (lower color resolution)
      const r = Math.round(Math.round((v >> 16) / 255 * 100) / 100 * 255);
      const g = Math.round(Math.round(((v >> 8) & 0xFF) / 255 * 100) / 100 * 255);
      const b = Math.round(Math.round((v & 0xFF) / 255 * 100) / 100 * 255);
      palette.push(toRGBA8888(r, g, b));
    }
    // apply to input data
    for (let i = 0; i < 100 * 100; ++i) {
      source32[i] = palette[Math.floor(Math.random() * 256)];
    }
    // encode
    const sixels = sixelEncode(source8, 100, 100, palette);
    // decode
    const imgDec = new SixelDecoder(0, new Uint32Array(256));
    imgDec.decodeString(sixels);
    imgDec.toPixelData(target8, 100, 100);
    // compare
    assert.deepStrictEqual(target8, source8);
    assert.strictEqual(imgDec.width, 100);
    assert.strictEqual(imgDec.height, 100);
    // 4 --> 8 --> 16 --> 32 --> 64 --> 128 * 6 * 4
    // + 16 * 100 * 6 * 4
    assert.strictEqual(imgDec.memUsage, 128 * 6 * 4 + 16 * 100 * 6 * 4);
  });
});
