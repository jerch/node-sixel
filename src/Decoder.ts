/**
 * Copyright (c) 2021 Joerg Breitbart.
 * @license MIT
 */

import { IDecodeResult, InstanceLike, IDecoderOptions, IDecoderOptionsInternal, IWasmDecoderExports, RGBA8888, UintTypedArray } from './Types';
import { DEFAULT_BACKGROUND, DEFAULT_FOREGROUND, PALETTE_VT340_COLOR } from './Colors';
import { LIMITS } from './wasm';


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

const WASM_BYTES = decodeBase64(LIMITS.BYTES);
let WASM_MODULE: WebAssembly.Module | undefined;

// FIXME: change in Color.ts
const DEFAULT_PALETTE = new Uint32Array(PALETTE_VT340_COLOR);


const NULL_CANVAS = new Uint32Array();

const enum ParseMode {
  M0 = 0,   // image processing mode still undecided
  M1 = 1,   // level 1 image or level 2 + truncate=false
  M2 = 2    // level 2 + truncate=true
}


// proxy for lazy binding of decoder methods to wasm env callbacks
class CallbackProxy {
  public bandHandler = (width: number) => 1;
  public modeHandler = (mode: ParseMode) => 1;
  public handle_band(width: number): number {
    return this.bandHandler(width);
  }
  public mode_parsed(mode: number): number {
    return this.modeHandler(mode);
  }
}


// default decoder options
const DEFAULT_OPTIONS: IDecoderOptionsInternal = {
  memoryLimit: 2048 * 65536,
  sixelColor: DEFAULT_FOREGROUND,
  fillColor: DEFAULT_BACKGROUND,
  palette: DEFAULT_PALETTE,
  paletteLimit: LIMITS.PALETTE_SIZE,
  truncate: true
};


/**
 * Create a decoder instance asynchronously.
 * To be used in the browser main thread.
 */
export function DecoderAsync(opts?: IDecoderOptions): Promise<Decoder> {
  const cbProxy = new CallbackProxy();
  const importObj: any = {
    env: {
      handle_band: cbProxy.handle_band.bind(cbProxy),
      mode_parsed: cbProxy.mode_parsed.bind(cbProxy)
    }
  };
  return WebAssembly.instantiate(WASM_MODULE || WASM_BYTES, importObj)
    .then((inst: InstanceLike) => {
      WASM_MODULE = WASM_MODULE || inst.module;
      return new Decoder(opts, inst.instance || inst, cbProxy)
    });
}


/**
 * Decoder - web assembly based sixel stream decoder.
 *
 * Usage pattern:
 *  - call `init` to initialize decoder for new image
 *  - feed data chunks to `decode` or `decodeString`
 *  - grab pixels from `data32`
 *  - optional: call `release` to free memory (e.g. after big images)
 *  - start over with next image by calling `init`
 *
 * Properties:
 *  - max width of 2^14 - 4 pixels (compile time setting in wasm)
 *  - no explicit height limit (only limited by memory)
 *  - max 4096 colors palette (compile time setting in wasm)
 *
 * Explanation operation modes:
 * - M1   Mode chosen for level 1 images (no raster attributes),
 *        or for level 2 images with `truncate=false`.
 * - M2   Mode chosen for level 2 images with `truncate=true` (default).
 *        While this mode is not fully spec conform (decoder not expected to truncate),
 *        it is what spec conform encoders should create (should not excess raster).
 *        This mode has several advantages:
 *        - ~15% faster decoding speed
 *        - image dimensions can be evaluated early without processing the whole data
 *        - faster pixel access in `data32` (precalulated)
 *        - image height is not reported as multiple of 6 pixels
 * - M0   Undecided mode state after `init`.
 * The level of an image is determined during early decoding based on the fact,
 * whether the data contains valid raster attributes before any sixel data.
 * Until then the mode of an image is marked as M0, meaning the real operation mode
 * could not be decided yet.
 */
export class Decoder {
  private _opts: IDecoderOptionsInternal;
  private _instance: WebAssembly.Instance;
  private _wasm: IWasmDecoderExports;
  private _states: Uint32Array;
  private _chunk: Uint8Array;
  private _palette: Uint32Array;
  private _PIXEL_OFFSET = LIMITS.MAX_WIDTH + 4;
  private _pSrc: Uint32Array;
  private _canvas: Uint32Array = NULL_CANVAS;
  private _bandWidths: number[] = [];
  private _maxWidth = 0;
  private _minWidth = LIMITS.MAX_WIDTH;
  private _lastOffset = 0;
  private _currentHeight = 0;

