/**
 * Copyright (c) 2021 Joerg Breitbart.
 * @license MIT
 */


/**
 * Params storage.
 * Used during parsing to hold up to 6 params of a SIXEL command.
 */
export class Params {
  public length = 1;
  public params = new Uint32Array(6);
  public reset(): void {
    this.params[0] = 0;
    this.length = 1;
  }
  public addParam(): void {
    if (this.length < 6) {
      this.params[this.length++] = 0;
    }
  }
  public addDigit(v: number): void {
    if (this.length < 6) {
      this.params[this.length - 1] = this.params[this.length - 1] * 10 + v;
    }
  }
}
