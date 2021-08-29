/**
 * Copyright (c) 2021 Joerg Breitbart.
 * @license MIT
 */

import * as assert from 'assert';
import { toRGBA8888 } from './Colors';
import { LIMITS } from './wasm';
import { Decoder, DecoderAsync } from './Decoder';
import * as fs from 'fs';

function s2b(s: string): Uint8Array {
  const result = new Uint8Array(s.length);
  for (let i = 0; i < s.length; ++i) {
    result[i] = s.charCodeAt(i);
  }
  return result;
}

describe.skip('WasmDecoder', () => {
  it('should have loaded wasm data', () => {
    assert.strictEqual(LIMITS.CHUNK_SIZE, 16384);
    assert.strictEqual(LIMITS.PALETTE_SIZE, 4096);
    assert.strictEqual(LIMITS.MAX_WIDTH, 16384);
    assert.strictEqual(LIMITS.BYTES.length !== 0, true);
  });
  it('sync ctor', () => {
    const dec = new Decoder();
    assert.notStrictEqual((dec as any)._instance, undefined);
    assert.strictEqual(dec.palette.length, 4096);
    assert.strictEqual(dec.data32.length, 0);   // uninitialized defaults to 0 x 0
    assert.strictEqual(dec.width, 0);
    assert.strictEqual(dec.height, 0);
  });
  it('async ctor', async () => {
    assert.strictEqual(DecoderAsync() instanceof Promise, true);
    const dec = await DecoderAsync();
    assert.notStrictEqual((dec as any)._instance, undefined);
    assert.strictEqual(dec.palette.length, 4096);
    assert.strictEqual(dec.data32.length, 0);   // uninitialized defaults to 0 x 0
    assert.strictEqual(dec.width, 0);
    assert.strictEqual(dec.height, 0);
  });
  it('chunk/pixel addresses should be 128bit aligned', () => {
    const dec = new Decoder();
    assert.strictEqual((dec as any)._wasm.get_chunk_address() % 16, 0);
    assert.strictEqual((dec as any)._wasm.get_p0_address() % 16, 0);
  });
  it('init correctly sets width/height/palette/canvas', () => {
    const dec = new Decoder();
    dec.init(0xFF00FF00, new Uint32Array([1, 2, 3, 4, 5]), 8);
    assert.strictEqual(dec.width, 10);
    assert.strictEqual(dec.height, 20);
    assert.strictEqual(dec.palette.length, 8);
    assert.deepStrictEqual(dec.palette, new Uint32Array([1, 2, 3, 4, 5, 0, 0, 0]));
    assert.deepStrictEqual(dec.data32, new Uint32Array(10 * 20).fill(0xFF00FF00));
    dec.init(0x00FF00FF, new Uint32Array([7, 8, 9]), 6);
    assert.strictEqual(dec.width, 5);
    assert.strictEqual(dec.height, 10);
    assert.strictEqual(dec.palette.length, 6);
    assert.deepStrictEqual(dec.palette, new Uint32Array([7, 8, 9, 4, 5, 0]));
    assert.deepStrictEqual(dec.data32, new Uint32Array(5 * 10).fill(0x00FF00FF));
  });
  //it('init should reject out of bound values', () => {
  //  const dec = new WasmDecoder();
  //  // illegal width / height
  //  assert.throws(() => dec.init(-1, -1), /cannot use WasmDecoder/);
  //  // pixels out of range
  //  assert.throws(() => dec.init(10000, 10000), /cannot use WasmDecoder/);
  //  // palette size out of range
  //  assert.throws(() => dec.init(100, 100, 0, new Uint32Array(16), 10000), /cannot use WasmDecoder/);
  //  // good case
  //  assert.doesNotThrow(() => dec.init(100, 100, 0, new Uint32Array(10000)));
  //});
  describe('decode', () => {
    it('overflow width', () => {
      const dec = new Decoder();
      dec.init(0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('#0??????????'));  // ? - 0 in sixel
      assert.deepStrictEqual(dec.data32, new Uint32Array(25).fill(0));
  
      dec.init(0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('#0@@@@@@@@@@'));  // @ - 1 in sixel
      assert.deepStrictEqual(dec.data32, new Uint32Array(25).fill(0).fill(255, 0, 5));
  
      dec.init(0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('#0AAAAAAAAAA'));  // A - 2 in sixel
      assert.deepStrictEqual(dec.data32, new Uint32Array(25).fill(0).fill(255, 5, 10));
    });
    it('overflow width with repeat', () => {
      const dec = new Decoder();
      dec.init(0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('#0!20?'));  // ? - 0 in sixel
      assert.deepStrictEqual(dec.data32, new Uint32Array(25).fill(0));
  
      dec.init(0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('#0!20@'));  // @ - 1 in sixel
      assert.deepStrictEqual(dec.data32, new Uint32Array(25).fill(0).fill(255, 0, 5));
  
      dec.init(0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('#0!20A'));  // A - 2 in sixel
      assert.deepStrictEqual(dec.data32, new Uint32Array(25).fill(0).fill(255, 5, 10));
    });
    it('overflow height', () => {
      const dec = new Decoder();
      dec.init(0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('-#0@')); // jumps to x=0,y=6: first pixel line behind and multiple of 6
      assert.deepStrictEqual((dec as any)._canvas.subarray(0, 100), new Uint32Array(100).fill(0));

      dec.init(0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('-#0@@@@@')); // jumps to x=0,y=6, should draw in last line
      assert.deepStrictEqual((dec as any)._canvas.subarray(0, 100), new Uint32Array(100).fill(0).fill(255, 60, 65));

      dec.init(0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('-#0!20~')); // jumps to x=0,y=6, this time overdrawing 5 more pixels in height
      assert.deepStrictEqual(
        (dec as any)._canvas.subarray(0, 150),
        new Uint32Array(150).fill(0).fill(255, 60, 60 + 6*10)
      );

      dec.init(0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec.decode(s2b('-#0!20~$---#0!20~')); // jumps to x=0,y=6, should not draw the second part
      assert.deepStrictEqual(
        (dec as any)._canvas.subarray(0, 150),
        new Uint32Array(150).fill(0).fill(255, 60, 60 + 6*10)
      );
    });
    it('decodeString', () => {
      const dec1 = new Decoder();
      dec1.init(0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec1.decode(s2b('#0AAAAAAAAAA'));
      const dec2 = new Decoder();
      dec2.init(0, new Uint32Array([toRGBA8888(255, 0, 0, 0)]), 1);
      dec2.decodeString('#0AAAAAAAAAA');
      assert.deepStrictEqual(dec2.data32, dec1.data32);
    });
    it('decodeString - real image', () => {
      const bdata = fs.readFileSync('./testfiles/test1_clean.sixel');
      const sdata = fs.readFileSync('./testfiles/test1_clean.sixel', 'utf-8');
      const dec1 = new Decoder();
      dec1.init(0, null, 256);
      dec1.decode(bdata);
      const dec2 = new Decoder();
      dec2.init(0, null, 256);
      dec2.decodeString(sdata);
      assert.deepStrictEqual(dec2.data32, dec1.data32);
      assert.deepStrictEqual(dec2.data32, dec1.data32);
    });
  });
});
