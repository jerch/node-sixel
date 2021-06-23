/**
 * Copyright (c) 2019 Joerg Breitbart.
 * @license MIT
 */

import * as assert from 'assert';
import { fromRGBA8888, toRGBA8888, BIG_ENDIAN, red, green, blue, alpha, normalizeHLS, normalizeRGB, nearestColorIndex } from './Colors';
import * as colors from './Colors';

describe('Colors', () => {
  describe('toRGBA888', () => {
    it('conversions', () => {
      assert.strictEqual(toRGBA8888(0, 0, 0, 0), 0);
      assert.strictEqual(toRGBA8888(0, 0, 0, 255), BIG_ENDIAN ? 0x000000FF : 0xFF000000);
      assert.strictEqual(toRGBA8888(0, 0, 255, 0), BIG_ENDIAN ? 0x0000FF00 : 0x00FF0000);
      assert.strictEqual(toRGBA8888(0, 255, 0, 0), BIG_ENDIAN ? 0x00FF0000 : 0x0000FF00);
      assert.strictEqual(toRGBA8888(255, 0, 0, 0), BIG_ENDIAN ? 0xFF000000 : 0x000000FF);
    });
    it('alpha defaults to 255', () => {
      assert.strictEqual(toRGBA8888(0, 0, 0), toRGBA8888(0, 0, 0, 255));
      assert.strictEqual(toRGBA8888(0, 0, 255), toRGBA8888(0, 0, 255, 255));
      assert.strictEqual(toRGBA8888(0, 255, 0), toRGBA8888(0, 255, 0, 255));
      assert.strictEqual(toRGBA8888(255, 0, 0), toRGBA8888(255, 0, 0, 255));
      assert.strictEqual(toRGBA8888(0, 255, 255), toRGBA8888(0, 255, 255, 255));
      assert.strictEqual(toRGBA8888(255, 0, 255), toRGBA8888(255, 0, 255, 255));
      assert.strictEqual(toRGBA8888(255, 255, 0), toRGBA8888(255, 255, 0, 255));
      assert.strictEqual(toRGBA8888(255, 255, 255), toRGBA8888(255, 255, 255, 255));
    });
    it('should only return unsigned', () => {
      // test only for r and a here (g/b dont add to significant bit)
      for (let r = 0; r <= 0xFF; ++r) {
        for (let a = 0; a <= 0xFF; ++a) {
          const color = toRGBA8888(r, 0, 0, a);
          assert.strictEqual(color >= 0, true);
        }
      }
    });
    it('handled signed channel values', () => {
      assert.strictEqual(toRGBA8888(-8, -50, -100, -127), toRGBA8888(-8 >>> 0, -50 >>> 0, -100 >>> 0, -127 >>> 0));
    });
    it('strip channel values to 8 bit (not clamping)', () => {
      assert.strictEqual(toRGBA8888(0x1234, 0x5678, 0xabcd, 0xef11), BIG_ENDIAN ? 0x3478cd11 : 0x11cd7834);
    });
  });
  describe('fromRGBA8888', () => {
    it('conversions', () => {
      assert.deepStrictEqual(fromRGBA8888(0), [0, 0, 0, 0]);
      assert.deepStrictEqual(fromRGBA8888(0x000000FF), BIG_ENDIAN ? [0, 0, 0, 255] : [255, 0, 0, 0]);
      assert.deepStrictEqual(fromRGBA8888(0x0000FF00), BIG_ENDIAN ? [0, 0, 255, 0] : [0, 255, 0, 0]);
      assert.deepStrictEqual(fromRGBA8888(0x00FF0000), BIG_ENDIAN ? [0, 255, 0, 0] : [0, 0, 255, 0]);
      assert.deepStrictEqual(fromRGBA8888(0xFF000000), BIG_ENDIAN ? [255, 0, 0, 0] : [0, 0, 0, 255]);
    });
    it('should only create unsigned channel values', () => {
      assert.deepStrictEqual(fromRGBA8888(-1), [255, 255, 255, 255]);
      // 2 complement: -0xedcba988 ==> 0x12345678 (newDigit = 15 - digit; result + 1)
      assert.deepStrictEqual(fromRGBA8888(-0xedcba988), BIG_ENDIAN ? [0x12, 0x34, 0x56, 0x78] : [0x78, 0x56, 0x34, 0x12]);
    });
    it('strip values to 32bit', () => {
      assert.deepStrictEqual(fromRGBA8888(0x1234567890), BIG_ENDIAN ? [0x12, 0x34, 0x56, 0x78] : [0x90, 0x78, 0x56, 0x34]);
    });
  });
  describe('channels', () => {
    it('red', () => {
      assert.strictEqual(red(toRGBA8888(0x12, 0x34, 0x56, 0x78)), 0x12);
    });
    it('green', () => {
      assert.strictEqual(green(toRGBA8888(0x12, 0x34, 0x56, 0x78)), 0x34);
    });
    it('blue', () => {
      assert.strictEqual(blue(toRGBA8888(0x12, 0x34, 0x56, 0x78)), 0x56);
    });
    it('green', () => {
      assert.strictEqual(alpha(toRGBA8888(0x12, 0x34, 0x56, 0x78)), 0x78);
    });
  });
  it('RGB/HLS VT340 normalization', () => {
    // values taken from https://vt100.net/docs/vt3xx-gp/chapter2.html#S2.4
    assert.strictEqual(normalizeHLS(0, 0, 0), normalizeRGB(0, 0, 0));
    assert.strictEqual(normalizeHLS(0, 50, 60), normalizeRGB(20, 20, 80));
    assert.strictEqual(normalizeHLS(120, 46, 72), normalizeRGB(80, 13, 13) - 2);              // mismatch R: 2
    assert.strictEqual(normalizeHLS(240, 50, 60), normalizeRGB(20, 80, 20));
    assert.strictEqual(normalizeHLS(60, 50, 60), normalizeRGB(80, 20, 80));
    assert.strictEqual(normalizeHLS(300, 50, 60), normalizeRGB(20, 80, 80));
    assert.strictEqual(normalizeHLS(180, 50, 60), normalizeRGB(80, 80, 20));
    assert.strictEqual(normalizeHLS(0, 53, 0), normalizeRGB(53, 53, 53));
    assert.strictEqual(normalizeHLS(0, 26, 0), normalizeRGB(26, 26, 26));
    assert.strictEqual(normalizeHLS(0, 46, 29), normalizeRGB(33, 33, 60) - 0x020101);         // mismatch B: 2 G: 1 R: 1
    assert.strictEqual(normalizeHLS(120, 43, 39), normalizeRGB(60, 26, 26) + 0x010100 - 0x1); // mismatch B: -1 G: -1 R: 1
    assert.strictEqual(normalizeHLS(240, 46, 29), normalizeRGB(33, 60, 33) - 0x010201);       // mismatch B: 1 G: 2 R: 1
    assert.strictEqual(normalizeHLS(0, 80, 0), normalizeRGB(80, 80, 80));

    // basic HLS tests
    assert.strictEqual(normalizeHLS(0, 50, 100), toRGBA8888(0, 0, 255));
    assert.strictEqual(normalizeHLS(120, 50, 100), toRGBA8888(255, 0, 0));
    assert.strictEqual(normalizeHLS(240, 50, 100), toRGBA8888(0, 255, 0));
    assert.strictEqual(normalizeHLS(180, 50, 100), toRGBA8888(255, 255, 0));
    assert.strictEqual(normalizeHLS(300, 50, 100), toRGBA8888(0, 255, 255));
    assert.strictEqual(normalizeHLS(60, 50, 100), toRGBA8888(255, 0, 255));
  });
  it('nearestColorIndex (ED)', () => {
    const p: [number, number, number][] = [[0, 0, 0], [50, 50, 0], [100, 50, 50], [100, 100, 100], [150, 100, 50]];
    assert.strictEqual(nearestColorIndex(toRGBA8888(1, 2, 3), p), 0);
    assert.strictEqual(nearestColorIndex(toRGBA8888(100, 100, 100), p), 3);
    assert.strictEqual(nearestColorIndex(toRGBA8888(170, 100, 50), p), 4);
  });
  it('BE fake tests', () => {
    const endianess = BIG_ENDIAN;
    (colors as any).BIG_ENDIAN = true;
    colors.red(0x11223344);
    assert.strictEqual(colors.red(0x11223344), 0x11);
    assert.strictEqual(colors.green(0x11223344), 0x22);
    assert.strictEqual(colors.blue(0x11223344), 0x33);
    assert.strictEqual(colors.alpha(0x11223344), 0x44);
    assert.deepStrictEqual(colors.fromRGBA8888(0x11223344), [0x11, 0x22, 0x33, 0x44]);
    assert.strictEqual(colors.toRGBA8888(0x11, 0x22, 0x33, 0x44), 0x11223344);
    assert.strictEqual(colors.normalizeHLS(0, 50, 60), colors.normalizeRGB(20, 20, 80));
    (colors as any).BIG_ENDIAN = endianess;
  });
});
