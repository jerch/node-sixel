/**
 * Copyright (c) 2019 Joerg Breitbart.
 * @license MIT
 */

import { assert } from 'chai';
import { SixelDecoder, toRGBA8888, sixelEncode } from './index';
import { RGBA8888 } from './Types';


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
  });
  describe('encode - decode', () => {
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
      assert.deepEqual(target8, source8);
      assert.equal(imgDec.width, 10);
      assert.equal(imgDec.height, 1);
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
      assert.deepEqual(target8, source8);
      assert.equal(imgDec.width, 8);
      assert.equal(imgDec.height, 1);
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
      const imgDec = new SixelDecoder(0);
      imgDec.decodeString(sixels);
      imgDec.toPixelData(target8, 100, 100);
      // compare
      assert.deepEqual(target8, source8);
      assert.equal(imgDec.width, 100);
      assert.equal(imgDec.height, 100);
    });
  });
});