  // some readonly parser states for internal usage
  private get _fillColor(): RGBA8888 { return this._states[0]; }
  private get _truncate(): number { return this._states[8]; }
  private get _rasterWidth(): number { return this._states[6]; }
  private get _rasterHeight(): number { return this._states[7]; }
  private get _width(): number { return this._states[2] ? this._states[2] - 4 : 0; }
  private get _height(): number { return this._states[3]; }
  private get _level(): number { return this._states[9]; }
  private get _mode(): ParseMode { return this._states[10]; }
  private get _paletteLimit(): number { return this._states[11]; }

  private _initCanvas(mode: ParseMode): number {
    if (mode == ParseMode.M2) {
      const pixels = this.width * this.height;
      if (pixels > this._canvas.length) {
        if (this._opts.memoryLimit && pixels * 4 > this._opts.memoryLimit) {
          this.release();
          throw new Error('image exceeds memory limit');
        }
        this._canvas = new Uint32Array(pixels);
      }
      this._maxWidth = this._width;
    } else if (mode == ParseMode.M1) {
      if (this._level == 2) {
        // got raster attributes, use them as initial size hint
        const pixels = Math.min(this._rasterWidth, LIMITS.MAX_WIDTH) * this._rasterHeight;
        if (pixels > this._canvas.length) {
          if (this._opts.memoryLimit && pixels * 4 > this._opts.memoryLimit) {
            this.release();
            throw new Error('image exceeds memory limit');
          }
          this._canvas = new Uint32Array(pixels);
        }
      } else {
        // else fallback to generic resizing, starting with 256*256 pixels
        if (this._canvas.length < 65536) {
          this._canvas = new Uint32Array(65536);
        }
      }
    }
    return 0; // 0 - continue, 1 - abort right away
  }

  private _realloc(offset: number, additionalPixels: number): void {
    const pixels = offset + additionalPixels;
    if (pixels > this._canvas.length) {
      if (this._opts.memoryLimit && pixels * 4 > this._opts.memoryLimit) {
        this.release();
        throw new Error('image exceeds memory limit');
      }
      // extend in 65536 pixel blocks
      const newCanvas = new Uint32Array(Math.ceil(pixels / 65536) * 65536);
      newCanvas.set(this._canvas);
      this._canvas = newCanvas;
    }
  }

  private _handle_band(width: number): number {
    const adv = this._PIXEL_OFFSET;
    let offset = this._lastOffset;
    if (this._mode == ParseMode.M2) {
      let remaining = this.height - this._currentHeight;
      let c = 0;
      while (c < 6 && remaining > 0) {
        this._canvas.set(this._pSrc.subarray(adv * c, adv * c + width), offset + width * c);
        c++;
        remaining--;
      }
      this._lastOffset += width * c;
      this._currentHeight += c;
    } else if (this._mode == ParseMode.M1) {
      this._realloc(offset, width * 6);
      this._maxWidth = Math.max(this._maxWidth, width);
      this._minWidth = Math.min(this._minWidth, width);
      for (let i = 0; i < 6; ++i) {
        this._canvas.set(this._pSrc.subarray(adv * i, adv * i + width), offset + width * i);
      }
      this._bandWidths.push(width);
      this._lastOffset += width * 6;
      this._currentHeight += 6;
    }
    return 0; // 0 - continue, 1 - abort right away
  }

  /**
   * Synchonous ctor. Can be called from nodejs or a webworker context.
   * For instantiation in the browser main thread use `WasmDecoderAsync` instead.
   */
  constructor(
    opts?: IDecoderOptions,
    _instance?: WebAssembly.Instance,
    _cbProxy?: CallbackProxy
  ) {
    this._opts = Object.assign({}, DEFAULT_OPTIONS, opts);
    if (this._opts.paletteLimit > LIMITS.PALETTE_SIZE) {
      throw new Error(`SixelDecoderOptions.paletteLimit must not exceed ${LIMITS.PALETTE_SIZE}`);
    }
    if (!_instance) {
      const module = WASM_MODULE || (WASM_MODULE = new WebAssembly.Module(WASM_BYTES));
      _instance = new WebAssembly.Instance(module, {
        env: {
          handle_band: this._handle_band.bind(this),
          mode_parsed: this._initCanvas.bind(this)
        }
      });
    } else {
      _cbProxy!.bandHandler = this._handle_band.bind(this);
      _cbProxy!.modeHandler = this._initCanvas.bind(this);
    }
    this._instance = _instance;
    this._wasm = this._instance.exports as IWasmDecoderExports;
    this._chunk = new Uint8Array(this._wasm.memory.buffer, this._wasm.get_chunk_address(), LIMITS.CHUNK_SIZE);
    this._states = new Uint32Array(this._wasm.memory.buffer, this._wasm.get_state_address(), 12);
    this._palette = new Uint32Array(this._wasm.memory.buffer, this._wasm.get_palette_address(), LIMITS.PALETTE_SIZE);
    this._palette.set(DEFAULT_PALETTE);
    this._pSrc = new Uint32Array(this._wasm.memory.buffer, this._wasm.get_p0_address());
    this._wasm.init(DEFAULT_FOREGROUND, 0, LIMITS.PALETTE_SIZE, 0);
  }

