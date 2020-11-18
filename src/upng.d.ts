declare module 'upng' {
  // export function quantize(data: Uint8Array | Uint8ClampedArray, colors: number): any;
  interface IQuantizer {
    getKDtree(data: Uint8Array | Uint8ClampedArray, colors: number): any;
  }
  const quantize: IQuantizer;
}
