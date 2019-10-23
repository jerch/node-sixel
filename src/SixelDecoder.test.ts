/**
 * Copyright (c) 2019 Joerg Breitbart.
 * @license MIT
 */

import { assert } from 'chai';
import { SixelDecoder } from './SixelDecoder';
import { toRGBA8888, normalizeRGB, normalizeHLS } from './Colors';

describe('SixelDecoder', () => {
  let dec: SixelDecoder;
  beforeEach(() => {
    dec = new SixelDecoder();
  });
  describe('empty data', () => {
    it('width/height are 0', () => {
      assert.equal(dec.width, 0);
      assert.equal(dec.height, 0);
    });
    it('toPixelData does not throw or alter target', () => {
      const target = new Uint8ClampedArray(256 * 4);
      target.fill(10);
      assert.doesNotThrow(() => dec.toPixelData(target, 16, 16));
      assert.deepEqual(target, (new Uint8ClampedArray(256 * 4)).fill(10));
    });
  });
  describe('decode parser', () => {
    describe('state transitions', () => {
      it('DATA -> DATA', () => {
        // excluded chars leading to other states
        const except = [33, 34, 35, 161, 162, 163]; // high numbers result from & 0x7F conversion
        const input = new Uint8Array(10);
        for (let i = 0; i < 256; ++i) {
          if (~except.indexOf(i)) continue;
          input[0] = i;
          dec.decode(input, 0, 1);
          assert.equal((dec as any)._currentState, 0);  // 0 == DATA
        }
      });
      it('DATA -> COMPRESSION', () => {
        const input = new Uint8Array(10);
        input[0] = 33;
        dec.decode(input, 0, 1);
        assert.equal((dec as any)._currentState, 1);    // 1 == COMPRESSION
      });
      it('DATA -> ATTR', () => {
        const input = new Uint8Array(10);
        input[0] = 34;
        dec.decode(input, 0, 1);
        assert.equal((dec as any)._currentState, 2);    // 2 == ATTR
      });
      it('DATA -> COLOR', () => {
        const input = new Uint8Array(10);
        input[0] = 35;
        dec.decode(input, 0, 1);
        assert.equal((dec as any)._currentState, 3);    // 3 == COLOR
      });
      it('COMPRESSION -> COMPRESSION', () => {
        (dec as any)._currentState = 1;
        const input = new Uint8Array(10);
        for (let i = 0; i < 256; ++i) {
          if (63 <= i && i <= 126) continue;
          if (191 <= i && i <= 254) continue; // high numbers result from & 0x7F conversion
          input[0] = i;
          dec.decode(input, 0, 1);
          assert.equal((dec as any)._currentState, 1);
        }
      });
      it('COMPRESSION -> DATA', () => {
        (dec as any)._currentState = 1;
        const input = new Uint8Array(10);
        for (let i = 63; i < 127; ++i) {
          input[0] = i;
          dec.decode(input, 0, 1);
          assert.equal((dec as any)._currentState, 0);
          (dec as any)._currentState = 1;
        }
      });
      it('ATTR -> ATTR', () => {
        // excluded chars leading to other states
        const except = [33, 35, 36, 45, 161, 163, 164, 173]; // high numbers result from & 0x7F conversion
        const input = new Uint8Array(10);
        (dec as any)._currentState = 2;
        for (let i = 0; i < 256; ++i) {
          if (~except.indexOf(i)) continue;
          if (63 <= i && i <= 126) continue;
          if (191 <= i && i <= 254) continue; // high numbers result from & 0x7F conversion
          input[0] = i;
          dec.decode(input, 0, 1);
          assert.equal((dec as any)._currentState, 2);
          (dec as any)._currentState = 2;
        }
      });
      it('ATTR -> DATA', () => {
        (dec as any)._currentState = 2;
        const input = new Uint8Array(10);
        for (let i = 63; i < 127; ++i) {
          input[0] = i;
          dec.decode(input, 0, 1);
          assert.equal((dec as any)._currentState, 0);
          (dec as any)._currentState = 2;
        }
        (dec as any)._currentState = 2;
        input[0] = 36;
        dec.decode(input, 0, 1);
        assert.equal((dec as any)._currentState, 0);
        (dec as any)._currentState = 2;
        input[0] = 45;
        dec.decode(input, 0, 1);
        assert.equal((dec as any)._currentState, 0);
      });
      it('ATTR -> COMPRESSION', () => {
        (dec as any)._currentState = 2;
        const input = new Uint8Array(10);
        input[0] = 33;
        dec.decode(input, 0, 1);
        assert.equal((dec as any)._currentState, 1);    // 1 == COMPRESSION
      });
      it('ATTR -> COLOR', () => {
        (dec as any)._currentState = 2;
        const input = new Uint8Array(10);
        input[0] = 35;
        dec.decode(input, 0, 1);
        assert.equal((dec as any)._currentState, 3);    // 3 == COLOR
      });
      it('COLOR -> COLOR', () => {
        // excluded chars leading to other states
        const except = [33, 34, 36, 45, 161, 162, 164, 173]; // high numbers result from & 0x7F conversion
        const input = new Uint8Array(10);
        (dec as any)._currentState = 3;
        for (let i = 0; i < 256; ++i) {
          if (~except.indexOf(i)) continue;
          if (63 <= i && i <= 126) continue;
          if (191 <= i && i <= 254) continue; // high numbers result from & 0x7F conversion
          input[0] = i;
          dec.decode(input, 0, 1);
          assert.equal((dec as any)._currentState, 3);
          (dec as any)._currentState = 3;
        }
      });
      it('COLOR -> DATA', () => {
        (dec as any)._currentState = 3;
        const input = new Uint8Array(10);
        for (let i = 63; i < 127; ++i) {
          input[0] = i;
          dec.decode(input, 0, 1);
          assert.equal((dec as any)._currentState, 0);
          (dec as any)._currentState = 3;
        }
        (dec as any)._currentState = 3;
        input[0] = 36;
        dec.decode(input, 0, 1);
        assert.equal((dec as any)._currentState, 0);
        (dec as any)._currentState = 3;
        input[0] = 45;
        dec.decode(input, 0, 1);
        assert.equal((dec as any)._currentState, 0);
      });
      it('COLOR -> COMPRESSION', () => {
        (dec as any)._currentState = 3;
        const input = new Uint8Array(10);
        input[0] = 33;
        dec.decode(input, 0, 1);
        assert.equal((dec as any)._currentState, 1);    // 1 == COMPRESSION
      });
      it('COLOR -> ATTR', () => {
        (dec as any)._currentState = 3;
        const input = new Uint8Array(10);
        input[0] = 34;
        dec.decode(input, 0, 1);
        assert.equal((dec as any)._currentState, 2);    // 2 == ATTR
      });
    });
    describe('actions', () => {
      it('DRAW', () => {
        const data = '?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
        dec.decodeString(data);
        assert.equal(dec.bands.length, 1);
        assert.equal(dec.bands[0].width, 64);
        const color = dec.palette[0];
        for (let c = 0; c < data.length; ++c) {
          const offset = c * 6;
          const code = data.charCodeAt(c) - 63;
          for (let p = 0; p < 6; ++p) {
            assert.equal(dec.bands[0].data[offset + p], code & (1 << p) ? color : 0);
          }
        }
      });
      it('STORE_PARAM', () => {
        dec.decodeString('#1');
        assert.equal((dec as any)._params.params[0], 1);
        dec.decodeString('2');
        assert.equal((dec as any)._params.params[0], 12);
        dec.decodeString('3');
        assert.equal((dec as any)._params.params[0], 123);
        dec.decodeString('4');
        assert.equal((dec as any)._params.params[0], 1234);
      });
      it('SHIFT_PARAM', () => {
        // shift with ; in ATTR and COLOR
        dec.decodeString('#1');
        assert.equal((dec as any)._params.length, 1);
        assert.equal((dec as any)._params.params[0], 1);
        dec.decodeString(';');
        assert.equal((dec as any)._params.length, 2);
        assert.equal((dec as any)._params.params[0], 1);
        assert.equal((dec as any)._params.params[1], 0);
        dec.decodeString(';12345');
        assert.equal((dec as any)._params.length, 3);
        assert.equal((dec as any)._params.params[0], 1);
        assert.equal((dec as any)._params.params[1], 0);
        assert.equal((dec as any)._params.params[2], 12345);
        // shift with ! in COMPRESSION
        dec.decodeString('!100');
        assert.equal((dec as any)._params.length, 1);
        assert.equal((dec as any)._params.params[0], 100);
        dec.decodeString('!200!300');
        assert.equal((dec as any)._params.length, 3);
        assert.equal((dec as any)._params.params[0], 100);
        assert.equal((dec as any)._params.params[1], 200);
        assert.equal((dec as any)._params.params[2], 300);
      });
      describe('APPLY_PARAM', () => {
        it('ATTR', () => {
          // w'o DRAW
          assert.equal(dec.rasterWidth, 0);
          assert.equal(dec.rasterHeight, 0);
          assert.equal(dec.rasterRatioNumerator, 0);
          assert.equal(dec.rasterRatioDenominator, 0);
          dec.decodeString('"1;2;3;4$');
          assert.equal(dec.rasterWidth, 3);
          assert.equal(dec.rasterHeight, 4);
          assert.equal(dec.rasterRatioNumerator, 1);
          assert.equal(dec.rasterRatioDenominator, 2);
          assert.equal(dec.bands[0].width, 0);
          // with DRAW
          dec.decodeString('"5;6;7;8@');
          assert.equal(dec.rasterWidth, 7);
          assert.equal(dec.rasterHeight, 8);
          assert.equal(dec.rasterRatioNumerator, 5);
          assert.equal(dec.rasterRatioDenominator, 6);
          assert.equal(dec.bands[0].width, 1);
          // should not reapply raster once drawn
          dec.decodeString('"9;10;11;12@');
          assert.equal(dec.rasterWidth, 7);
          assert.equal(dec.rasterHeight, 8);
          assert.equal(dec.rasterRatioNumerator, 5);
          assert.equal(dec.rasterRatioDenominator, 6);
          assert.equal(dec.bands[0].width, 2);
        });
        it('COLOR', () => {
          dec.palette = [toRGBA8888(1, 2, 3), toRGBA8888(4, 5, 6)];
          dec.paletteLimit = 2;
          // slot select
          dec.decodeString('#0$');
          assert.equal((dec as any)._currentColor, toRGBA8888(1, 2, 3));
          dec.decodeString('#1$');
          assert.equal((dec as any)._currentColor, toRGBA8888(4, 5, 6));
          dec.decodeString('#2$');
          assert.equal((dec as any)._currentColor, toRGBA8888(1, 2, 3));
          // color definitions
          // RGB
          dec.decodeString('#1;2;25;50;75$');
          assert.equal(dec.palette[1], normalizeRGB(25, 50, 75));
          assert.equal((dec as any)._currentColor, normalizeRGB(25, 50, 75));
          // HLS
          dec.decodeString('#1;1;25;50;75$');
          assert.equal(dec.palette[1], normalizeHLS(25, 50, 75));
          assert.equal((dec as any)._currentColor, normalizeHLS(25, 50, 75));
          // illegal: Pu = 0
          dec.decodeString('#0;0;25;50;75$');
          assert.equal(dec.palette[1], normalizeHLS(25, 50, 75)); // did not change
          assert.equal((dec as any)._currentColor, toRGBA8888(1, 2, 3)); // slot 0 selected, still old color
          // broken command
          dec.decodeString('#1;4;500;1000;1234$');
          assert.equal(dec.palette[1], normalizeHLS(25, 50, 75)); // no color change
          assert.equal((dec as any)._currentColor, toRGBA8888(1, 2, 3)); // select slot not executed
        });
      });
      it('REPEATED_DRAW', () => {
        let rep = -1;
        dec.bands[0].put = (code, color, repeat) => { rep = repeat; }
        dec.decodeString('!12345@');
        assert.equal(rep, 12345);
        dec.decodeString('!0@');
        assert.equal(rep, 1);
        dec.decodeString('!0!1!2!3!500@');
        assert.equal(rep, 1 + 1 + 2 + 3 + 500);
      });
      it('CR', () => {
        dec.decodeString('!0!1!2!3!500@');
        assert.equal(dec.bands[0].cursor, 1 + 1 + 2 + 3 + 500);
        dec.decodeString('$');
        assert.equal(dec.bands[0].cursor, 0);
      });
      it('LF', () => {
        assert.equal(dec.bands.length, 1);
        dec.decodeString('---');
        assert.equal(dec.bands.length, 4);
      });
    });
  });
});