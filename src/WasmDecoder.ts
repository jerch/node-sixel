/**
 * Copyright (c) 2021 Joerg Breitbart.
 * @license MIT
 */

import { ISixelDecoder, RGBA8888, UintTypedArray } from './Types';
import { DEFAULT_BACKGROUND, PALETTE_VT340_COLOR } from './Colors';
import * as WASM_DATA from './wasm.json';


interface IWasmInternalExports extends Record<string, WebAssembly.ExportValue> {
  memory: WebAssembly.Memory;
  get_chunk_address(): number;
  get_canvas_address(): number;
  get_palette_address(): number;
  get_canvas_limit(): number;
  get_chunk_limit(): number;
  get_palette_limit(): number;
  init(width: number, height: number, fillColor: number, paletteLimit: number): void;
  decode(length: number): void;
}


/* istanbul ignore next */
function decodeBase64(s: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'base64');
  }
  const bytestring = atob(s);
  const result = new Uint8Array(bytestring.length);
  for (let i = 0; i < result.length; ++i) {
    result[i] = bytestring.charCodeAt(i);
  }
  return result;
}


const WASM = {
  CHUNK_SIZE: WASM_DATA.chunkSize,
  CANVAS_SIZE: WASM_DATA.canvasSize,
  PALETTE_SIZE: WASM_DATA.paletteSize,
  BYTES: decodeBase64(WASM_DATA.bytes)
};
const DEFAULT_PALETTE = new Uint32Array(PALETTE_VT340_COLOR);


/**
 * Helper to check, if an image can be decoded with the WASM decoder.
 * The dimension of the data stream can be pulled with `DimensionDecoder` beforehand.
 */
export function canUseWasm(width: number, height: number, paletteLimit: number): boolean {
  if (width > 0 && height > 0
    && width * Math.ceil(height / 6) * 6 <= WASM.CANVAS_SIZE
    && paletteLimit <= WASM.PALETTE_SIZE
  ) {
    return true;
  }
  return false;
}


/**
 * Create a WasmDecoder instance asynchronously.
 * To be used in the browser main thread.
 */
export function WasmDecoderAsync(): Promise<WasmDecoder> {
  return WebAssembly.instantiate(WASM.BYTES).then(inst => new WasmDecoder(inst.instance))
}

/**
 * WasmDecoder - decoder in WebAssembly.
 *
 * This is a fast level 2 decoder, which always truncates pixels at raster width/height.
 * While this behavior is not spec conform, it is what most people want for SIXEL output.
 * Currently it only operates in printer mode, thus color changes get immediately applied.
 *
 * Further restrictions:
 *  - up to max CANVAS_SIZE pixels (default 1536 x 1536)
 *  - up to max PALETTE_SIZE colors (default 4096)
 *
 * A decoder instance is meant to be reused:
 *  - pull image dimensions from `DimensionDecoder`
 *  - call `init` with dimensions to prepare for the new image
 *  - subsequent `decode` calls
 *  - pull pixel data from `data32` (as RGBA32)
 *
 * Note: All typed array buffers exposed are borrowed from the WASM memory,
 * thus you have to copy things over if you want to persist data. Affected:
 *  - palette:  memory view clamped to [0 .. paletteLimit]
 *  - data32:   memory view clamped to [0 .. width * height]
 *
 * Note on WASM: For better performance the WASM code tries to minimize memory interaction,
 * e.g. everything is static memory (alloc free). The canvas memory will only be flushed
 * by a next `init` call up to the given dimensions. This static nature might impose security
 * issues for sensitive image data. To avoid that, either do a manual flush by calling `init`
 * with max CANVAS_SIZE, or throw away the decoder instance.
 * 
 * Note on endianess: WASM operates internally in LE. We set and retrieve colors from RGBA8888
 * 32bit words, which are endianess dependent (ABGR32 vs. RGBA32). But since we only operate
 * on the full 32bit words everywhere, it should not impact anything. Yet this remains
 * uncertain until actually tested.
 */
