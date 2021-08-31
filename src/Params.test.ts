/**
 * Copyright (c) 2021 Joerg Breitbart.
 * @license MIT
 */
import * as assert from 'assert';
import { Params } from './Params';

describe('Params', () => {
  it('should not overflow', () => {
    const p = new Params();
    assert.strictEqual(p.length, 1);
    assert.strictEqual(p.params[0], 0);
    p.addDigit(1);
    p.addDigit(2);
    p.addParam();
    p.addDigit(3);
    p.addDigit(4);
    p.addParam();
    p.addDigit(5);
    p.addDigit(6);
    p.addParam();
    p.addDigit(7);
    p.addDigit(8);
    p.addParam();
    p.addDigit(9);
    p.addDigit(9);
    p.addParam();
    p.addDigit(1);
    p.addDigit(1);
    p.addParam();
    assert.strictEqual(p.length, 6);
    assert.deepStrictEqual(p.params, new Uint32Array([12, 34, 56, 78, 99, 0]));
  });
});