  /**
   * Width of the image data.
   * Returns the rasterWidth in level2/truncating mode,
   * otherwise the max width, that has been seen so far.
   */
  public get width(): number {
    return this._mode !== ParseMode.M1
      ? this._width
      : Math.max(this._maxWidth, this._wasm.current_width());
  }

  /**
   * Height of the image data.
   * Returns the rasterHeight in level2/truncating mode,
   * otherwise 6 * seen bands.
   */
  public get height(): number {
    return this._mode !== ParseMode.M1
      ? this._height
      : this._wasm.current_width()
        ? this._bandWidths.length * 6 + 6
        : this._bandWidths.length * 6;
  }

  /**
   * Get active palette colors as RGBA8888[] (borrowed).
   */
  public get palette(): Uint32Array {
    return this._palette.subarray(0, this._paletteLimit);
  }

  /**
   * Get the memory used by the decoder.
   *
   * This is a rough estimate accounting the wasm instance memory
   * and pixel buffers held on JS side (real value will be slightly
   * higher due to JS book-keeping).
   * Note that the decoder does not free ressources on its own,
   * call `release` to free excess memory.
   */
  public get memoryUsage(): number {
    return this._canvas.byteLength + this._wasm.memory.buffer.byteLength + 8 * this._bandWidths.length;
  }

  /**
   * Get various properties of the decoder and the current image.
   */
  public get properties(): any {
    return {
      width: this.width,
      height: this.height,
      mode: this._mode,
      level: this._level,
      truncate: this._truncate,
      paletteLimit: this._paletteLimit,
      fillColor: this._fillColor,
      memUsage: this.memoryUsage,
      rasterAttributes: {
        numerator: this._states[4],
        denominator: this._states[5],
        width: this._rasterWidth,
        height: this._rasterHeight,
      }
    }
  }

  /**
   * Initialize decoder for next image. Must be called before
   * any calls to `decode` or `decodeString`.
   */
  // FIXME: reorder arguments, better palette handling
  public init(
    fillColor: RGBA8888 = this._opts.fillColor,
    palette: Uint32Array | null = this._opts.palette,
    paletteLimit: number = this._opts.paletteLimit,
    truncate: boolean = this._opts.truncate
  ): void {
    this._wasm.init(this._opts.sixelColor, fillColor, paletteLimit, truncate ? 1 : 0);
    if (palette) {
      this._palette.set(palette.subarray(0, LIMITS.PALETTE_SIZE));
    }
    this._bandWidths.length = 0;
    this._maxWidth = 0;
    this._minWidth = LIMITS.MAX_WIDTH;
    this._lastOffset = 0;
    this._currentHeight = 0;
  }

  /**
   * Decode next chunk of data from start to end index (exclusive).
   * @throws Will throw if the image exceeds the memory limit.
   */
  public decode(data: UintTypedArray, start: number = 0, end: number = data.length): void {
    let p = start;
    while (p < end) {
      const length = Math.min(end - p, LIMITS.CHUNK_SIZE);
      this._chunk.set(data.subarray(p, p += length));
      this._wasm.decode(0, length);
    }
  }

  /**
   * Decode next chunk of string data from start to end index (exclusive).
   * Note: Decoding from string data is rather slow, use `decode` with byte data instead.
   * @throws Will throw if the image exceeds the memory limit.
   */
  public decodeString(data: string, start: number = 0, end: number = data.length): void {
    let p = start;
    while (p < end) {
      const length = Math.min(end - p, LIMITS.CHUNK_SIZE);
      for (let i = 0, j = p; i < length; ++i, ++j) {
        this._chunk[i] = data.charCodeAt(j);
      }
      p += length;
      this._wasm.decode(0, length);
    }
  }

