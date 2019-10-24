/**
 * Copyright (c) 2019 Joerg Breitbart.
 * @license MIT
 */

import { assert } from 'chai';
import { fromRGBA8888, toRGBA8888, BIG_ENDIAN, red, green, blue, alpha, normalizeHLS, normalizeRGB, nearestColorIndex } from './Colors';

describe('Colors', () => {
  describe('toRGBA888', () => {
    it('conversions', () => {
      assert.equal(toRGBA8888(0, 0, 0, 0), 0);
      assert.equal(toRGBA8888(0, 0, 0, 255), BIG_ENDIAN ? 0x000000FF : 0xFF000000);
      assert.equal(toRGBA8888(0, 0, 255, 0), BIG_ENDIAN ? 0x0000FF00 : 0x00FF0000);
      assert.equal(toRGBA8888(0, 255, 0, 0), BIG_ENDIAN ? 0x00FF0000 : 0x0000FF00);
      assert.equal(toRGBA8888(255, 0, 0, 0), BIG_ENDIAN ? 0xFF000000 : 0x000000FF);
    });
    it('alpha defaults to 255', () => {
      assert.equal(toRGBA8888(0, 0, 0), toRGBA8888(0, 0, 0, 255));
      assert.equal(toRGBA8888(0, 0, 255), toRGBA8888(0, 0, 255, 255));
      assert.equal(toRGBA8888(0, 255, 0), toRGBA8888(0, 255, 0, 255));
      assert.equal(toRGBA8888(255, 0, 0), toRGBA8888(255, 0, 0, 255));
      assert.equal(toRGBA8888(0, 255, 255), toRGBA8888(0, 255, 255, 255));
      assert.equal(toRGBA8888(255, 0, 255), toRGBA8888(255, 0, 255, 255));
      assert.equal(toRGBA8888(255, 255, 0), toRGBA8888(255, 255, 0, 255));
      assert.equal(toRGBA8888(255, 255, 255), toRGBA8888(255, 255, 255, 255));
    });
    it('should only return unsigned', () => {
      // test only for r and a here (g/b dont add to significant bit)
      for (let r = 0; r <= 0xFF; ++r) {
        for (let a = 0; a <= 0xFF; ++a) {
          const color = toRGBA8888(r, 0, 0, a);
          assert.equal(color >= 0, true);
        }
      }
    });
    it('handled signed channel values', () => {
      assert.equal(toRGBA8888(-8, -50, -100, -127), toRGBA8888(-8 >>> 0, -50 >>> 0, -100 >>> 0, -127 >>> 0));
    });
    it('strip channel values to 8 bit (not clamping)', () => {
      assert.equal(toRGBA8888(0x1234, 0x5678, 0xabcd, 0xef11), BIG_ENDIAN ? 0x3478cd11 : 0x11cd7834);
    });
  });
  describe('fromRGBA8888', () => {
    it('conversions', () => {
      assert.deepEqual(fromRGBA8888(0), [0, 0, 0, 0]);
      assert.deepEqual(fromRGBA8888(0x000000FF), BIG_ENDIAN ? [0, 0, 0, 255] : [255, 0, 0, 0]);
      assert.deepEqual(fromRGBA8888(0x0000FF00), BIG_ENDIAN ? [0, 0, 255, 0] : [0, 255, 0, 0]);
      assert.deepEqual(fromRGBA8888(0x00FF0000), BIG_ENDIAN ? [0, 255, 0, 0] : [0, 0, 255, 0]);
      assert.deepEqual(fromRGBA8888(0xFF000000), BIG_ENDIAN ? [255, 0, 0, 0] : [0, 0, 0, 255]);
    });
    it('should only create unsigned channel values', () => {
      assert.deepEqual(fromRGBA8888(-1), [255, 255, 255, 255]);
      // 2 complement: -0xedcba988 ==> 0x12345678 (newDigit = 15 - digit; result + 1)
      assert.deepEqual(fromRGBA8888(-0xedcba988), BIG_ENDIAN ? [0x12, 0x34, 0x56, 0x78] : [0x78, 0x56, 0x34, 0x12]);
    });
    it('strip values to 32bit', () => {
      assert.deepEqual(fromRGBA8888(0x1234567890), BIG_ENDIAN ? [0x12, 0x34, 0x56, 0x78] : [0x90, 0x78, 0x56, 0x34]);
    });
  });
  describe('channels', () => {
    it('red', () => {
      assert.deepEqual(red(toRGBA8888(0x12, 0x34, 0x56, 0x78)), 0x12);
    });
    it('green', () => {
      assert.deepEqual(green(toRGBA8888(0x12, 0x34, 0x56, 0x78)), 0x34);
    });
    it('blue', () => {
      assert.deepEqual(blue(toRGBA8888(0x12, 0x34, 0x56, 0x78)), 0x56);
    });
    it('green', () => {
      assert.deepEqual(alpha(toRGBA8888(0x12, 0x34, 0x56, 0x78)), 0x78);
    });
  });
  it('RGB/HLS VT340 normalization', () => {
    // values taken from https://vt100.net/docs/vt3xx-gp/chapter2.html#S2.4
    assert.equal(normalizeHLS(0, 0, 0), normalizeRGB(0, 0, 0));
    assert.equal(normalizeHLS(0, 50, 60), normalizeRGB(20, 20, 80));
    assert.equal(normalizeHLS(120, 46, 72), normalizeRGB(80, 13, 13) - 2);              // mismatch R: 2
    assert.equal(normalizeHLS(240, 50, 60), normalizeRGB(20, 80, 20));
    assert.equal(normalizeHLS(60, 50, 60), normalizeRGB(80, 20, 80));
    assert.equal(normalizeHLS(300, 50, 60), normalizeRGB(20, 80, 80));
    assert.equal(normalizeHLS(180, 50, 60), normalizeRGB(80, 80, 20));
    assert.equal(normalizeHLS(0, 53, 0), normalizeRGB(53, 53, 53));
    assert.equal(normalizeHLS(0, 26, 0), normalizeRGB(26, 26, 26));
    assert.equal(normalizeHLS(0, 46, 29), normalizeRGB(33, 33, 60) - 0x020101);         // mismatch B: 2 G: 1 R: 1
    assert.equal(normalizeHLS(120, 43, 39), normalizeRGB(60, 26, 26) + 0x010100 - 0x1); // mismatch B: -1 G: -1 R: 1
    assert.equal(normalizeHLS(240, 46, 29), normalizeRGB(33, 60, 33) - 0x010201);       // mismatch B: 1 G: 2 R: 1
    // assert.equal(normalizeHLS(60, 46, 29), normalizeRGB(60, 33, 60));
    // assert.equal(normalizeHLS(300, 46, 29), normalizeRGB(33, 60, 60));
    // assert.equal(normalizeHLS(180, 46, 29), normalizeRGB(60, 60, 33));
    assert.equal(normalizeHLS(0, 80, 0), normalizeRGB(80, 80, 80));

    // basic HLS tests
    assert.equal(normalizeHLS(0, 50, 100), toRGBA8888(0, 0, 255));
    assert.equal(normalizeHLS(120, 50, 100), toRGBA8888(255, 0, 0));
    assert.equal(normalizeHLS(240, 50, 100), toRGBA8888(0, 255, 0));
    assert.equal(normalizeHLS(180, 50, 100), toRGBA8888(255, 255, 0));
    assert.equal(normalizeHLS(300, 50, 100), toRGBA8888(0, 255, 255));
    assert.equal(normalizeHLS(60, 50, 100), toRGBA8888(255, 0, 255));
  });
  it('nearestColorIndex (ED)', () => {
    const p: [number, number, number][] = [[0, 0, 0], [50, 50, 0], [100, 50, 50], [100, 100, 100], [150, 100, 50]];
    assert.equal(nearestColorIndex(toRGBA8888(1, 2, 3), p), 0);
    assert.equal(nearestColorIndex(toRGBA8888(100, 100, 100), p), 3);
    assert.equal(nearestColorIndex(toRGBA8888(170, 100, 50), p), 4);
  });
});