export class WasmDecoder implements ISixelDecoder {
  private _wasm: IWasmInternalExports;
  private _chunk: Uint8Array;
  private _canvas: Uint32Array;
  private _palette: Uint32Array;
  private _paletteLimit = WASM.PALETTE_SIZE;
  private _data32: Uint32Array | undefined;

  public width = 0;
  public height = 0;

  /**
   * Synchonous ctor. Can be called from nodejs or a webworker context.
   * For instantiation in the browser main thread use `WasmDecoderAsync` instead.
   */
  constructor(private _instance?: WebAssembly.Instance) {
    if (!_instance) {
      this._instance = new WebAssembly.Instance(new WebAssembly.Module(WASM.BYTES));
    }
    this._wasm = this._instance.exports as IWasmInternalExports;
    this._chunk = new Uint8Array(this._wasm.memory.buffer, this._wasm.get_chunk_address(), WASM.CHUNK_SIZE);
    this._canvas = new Uint32Array(this._wasm.memory.buffer, this._wasm.get_canvas_address(), WASM.CANVAS_SIZE);
    this._palette = new Uint32Array(this._wasm.memory.buffer, this._wasm.get_palette_address(), WASM.PALETTE_SIZE);
  }

  /**
   * Prepare for a new image.
   *
   * `width` and `height` can be obtained from `DimensionDecoder`.
   * `fillColor` is a RGBA8888 value, default is black.
   * `palette` may not exceed WASM.PALETTE_SIZE, default is PALETTE_VT340_COLOR.
   * If unset, the palette colors of the previous decoding will be used (initially all zero).
   * `paletteLimit` restricts the used registers further (higher registers are mapped back
   * into valid ones with modulo). Default is WASM.PALETTE_SIZE.
   *
   * The method may throw an error, if the WASM memory restrictions are not met.
   */
  public init(
    width: number,
    height: number,
    fillColor: RGBA8888 = DEFAULT_BACKGROUND,
    palette: Uint32Array = DEFAULT_PALETTE,
    paletteLimit: number = WASM.PALETTE_SIZE
  ): void {
    if (!canUseWasm(width, height, paletteLimit)) {
      this.width = 0;
      this.height = 0;
      throw new Error('cannot use WasmDecoder');
    }
    this._wasm.init(width, height, fillColor, paletteLimit);
    this._paletteLimit = paletteLimit;
    this._data32 = undefined;
    this.width = width;
    this.height = height;
    if (palette) {
      this._palette.set(palette.subarray(0, WASM.PALETTE_SIZE));
    }
  }

  /**
   * Decode next chunk of data from start to end (exclusive).
   */
  public decode(data: UintTypedArray, start: number = 0, end: number = data.length): void {
    let p = start;
    while (p < end) {
      const length = Math.min(end - p, WASM.CHUNK_SIZE);
      this._chunk.set(data.subarray(p, p += length));
      this._wasm.decode(length);
    }
  }

  /**
   * Decode next chunk of string data from start to end (exclusive).
   */
  public decodeString(data: string, start: number = 0, end: number = data.length): void {
    let p = start;
    while (p < end) {
      const length = Math.min(end - p, WASM.CHUNK_SIZE);
      for (let i = 0, j = p; i < length; ++i, ++j) {
        this._chunk[i] = data.charCodeAt(j);
      }
      p += length;
      this._wasm.decode(length);
    }
  }

  /**
   * Get current pixel data as RGBA8888[] (borrowed).
   */
  public get data32(): Uint32Array {
    if (!this._data32) {
      this._data32 = this._canvas.subarray(0, this.width * this.height);
    }
    return this._data32;
  }

  /**
   * Get active palette colors as RGBA8888[] (borrowed).
   */
  public get palette(): Uint32Array {
    return this._palette.subarray(0, this._paletteLimit);
  }

  /**
   * Get the memory used by the wasm instance.
   */
  public get memoryUsage(): number {
    return this._wasm.memory.buffer.byteLength;
  }
}
