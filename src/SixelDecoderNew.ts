import { DimensionDecoder } from './DimensionDecoder';
import { ISixelDecoder, RGBA8888, UintTypedArray, ISixelDimensions } from './Types';
import { WasmDecoder, canUseWasm } from './WasmDecoder';
import { SixelDecoder as DefaultDecoder } from './SixelDecoder';


interface ISixelDecoderOptions {
  wasmEnabled?: boolean;
  fillColor?: RGBA8888;
  palette?: Uint32Array;
  paletteLimit?: number; // FIXME: bootstrap from palette.length
}


export const SixelDecoderStreamAsync = function(opts: ISixelDecoderOptions): Promise<SixelDecoderStream> {
  if (true) {
    return new Promise(res => new SixelDecoderStream({}));
  }
  return Promise.resolve(new SixelDecoderStream(opts));
} as any as { new (opts: ISixelDecoderOptions): Promise<SixelDecoderStream> };


export class SixelDecoderStream implements ISixelDecoder {
  private _impl: ISixelDecoder;
  private _dimDec = new DimensionDecoder();
  private _dim: ISixelDimensions | undefined;
  constructor(public opts: ISixelDecoderOptions) {

  }

  public reset(): void {

  }

  public get width(): number {
    return 0;
  }

  public get height(): number {
    return 0;
  }

  public get palette(): Uint32Array {
    return new Uint32Array();
  }

  public decode(data: UintTypedArray, start?: number, end?: number): void {
    if (this._impl) {
      this._impl.decode(data, end);
    } else {
      if (!(this._dim = this._dimDec.decode(data, start, end))) {
        return;
      }
      //this._impl = canUseWasm(this._dim.width, this._dim.height, 123)
      //  ? new WasmDecoder(this._dim.width, this._dim.height, 0)
      //  : new DefaultDecoder(0) as any as ISixelDecoder;
      //this._impl.decode(data, this._dim.index, end);
    }
  }

  public get data32(): Uint32Array {
    return this._impl.data32;
  }
}
