interface IQuantizer {
  getKDtree(data: Uint8Array | Uint8ClampedArray, colors: number): any;
}

export const quantize: IQuantizer = require('../upng').quantize;
