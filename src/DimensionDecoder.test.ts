/**
 * Copyright (c) 2021 Joerg Breitbart.
 * @license MIT
 */
import * as assert from 'assert';
import { DimensionDecoder } from './DimensionDecoder';

function s2b(s: string): Uint8Array {
  const result = new Uint8Array(s.length);
  for (let i = 0; i < s.length; ++i) {
    result[i] = s.charCodeAt(i);
  }
  return result;
}

function grab2<T extends (string | Uint8Array)>(data: T): T[] {
  const result: T[] = [];
  let p = 0;
  while (p < data.length) {
    result.push((data as any).slice(p, p + 2));
    p += 2;
  }
  return result;
}


describe('DimensionDecoder', () => {
  it('decode - l2', () => {
    const dimDec = new DimensionDecoder();
    assert.deepStrictEqual(
      dimDec.decode(s2b('"1;2;640;480--')),
      { numerator: 1, denominator: 2, width: 640, height: 480, index: 12, level: 2 }
    );
    dimDec.reset();
    assert.deepStrictEqual(
      dimDec.decode(s2b('        "1;2;640;480#0~~')),
      { numerator: 1, denominator: 2, width: 640, height: 480, index: 20, level: 2 }
    );
    dimDec.reset();
    for (const [i, chunk] of grab2(s2b('"1;2;640;480--')).entries()) {
      const dim = dimDec.decode(chunk);
      if (dim) {
        assert.deepStrictEqual(dim, { numerator: 1, denominator: 2, width: 640, height: 480, index: 0, level: 2 });
        assert.strictEqual(i, 6);
        break;
      }
    }
    dimDec.reset();
    for (const [i, chunk] of grab2(s2b('        "1;2;640;480#0~~')).entries()) {
      const dim = dimDec.decode(chunk);
      if (dim) {
        assert.deepStrictEqual(dim, { numerator: 1, denominator: 2, width: 640, height: 480, index: 0, level: 2 });
        assert.strictEqual(i, 10);
        break;
      }
    }
  });
  it('decode - l1', () => {
    const dimDec = new DimensionDecoder();
    assert.deepStrictEqual(
      dimDec.decode(s2b('$--#0~~~')),
      { numerator: -1, denominator: -1, width: -1, height: -1, index: 0, level: 1 }
    );
    dimDec.reset();
    assert.deepStrictEqual(
      dimDec.decode(s2b('        ~~~~')),
      { numerator: -1, denominator: -1, width: -1, height: -1, index: 8, level: 1 }
    );
  });
  it('decodeString - l2', () => {
    const dimDec = new DimensionDecoder();
    assert.deepStrictEqual(
      dimDec.decodeString('"1;2;640;480--'),
      { numerator: 1, denominator: 2, width: 640, height: 480, index: 12, level: 2 }
    );
    dimDec.reset();
    assert.deepStrictEqual(
      dimDec.decodeString('        "1;2;640;480#0~~'),
      { numerator: 1, denominator: 2, width: 640, height: 480, index: 20, level: 2 }
    );
    dimDec.reset();
    for (const [i, chunk] of grab2('"1;2;640;480--').entries()) {
      const dim = dimDec.decodeString(chunk);
      if (dim) {
        assert.deepStrictEqual(dim, { numerator: 1, denominator: 2, width: 640, height: 480, index: 0, level: 2 });
        assert.strictEqual(i, 6);
        break;
      }
    }
    dimDec.reset();
    for (const [i, chunk] of grab2('        "1;2;640;480#0~~').entries()) {
      const dim = dimDec.decodeString(chunk);
      if (dim) {
        assert.deepStrictEqual(dim, { numerator: 1, denominator: 2, width: 640, height: 480, index: 0, level: 2 });
        assert.strictEqual(i, 10);
        break;
      }
    }
  });
  it('decodeString - l1', () => {
    const dimDec = new DimensionDecoder();
    assert.deepStrictEqual(
      dimDec.decodeString('$--#0~~~'),
      { numerator: -1, denominator: -1, width: -1, height: -1, index: 0, level: 1 }
    );
    dimDec.reset();
    assert.deepStrictEqual(
      dimDec.decodeString('        ~~~~'),
      { numerator: -1, denominator: -1, width: -1, height: -1, index: 8, level: 1 }
    );
  });
  it('coverage', () => {
    const dimDec = new DimensionDecoder();
    assert.deepStrictEqual(
      dimDec.decodeString('"1;1~~~'),
      { numerator: -1, denominator: -1, width: -1, height: -1, index: 4, level: 1 }
    );
  });
});
