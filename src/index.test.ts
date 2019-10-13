import { assert } from 'chai';
import { SixelImage, fromRGBA8888, toRGBA8888 } from './index';

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
});
