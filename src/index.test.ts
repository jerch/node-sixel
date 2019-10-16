import { assert } from 'chai';
import { SixelImage, fromRGBA8888, toRGBA8888, RGBA8888 } from './index';

const BIG_ENDIAN = new Uint8Array(new Uint32Array([0xFF000000]).buffer)[0] === 0xFF;

describe('RGBA8888 native colors', () => {
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
      assert.deepEqual(fromRGBA8888(0x1234567890), BIG_ENDIAN ? [0x12, 0x34, 0x56, 0x78] : [0x90, 0x78, 0x56, 0x34])
    });
  });
})

class ChunkWriter {
  public pos = 0;
  constructor(public target: Uint8Array) {}
  public write(chunk: Uint8Array): number {
    this.target.set(chunk, this.pos);
    this.pos += chunk.length;
    return this.pos;
  }
}

describe('SixelImage', () => {
  let img: SixelImage;
  beforeEach(() => {
    img = new SixelImage();
  });
  describe('empty data', () => {
    it('width/height are 0', () => {
      assert.equal(img.width, 0);
      assert.equal(img.height, 0);
    });
    it('toSixel methods should not produce any data', () => {
      assert.doesNotThrow(() => img.toSixelBytes(c => { throw Error('should not have been called'); }));
      assert.equal(img.toSixelString(), '');
    });
    it('toImageData does not throw or alter target', () => {
      const target = new Uint8ClampedArray(256 * 4);
      target.fill(10);
      assert.doesNotThrow(() => img.toImageData(target, 16, 16));
      assert.deepEqual(target, (new Uint8ClampedArray(256 * 4)).fill(10));
    });
  });
  describe('decode parser', () => {
    describe('state transitions', () => {
      it('DATA -> DATA', () => {
        // excluded chars leading to other states
        const except = [33, 34, 35];
        const input = new Uint8Array(10);
        for (let i = 0; i < 256; ++i) {
          if (~except.indexOf(i)) continue;
          input[0] = i;
          img.write(input, 0, 1);
          assert.equal((img as any)._currentState, 0);  // 0 == DATA
        }
      });
      it('DATA -> COMPRESSION', () => {
        const input = new Uint8Array(10);
        input[0] = 33;
        img.write(input, 0, 1);
        assert.equal((img as any)._currentState, 1);    // 1 == COMPRESSION
      });
      it('DATA -> ATTR', () => {
        const input = new Uint8Array(10);
        input[0] = 34;
        img.write(input, 0, 1);
        assert.equal((img as any)._currentState, 2);    // 2 == ATTR
      });
      it('DATA -> COLOR', () => {
        const input = new Uint8Array(10);
        input[0] = 35;
        img.write(input, 0, 1);
        assert.equal((img as any)._currentState, 3);    // 3 == COLOR
      });
      it('COMPRESSION -> COMPRESSION', () => {
        (img as any)._currentState = 1;
        const input = new Uint8Array(10);
        for (let i = 0; i < 256; ++i) {
          if (63 <= i && i <= 126) continue;
          input[0] = i;
          img.write(input, 0, 1);
          assert.equal((img as any)._currentState, 1);
        }
      });
      it('COMPRESSION -> DATA', () => {
        (img as any)._currentState = 1;
        const input = new Uint8Array(10);
        for (let i = 63; i < 127; ++i) {
          input[0] = i;
          img.write(input, 0, 1);
          assert.equal((img as any)._currentState, 0);
          (img as any)._currentState = 1;
        }
      });
      it('ATTR -> ATTR', () => {
        // excluded chars leading to other states
        const except = [33, 35, 36, 45];
        const input = new Uint8Array(10);
        (img as any)._currentState = 2;
        for (let i = 0; i < 256; ++i) {
          if (~except.indexOf(i)) continue;
          if (63 <= i && i <= 126) continue;
          input[0] = i;
          img.write(input, 0, 1);
          assert.equal((img as any)._currentState, 2);
          (img as any)._currentState = 2;
        }
      });
      it('ATTR -> DATA', () => {
        (img as any)._currentState = 2;
        const input = new Uint8Array(10);
        for (let i = 63; i < 127; ++i) {
          input[0] = i;
          img.write(input, 0, 1);
          assert.equal((img as any)._currentState, 0);
          (img as any)._currentState = 2;
        }
        (img as any)._currentState = 2;
        input[0] = 36;
        img.write(input, 0, 1);
        assert.equal((img as any)._currentState, 0);
        (img as any)._currentState = 2;
        input[0] = 45;
        img.write(input, 0, 1);
        assert.equal((img as any)._currentState, 0);
      });
      it('ATTR -> COMPRESSION', () => {
        (img as any)._currentState = 2;
        const input = new Uint8Array(10);
        input[0] = 33;
        img.write(input, 0, 1);
        assert.equal((img as any)._currentState, 1);    // 1 == COMPRESSION
      });
      it('ATTR -> COLOR', () => {
        (img as any)._currentState = 2;
        const input = new Uint8Array(10);
        input[0] = 35;
        img.write(input, 0, 1);
        assert.equal((img as any)._currentState, 3);    // 3 == COLOR
      });
      it('COLOR -> COLOR', () => {
        // excluded chars leading to other states
        const except = [33, 34, 36, 45];
        const input = new Uint8Array(10);
        (img as any)._currentState = 3;
        for (let i = 0; i < 256; ++i) {
          if (~except.indexOf(i)) continue;
          if (63 <= i && i <= 126) continue;
          input[0] = i;
          img.write(input, 0, 1);
          assert.equal((img as any)._currentState, 3);
          (img as any)._currentState = 3;
        }
      });
      it('COLOR -> DATA', () => {
        (img as any)._currentState = 3;
        const input = new Uint8Array(10);
        for (let i = 63; i < 127; ++i) {
          input[0] = i;
          img.write(input, 0, 1);
          assert.equal((img as any)._currentState, 0);
          (img as any)._currentState = 3;
        }
        (img as any)._currentState = 3;
        input[0] = 36;
        img.write(input, 0, 1);
        assert.equal((img as any)._currentState, 0);
        (img as any)._currentState = 3;
        input[0] = 45;
        img.write(input, 0, 1);
        assert.equal((img as any)._currentState, 0);
      });
      it('COLOR -> COMPRESSION', () => {
        (img as any)._currentState = 3;
        const input = new Uint8Array(10);
        input[0] = 33;
        img.write(input, 0, 1);
        assert.equal((img as any)._currentState, 1);    // 1 == COMPRESSION
      });
      it('COLOR -> ATTR', () => {
        (img as any)._currentState = 3;
        const input = new Uint8Array(10);
        input[0] = 34;
        img.write(input, 0, 1);
        assert.equal((img as any)._currentState, 2);    // 2 == ATTR
      });
    });
  });
  describe('encode - decode', () => {
    let source32: Uint32Array;
    let source8: Uint8ClampedArray;
    let target32: Uint32Array;
    let target8: Uint8ClampedArray;
    let sixels: Uint8Array;
    let writer: ChunkWriter;
    beforeEach(() => {
      // test with max 100x100 pixel data
      source32 = new Uint32Array(100 * 100);
      source8 = new Uint8ClampedArray(source32.buffer);
      target32 = new Uint32Array(100 * 100);
      target8 = new Uint8ClampedArray(target32.buffer);
      sixels = new Uint8Array(1000000); // hard to precalc
      writer = new ChunkWriter(sixels);
    });
    it('10x1 black', () => {
      // prepare data
      for (let i = 0; i < 10; ++i) source32[i] = toRGBA8888(0, 0, 0);
      // encode
      const imgEnc = SixelImage.fromImageData(source8.subarray(0, 10 * 4), 10, 1, [toRGBA8888(0, 0, 0)]);
      imgEnc.toSixelBytes(chunk => writer.write(chunk));
      // decode
      const imgDec = new SixelImage(0);
      imgDec.write(sixels, 0, writer.pos);
      imgDec.toImageData(target8.subarray(0, 10 * 4), 10, 1);
      // compare
      assert.equal(imgEnc.toSixelString(), imgDec.toSixelString());
      assert.deepEqual(target8, source8);
      assert.equal(imgEnc.width, 10);
      assert.equal(imgEnc.height, 1);
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
      const imgEnc = SixelImage.fromImageData(source8.subarray(0, 8 * 4), 8, 1, palette);
      imgEnc.toSixelBytes(chunk => writer.write(chunk));
      // decode
      const imgDec = new SixelImage(0);
      imgDec.write(sixels, 0, writer.pos);
      imgDec.toImageData(target8.subarray(0, 8 * 4), 8, 1);
      // compare
      assert.equal(imgEnc.toSixelString(), imgDec.toSixelString());
      assert.deepEqual(target8, source8);
      assert.equal(imgEnc.width, 8);
      assert.equal(imgEnc.height, 1);
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
      const imgEnc = SixelImage.fromImageData(source8, 100, 100, palette);
      imgEnc.toSixelBytes(chunk => writer.write(chunk));
      // decode
      const imgDec = new SixelImage(0);
      imgDec.write(sixels, 0, writer.pos);
      imgDec.toImageData(target8, 100, 100);
      // compare
      assert.equal(imgEnc.toSixelString(), imgDec.toSixelString());
      assert.deepEqual(target8, source8);
      assert.equal(imgEnc.width, 100);
      assert.equal(imgEnc.height, 100);
      assert.equal(imgDec.width, 100);
      assert.equal(imgDec.height, 100);
    });
  });
});
