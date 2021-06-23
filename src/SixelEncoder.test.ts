/**
 * Copyright (c) 2019 Joerg Breitbart.
 * @license MIT
 */

import * as assert from 'assert';
import { introducer, FINALIZER, sixelEncode } from './SixelEncoder';
import { SixelDecoder } from './SixelDecoder';
import { normalizeRGB, toRGBA8888 } from './Colors';
import { RGBA8888 } from './Types';

describe('encoding', () => {
  it('DCS introducer supports P2', () => {
    /**
     * DEC STD 070 - 1st should set to 0
     * Note:
     * - we only support P2
     * - no 8 bit DCS support, only 7 bit notation
     */
    assert.strictEqual(introducer(), '\x1bP0;0;q');
    assert.strictEqual(introducer(0), '\x1bP0;0;q');
    assert.strictEqual(introducer(1), '\x1bP0;1;q');
    assert.strictEqual(introducer(2), '\x1bP0;2;q');
  });
  it('FINALIZER 7bit ST', () => {
    assert.strictEqual(FINALIZER, '\x1b\\');
  });
  describe('sixelEncode', () => {
    it('empty data, width/height of 0', () => {
      let sixels = '';
      assert.doesNotThrow(() => { sixels = sixelEncode(new Uint8Array(0), 1, 1, [0]); });
      assert.strictEqual(sixels, '');
      assert.doesNotThrow(() => { sixels = sixelEncode(new Uint8Array(25), 0, 1, [0]); });
      assert.strictEqual(sixels, '');
      assert.doesNotThrow(() => { sixels = sixelEncode(new Uint8Array(25), 1, 0, [0]); });
      assert.strictEqual(sixels, '');
    });
    it('wrong geometry should throw', () => {
      assert.throws(() => { sixelEncode(new Uint8Array(8), 1, 1, [0]); }, /wrong geometry of data/);
    });
    it('empty palette should throw', () => {
      assert.throws(() => { sixelEncode(new Uint8Array(4), 1, 1, []); }, /palette must not be empty/);
    });
    describe('palette handling', () => {
      function getPalFromSixel(sixels: string): RGBA8888[] {
        const pal: RGBA8888[] = [];
        sixels.split('#')
          .map(el => el.split(';'))
          .filter(el => el.length === 5)
          .forEach(e => { pal[~~e[0]] = normalizeRGB(~~e[2], ~~e[3], ~~e[4]); });
        return pal;
      }
      it('accepts [r, g, b] and RGBA8888 as palette entries', () => {
        const data = new Uint8Array(8);
        data.fill(255);
        const sixels = sixelEncode(data, 2, 1, [[12, 34, 56], [98, 76, 54]]);
        const sixels2 = sixelEncode(data, 2, 1, [toRGBA8888(12, 34, 56), toRGBA8888(98, 76, 54)]);
        // compare with values read by decoder
        const dec = new SixelDecoder(0, []);
        dec.decodeString(sixels);
        assert.deepStrictEqual(getPalFromSixel(sixels), dec.palette);
        assert.deepStrictEqual(getPalFromSixel(sixels2), dec.palette);
        assert.strictEqual(getPalFromSixel(sixels).length, 2);
      });
      it('should filter alpha=0 and doubles from palette', () => {
        const data = new Uint8Array(8);
        data.fill(255);
        const sixels = sixelEncode(data, 2, 1, [[12, 34, 56], [98, 76, 54]]);
        const sixels2 = sixelEncode(data, 2, 1, [
          toRGBA8888(55, 66, 77, 0),
          toRGBA8888(12, 34, 56),
          toRGBA8888(55, 66, 88, 0),
          toRGBA8888(98, 76, 54),
          toRGBA8888(12, 34, 56)
        ]);
        // compare with values read by decoder
        const dec = new SixelDecoder(0, []);
        dec.decodeString(sixels);
        assert.deepStrictEqual(getPalFromSixel(sixels), dec.palette);
        assert.deepStrictEqual(getPalFromSixel(sixels2), dec.palette);
        assert.strictEqual(getPalFromSixel(sixels).length, 2);
      });
    });
    it('skip raster attributes in output', () => {
      const data = new Uint8Array(8);
      data.fill(255);
      // default - contains raster attributes
      const sixels = sixelEncode(data, 2, 1, [[12, 34, 56], [98, 76, 54]]);
      assert.strictEqual(sixels.indexOf('"1;1;2;1'), 0);
      const sixels2 = sixelEncode(data, 2, 1, [[12, 34, 56], [98, 76, 54]], false);
      assert.strictEqual(sixels2.indexOf('"1;1;2;1'), -1);
      assert.strictEqual(sixels2, sixels.slice(8));
    });
  });
  describe('encoding tests', () => {
    it('5 repeating pixels', () => {
      const data = new Uint8Array(20);
      data.fill(255);
      const sixels = sixelEncode(data, 5, 1, [[0, 0, 0], [255, 255, 255]]);
      // "#1" color slot[1], "!5" repeat 5, "@" 1st bit set
      assert.strictEqual(sixels.indexOf('#1!5@') !== -1, true);
    });
    it('4 repeating pixels', () => {
      const data = new Uint8Array(20);
      data.fill(255);
      // set first pixel to 0
      data[0] = 0; data[1] = 0; data[2] = 0;
      const sixels = sixelEncode(data, 5, 1, [[0, 0, 0], [255, 255, 255]]);
      // "#0" color slot[0], "@" 1st bit set, "$" CR
      // "#1" color slot[1], "?" 0 bit set, "!4" repeat 4, "@" 1st bit set, "$" CR
      assert.strictEqual(sixels.indexOf('#0@$#1?!4@$') !== -1, true);
    });
    it('3 repeating pixels', () => {
      const data = new Uint8Array(20);
      data.fill(255);
      data[0] = 0; data[1] = 0; data[2] = 0;
      data[4] = 0; data[5] = 0; data[6] = 0;
      const sixels = sixelEncode(data, 5, 1, [[0, 0, 0], [255, 255, 255]]);
      // "#0" color slot[0], "@@" 1st bit set, "$" CR
      // "#1" color slot[1], "?" 0 bit set, "@@@" 1st bit set, "$" CR
      // ==> ! length encoding for >3
      assert.strictEqual(sixels.indexOf('#0@@$#1??@@@$') !== -1, true);
    });
    it('background pixel skipped', () => {
      const data = new Uint8Array(20);
      data.fill(255);
      data[0] = 0; data[1] = 0; data[2] = 0;
      data[4] = 0; data[5] = 0; data[6] = 0; data[7] = 0; // alpha 0 sets pixel transparent
      const sixels = sixelEncode(data, 5, 1, [[0, 0, 0], [255, 255, 255]]);
      // "#0@$"     color[0] one pixel + CR
      // "#1??@@@$" color[1] skip 2 pixels + color 3 pixels + CR
      assert.strictEqual(sixels.indexOf('#0@$#1??@@@$') !== -1, true);
    });
  });
});