  /**
   * Get current pixel data as 32-bit typed array (RGBA8888).
   * Also peeks into pixel data of the current band, that got not pushed yet.
   */
  public get data32(): Uint32Array {
    if (this._mode == ParseMode.M0 || !this.width || !this.height) {
      return NULL_CANVAS;
    }

    // get width of pending band to peek into left-over data
    let currentWidth = this._wasm.current_width();

    if (this._mode == ParseMode.M2) {
      let remaining = this.height - this._currentHeight;
      if (remaining > 0) {
        const adv = this._PIXEL_OFFSET;
        let offset = this._lastOffset;
        let c = 0;
        while (c < 6 && remaining > 0) {
          this._canvas.set(this._pSrc.subarray(adv * c, adv * c + currentWidth), offset + currentWidth * c);
          c++;
          remaining--;
        }
        if (remaining) {
          this._canvas.fill(this._fillColor, offset + currentWidth * c);
        }
      }
      return this._canvas.subarray(0, this.width * this.height);
    }

    if (this._mode == ParseMode.M1) {
      if (this._minWidth == this._maxWidth) {
        let escape = false;
        if (currentWidth) {
          if (currentWidth != this._minWidth) {
            escape = true;
          } else {
            const adv = this._PIXEL_OFFSET;
            let offset = this._lastOffset;
            this._realloc(offset, currentWidth * 6);
            for (let i = 0; i < 6; ++i) {
              this._canvas.set(this._pSrc.subarray(adv * i, adv * i + currentWidth), offset + currentWidth * i);
            }
          }
        }
        if (!escape) {
          return this._canvas.subarray(0, this.width * this.height);
        }
      }

      // worst case: copy re-aligned pixels if we have bands with different width
      const final = new Uint32Array(this.width * this.height);
      final.fill(this._fillColor);
      let finalOffset = 0;
      let start = 0;
      for (let i = 0; i < this._bandWidths.length; ++i) {
        const bw = this._bandWidths[i];
        for (let p = 0; p < 6; ++p) {
          final.set(this._canvas.subarray(start, start += bw), finalOffset);
          finalOffset += this.width;
        }
      }
      if (currentWidth) {
        const adv = this._PIXEL_OFFSET;
        for (let i = 0; i < 6; ++i) {
          final.set(this._pSrc.subarray(adv * i, adv * i + currentWidth), finalOffset + this.width * i);
        }
      }
      return final;
    }

    // fallthrough for all not handled cases
    return NULL_CANVAS;
  }

  /**
   * Release image ressources on JS side held by the decoder.
   *
   * The decoder tries to re-use memory ressources of a previous image
   * to lower allocation and GC pressure. Decoding a single big image
   * will grow the memory usage of the decoder permanently.
   * Call `release` to reset the internal buffers and free the memory.
   * Note that this destroys the image data, call it when done processing
   * a rather big image, otherwise it is not needed. Use `memoryUsage`
   * to decide, whether the held memory is still within your limits.
   * This does not affect the wasm module (operates on static memory).
   */
  public release(): void {
    this._canvas = NULL_CANVAS;
    this._bandWidths.length = 0;
    this._maxWidth = 0;
    this._minWidth = LIMITS.MAX_WIDTH;
    // also nullify parser states in wasm to avoid
    // width/height reporting potential out-of-bound values
    this._wasm.init(DEFAULT_FOREGROUND, 0, LIMITS.PALETTE_SIZE, 0);
  }
}


/**
 * Convenient decoding functions for easier usage.
 * 
 * These can be used for casual decoding of sixel images,
 * that dont come in as stream chunks.
 * Note that the functions instantiate a stream decoder for every call,
 * which comes with a performance penalty of ~25%.
 */


/**
 * Decode function with synchronous wasm loading.
 * Can be used in a web worker or in nodejs. Does not work reliable in normal browser context.
 * @throws Will throw if the image exceeds the memory limit.
 */
 export function decode(
  data: UintTypedArray | string,
  opts?: IDecoderOptions
): IDecodeResult {
  const dec = new Decoder(opts);
  dec.init();
  typeof data === 'string' ? dec.decodeString(data) : dec.decode(data);
  return { width: dec.width, height: dec.height, data32: dec.data32 }
}

/**
 * Decode function with asynchronous wasm loading.
 * Use this version in normal browser context.
 * @throws Will throw if the image exceeds the memory limit.
 */
export async function decodeAsync(
  data: UintTypedArray | string,
  opts?: IDecoderOptions
): Promise<IDecodeResult> {
  const dec = await DecoderAsync(opts);
  dec.init();
  typeof data === 'string' ? dec.decodeString(data) : dec.decode(data);
  return { width: dec.width, height: dec.height, data32: dec.data32 }
}
