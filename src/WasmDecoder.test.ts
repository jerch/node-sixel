/**
 * Copyright (c) 2021 Joerg Breitbart.
 * @license MIT
 */

import * as assert from 'assert';
import { toRGBA8888 } from './Colors';
import * as WASM_DATA from './wasm.json';
import { WasmDecoder, WasmDecoderAsync } from './WasmDecoder';
import * as fs from 'fs';

function s2b(s: string): Uint8Array {
  const result = new Uint8Array(s.length);
  for (let i = 0; i < s.length; ++i) {
    result[i] = s.charCodeAt(i);
  }
  return result;
}

describe('WasmDecoder', () => {
  it('should have loaded wasm data', () => {
    assert.strictEqual(WASM_DATA.chunkSize, 4096);
    assert.strictEqual(WASM_DATA.paletteSize, 4096);
    assert.strictEqual(WASM_DATA.canvasSize, 1536 * 1536);
    assert.strictEqual(WASM_DATA.bytes.length !== 0, true);
  });
  it('sync ctor', () => {
    const dec = new WasmDecoder();
    assert.notStrictEqual((dec as any)._instance, undefined);
    assert.strictEqual(dec.palette.length, 4096);
    assert.strictEqual(dec.data32.length, 0);   // uninitialized defaults to 0 x 0
    assert.strictEqual(dec.width, 0);
    assert.strictEqual(dec.height, 0);
  });
  it('async ctor', async () => {
    assert.strictEqual(WasmDecoderAsync() instanceof Promise, true);
    const dec = await WasmDecoderAsync();
    assert.notStrictEqual((dec as any)._instance, undefined);
    assert.strictEqual(dec.palette.length, 4096);
    assert.strictEqual(dec.data32.length, 0);   // uninitialized defaults to 0 x 0
    assert.strictEqual(dec.width, 0);
    assert.strictEqual(dec.height, 0);
  });
  it('memory usage below 10MB', () => {
    const dec = new WasmDecoder();
    assert.strictEqual(dec.memoryUsage < 10 * 1024 * 1024, true);
  });
  it('init correctly sets width/height/palette/canvas', () => {
    const dec = new WasmDecoder();
    dec.init(10, 20, 0xFF00FF00, new Uint32Array([1, 2, 3, 4, 5]), 8);
    assert.strictEqual(dec.width, 10);
    assert.strictEqual(dec.height, 20);
    assert.strictEqual(dec.palette.length, 8);
    assert.deepStrictEqual(dec.palette, new Uint32Array([1, 2, 3, 4, 5, 0, 0, 0]));
    assert.deepStrictEqual(dec.data32, new Uint32Array(10 * 20).fill(0xFF00FF00));
    dec.init(5, 10, 0x00FF00FF, new Uint32Array([7, 8, 9]), 6);
    assert.strictEqual(dec.width, 5);
    assert.strictEqual(dec.height, 10);
    assert.strictEqual(dec.palette.length, 6);
    assert.deepStrictEqual(dec.palette, new Uint32Array([7, 8, 9, 4, 5, 0]));
    assert.deepStrictEqual(dec.data32, new Uint32Array(5 * 10).fill(0x00FF00FF));
  });
  it('init should reject out of bound values', () => {
    const dec = new WasmDecoder();
    assert.throws(() => dec.init(-1, -1), /cannot use WasmDecoder/);
    assert.throws(() => dec.init(2000, 2000), /cannot use WasmDecoder/);
    assert.doesNotThrow(() => dec.init(100, 100, 0, new Uint32Array(10000)));
    assert.throws(() => dec.init(100, 100, 0, new Uint32Array(16), 10000), /cannot use WasmDecoder/);
  });
  describe('decode', () => {
    it('overflow width', () => {
      const dec = new WasmDecoder();
      dec.init(5, 5, 0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('#0??????????'));  // ? - 0 in sixel
      assert.deepStrictEqual(dec.data32, new Uint32Array(25).fill(0));
  
      dec.init(5, 5, 0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('#0@@@@@@@@@@'));  // @ - 1 in sixel
      assert.deepStrictEqual(dec.data32, new Uint32Array(25).fill(0).fill(255, 0, 5));
  
      dec.init(5, 5, 0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('#0AAAAAAAAAA'));  // A - 2 in sixel
      assert.deepStrictEqual(dec.data32, new Uint32Array(25).fill(0).fill(255, 5, 10));
    });
    it('overflow width with repeat', () => {
      const dec = new WasmDecoder();
      dec.init(5, 5, 0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('#0!20?'));  // ? - 0 in sixel
      assert.deepStrictEqual(dec.data32, new Uint32Array(25).fill(0));
  
      dec.init(5, 5, 0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('#0!20@'));  // @ - 1 in sixel
      assert.deepStrictEqual(dec.data32, new Uint32Array(25).fill(0).fill(255, 0, 5));
  
      dec.init(5, 5, 0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('#0!20A'));  // A - 2 in sixel
      assert.deepStrictEqual(dec.data32, new Uint32Array(25).fill(0).fill(255, 5, 10));
    });
    it('overflow height', () => {
      const dec = new WasmDecoder();
      dec.init(10, 6, 0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('-#0@')); // jumps to x=0,y=6: first pixel line behind and multiple of 6
      assert.deepStrictEqual((dec as any)._canvas.subarray(0, 100), new Uint32Array(100).fill(0));

      dec.init(10, 7, 0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('-#0@@@@@')); // jumps to x=0,y=6, should draw in last line
      assert.deepStrictEqual((dec as any)._canvas.subarray(0, 100), new Uint32Array(100).fill(0).fill(255, 60, 65));

      dec.init(10, 7, 0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('-#0!20~')); // jumps to x=0,y=6, this time overdrawing 5 more pixels in height
      assert.deepStrictEqual(
        (dec as any)._canvas.subarray(0, 150),
        new Uint32Array(150).fill(0).fill(255, 60, 60 + 6*10)
      );

      dec.init(10, 7, 0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('-#0!20~$---#0!20~')); // jumps to x=0,y=6, should not draw the second part
      assert.deepStrictEqual(
        (dec as any)._canvas.subarray(0, 150),
        new Uint32Array(150).fill(0).fill(255, 60, 60 + 6*10)
      );
    });
    it('decodeString', () => {
      const dec1 = new WasmDecoder();
      dec1.init(5, 5, 0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec1.decode(s2b('#0AAAAAAAAAA'));
      const dec2 = new WasmDecoder();
      dec2.init(5, 5, 0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec2.decodeString('#0AAAAAAAAAA');
      assert.deepStrictEqual(dec2.data32, dec1.data32);
    });
    it('decodeString - real image', () => {
      const bdata = fs.readFileSync('./testfiles/test1_clean.sixel');
      const sdata = fs.readFileSync('./testfiles/test1_clean.sixel', 'utf-8');
      const dec1 = new WasmDecoder();
      dec1.init(1280, 720, 0, null, 256);
      dec1.decode(bdata);
      const dec2 = new WasmDecoder();
      dec2.init(1280, 720, 0, null, 256);
      dec2.decodeString(sdata);
      assert.deepStrictEqual(dec2.data32, dec1.data32);
      assert.deepStrictEqual(dec2.data32, dec1.data32);
    });
  });
});
