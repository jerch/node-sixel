/**
 * Copyright (c) 2021 Joerg Breitbart.
 * @license MIT
 */

import * as assert from 'assert';
import { alpha, blue, DEFAULT_BACKGROUND, DEFAULT_FOREGROUND, fromRGBA8888, green, PALETTE_ANSI_256, PALETTE_VT340_COLOR, red, toRGBA8888 } from './Colors';
import { LIMITS } from './wasm';
import { Decoder, DecoderAsync } from './Decoder';
import * as fs from 'fs';
import { IWasmDecoder, IWasmDecoderExports, ParseMode, RGBA8888 } from './Types';

function almostEqualColor(a: RGBA8888, b: RGBA8888, distance: number = 0) {
  try {
    assert.strictEqual(Math.abs(red(a) - red(b)) <= distance, true);
    assert.strictEqual(Math.abs(green(a) - green(b)) <= distance, true);
    assert.strictEqual(Math.abs(blue(a) - blue(b)) <= distance, true);
    assert.strictEqual(Math.abs(alpha(a) - alpha(b)) <= distance, true);
  } catch (e) {
    throw new Error(`mismatch in colors: [${fromRGBA8888(a)}] : [${fromRGBA8888(b)}]`);
  }
}

function s2b(s: string): Uint8Array {
  const result = new Uint8Array(s.length);
  for (let i = 0; i < s.length; ++i) {
    result[i] = s.charCodeAt(i);
  }
  return result;
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

const WASM_BYTES = decodeBase64(LIMITS.BYTES);


function getWasmDecoder(mode_parsed: (mode: number) => number, handle_band: (mode: number) => number): IWasmDecoder {
  const module = new WebAssembly.Module(WASM_BYTES);
  return new WebAssembly.Instance(module, {
    env: {
      handle_band: handle_band,
      mode_parsed: mode_parsed
    }
  }) as IWasmDecoder;
}

// minimal decoder implementing the wasm interface for testing
class TestDecoder {
  public inst: IWasmDecoder;
  public w: IWasmDecoderExports;
  public chunk: Uint8Array;
  public palette: Uint32Array;
  public state: Uint32Array;
  public pixels: Uint32Array;
  constructor(mode_parsed: (mode: number) => number, handle_band: (mode: number) => number) {
    const module = new WebAssembly.Module(WASM_BYTES);
    this.inst = new WebAssembly.Instance(module, {
      env: {
        handle_band: handle_band,
        mode_parsed: mode_parsed
      }
    }) as IWasmDecoder;
    this.w = this.inst.exports;
    this.chunk = new Uint8Array(this.w.memory.buffer, this.w.get_chunk_address(), LIMITS.CHUNK_SIZE);
    this.palette = new Uint32Array(this.w.memory.buffer, this.w.get_palette_address(), LIMITS.PALETTE_SIZE);
    this.state = new Uint32Array(this.w.memory.buffer, this.w.get_state_address(), 30);
    this.pixels = new Uint32Array(this.w.memory.buffer, this.w.get_p0_address());
  }
  public loadString(data: string): void {
    if (data.length > LIMITS.CHUNK_SIZE) throw new Error('chunk too big');
    for (let i = 0; i < data.length; ++i) this.chunk[i] = data.charCodeAt(i);
  }
  public decodeString(data: string): void {
    this.loadString(data);
    this.w.decode(0, data.length);
  }
  public getPixels(line?: number): Uint32Array {
    if (line !== undefined) {
      return this.pixels.subarray(line * (LIMITS.MAX_WIDTH + 4), line * (LIMITS.MAX_WIDTH + 4) + LIMITS.MAX_WIDTH);
    }
    const result = new Uint32Array(6 * LIMITS.MAX_WIDTH);
    for (let i = 0; i < 6; ++i) {
      result.set(this.pixels.subarray(i * (LIMITS.MAX_WIDTH + 4), i * (LIMITS.MAX_WIDTH + 4) + LIMITS.MAX_WIDTH), i * LIMITS.MAX_WIDTH);
    }
    return result;
  }
}

describe('WasmDecoder', () => {
  let dec: TestDecoder;
  beforeEach(() => {
    dec = new TestDecoder(_ => 0, _ => 0);
  });
  describe('params handling', () => {
    it('in ST_ATTR', () => {
      dec.w.init(0, 0, 4, 0);
      assert.strictEqual(dec.state[19], 1);     // always holds 1 params
      assert.strictEqual(dec.state[20], 0);     // ZDM
      dec.decodeString('"1;2;3;4;5;6;7;8;9;10');
      assert.strictEqual(dec.state[19], 8);     // stops at max 8 params
      assert.strictEqual(dec.state[20], 1);
      assert.strictEqual(dec.state[21], 2);
      assert.strictEqual(dec.state[27], 8910);  // but accounts all excess params at 8th
    });
    it('in ST_COMPRESSION', () => {
      dec.w.init(0, 0, 4, 0);
      assert.strictEqual(dec.state[19], 1);     // always holds 1 params
      assert.strictEqual(dec.state[20], 0);     // ZDM
      dec.decodeString('!1;2;3;4;5;6;7;8;9;10');
      assert.strictEqual(dec.state[19], 8);     // stops at max 8 params
      assert.strictEqual(dec.state[20], 1);
      assert.strictEqual(dec.state[21], 2);
      assert.strictEqual(dec.state[27], 8910);  // but accounts all excess params at 8th
      // re-entering resets p[0]
      dec.decodeString('!');
      assert.strictEqual(dec.state[19], 1);     // always holds 1 params
      assert.strictEqual(dec.state[20], 0);     // ZDM
    });
    it('in ST_COLOR', () => {
      dec.w.init(0, 0, 4, 0);
      assert.strictEqual(dec.state[19], 1);     // always holds 1 params
      assert.strictEqual(dec.state[20], 0);     // ZDM
      dec.decodeString('#1;2;3;4;5;6;7;8;9;10');
      assert.strictEqual(dec.state[19], 8);     // stops at max 8 params
      assert.strictEqual(dec.state[20], 1);
      assert.strictEqual(dec.state[21], 2);
      assert.strictEqual(dec.state[27], 8910);  // but accounts all excess params at 8th
      // re-entering resets p[0]
      dec.decodeString('#');
      assert.strictEqual(dec.state[19], 1);     // always holds 1 params
      assert.strictEqual(dec.state[20], 0);     // ZDM
    });
  });
  describe('sixel state transitions', () => {
    const ST_DATA = 0;
    const ST_COMPRESSION = 33;
    const ST_ATTR = 34;
    const ST_COLOR = 35;
    it('init starts in ST_DATA', () => {
      dec.w.init(0, 0, 4, 0);
      assert.strictEqual(dec.state[16], ST_DATA);
      dec.decodeString('#123');
      assert.notStrictEqual(dec.state[16], ST_DATA);
      // init should reset to ST_DATA
      dec.w.init(0, 0, 4, 0);
      assert.strictEqual(dec.state[16], ST_DATA);
    });
    it('ST_DATA --> ST_COMPRESSION', () => {
      // only '!' should enter ST_COMPRESSION
      for (let i = 0; i < 128; ++i) {
        dec.w.init(0, 0, 4, 0);
        dec.decodeString(String.fromCharCode(i));
        i === 33
          ? assert.strictEqual(dec.state[16], ST_COMPRESSION)
          : assert.notStrictEqual(dec.state[16], ST_COMPRESSION);
      }
      // ST_COMPRESSION should reset params
      dec.w.init(0, 0, 4, 0);
      dec.state[19] = 999;    // p_length
      dec.state[20] = 123456; // first param
      dec.decodeString('!');
      assert.strictEqual(dec.state[19], 1);
      assert.strictEqual(dec.state[20], 0);
      // digit parsing
      dec.decodeString('123456');
      assert.strictEqual(dec.state[19], 1);
      assert.strictEqual(dec.state[20], 123456);
      // re-entering compression resets repeat counter
      dec.decodeString('!99');
      assert.strictEqual(dec.state[19], 1);
      assert.strictEqual(dec.state[20], 99);
      // should apply pending color command (ST_COLOR --> ST_COMPRESSION)
      dec.w.init(0, 0, 4, 0);
      dec.decodeString('#0;2;100;100;100!123');
      assert.strictEqual(dec.palette[0], toRGBA8888(255, 255, 255));
    });
    it('ST_DATA --> ST_ATTR', () => {
      // only '"' should enter ST_ATTR
      for (let i = 0; i < 128; ++i) {
        dec.w.init(0, 0, 4, 0);
        dec.decodeString(String.fromCharCode(i));
        i === 34
          ? assert.strictEqual(dec.state[16], ST_ATTR)
          : assert.notStrictEqual(dec.state[16], ST_ATTR);
      }
      // ST_ATTR should reset params
      dec.w.init(0, 0, 4, 0);
      dec.state[18] = 999;    // p_length
      dec.state[19] = 123456; // first param
      dec.decodeString('"');
      assert.strictEqual(dec.state[19], 1);
      assert.strictEqual(dec.state[20], 0);
      // digit parsing
      dec.decodeString('12;34;56;78');
      assert.strictEqual(dec.state[19], 4);
      assert.strictEqual(dec.state[20], 12);
      assert.strictEqual(dec.state[21], 34);
      assert.strictEqual(dec.state[22], 56);
      assert.strictEqual(dec.state[23], 78);
      // digit parsing with defaults (mirrors only here, thus 0 is reported as 0)
      // Note: spec says that P1 and P2 should be treated as 1 if omitted, P3/P4 unclear
      dec.w.init(0, 0, 4, 0);
      dec.decodeString(';;;?');
      assert.strictEqual(dec.state[19], 4);
      assert.strictEqual(dec.state[4], 0);
      assert.strictEqual(dec.state[5], 0);
      assert.strictEqual(dec.state[6], 0);
      assert.strictEqual(dec.state[7], 0);
      assert.strictEqual(dec.state[16], ST_DATA); // ended on ?
      // any command or sixel byte ends ST_ATTR
      const commands = ['#', '$', '-', '!'];
      for (const command of commands) {
        // attr full
        dec.w.init(0, 0, 4, 0);
        dec.decodeString('"1;1;1;1');
        dec.decodeString(command);
        assert.notStrictEqual(dec.state[16], ST_ATTR);
        // attr underfull
        dec.w.init(0, 0, 4, 0);
        dec.decodeString('"1;1');
        dec.decodeString(command);
        assert.notStrictEqual(dec.state[16], ST_ATTR);
      }
      const sixels = '?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
      for (const c of sixels) {
        // attr full
        dec.w.init(0, 0, 4, 0);
        dec.decodeString('"1;1;1;1');
        dec.decodeString(c);
        assert.strictEqual(dec.state[16], ST_DATA);
        // attr underfull
        dec.w.init(0, 0, 4, 0);
        dec.decodeString('"1;1');
        dec.decodeString(c);
        assert.strictEqual(dec.state[16], ST_DATA);
      }
      // only respected before any other command or sixel bytes
      dec.w.init(0, 0, 4, 0);
      dec.decodeString('?"1;1;1;1');
      assert.notStrictEqual(dec.state[16], ST_ATTR);
      dec.w.init(0, 0, 4, 0);
      dec.decodeString('#0"1;1;1;1');
      assert.notStrictEqual(dec.state[16], ST_ATTR);
      dec.w.init(0, 0, 4, 0);
      dec.decodeString('!100"1;1;1;1');
      assert.notStrictEqual(dec.state[16], ST_ATTR);
      dec.w.init(0, 0, 4, 0);
      dec.decodeString('$"1;1;1;1');
      assert.notStrictEqual(dec.state[16], ST_ATTR);
      dec.w.init(0, 0, 4, 0);
      dec.decodeString('-"1;1;1;1');
      assert.notStrictEqual(dec.state[16], ST_ATTR);
    });
    it('ST_DATA --> ST_COLOR', () => {
      // only '#' should enter ST_ATTR
      for (let i = 0; i < 128; ++i) {
        dec.w.init(0, 0, 4, 0);
        dec.decodeString(String.fromCharCode(i));
        i === 35
          ? assert.strictEqual(dec.state[16], ST_COLOR)
          : assert.notStrictEqual(dec.state[16], ST_COLOR);
      }
      // should reset params
      dec.w.init(0, 0, 4, 0);
      dec.state[18] = 999;    // p_length
      dec.state[19] = 123456; // first param
      dec.decodeString('#');
      assert.strictEqual(dec.state[19], 1);
      assert.strictEqual(dec.state[20], 0);
      // digit parsing
      dec.decodeString('123456');
      assert.strictEqual(dec.state[19], 1);
      assert.strictEqual(dec.state[20], 123456);
      // should apply pending color command (ST_COLOR --> ST_COLOR)
      dec.w.init(0, 0, 4, 0);
      dec.decodeString('#0;2;100;100;100#123');
      assert.strictEqual(dec.palette[0], toRGBA8888(255, 255, 255));
    });
    it('ANY --> ST_DATA / sixel bytes exit any other state', () => {
      // ST_ATTR --> ST_DATA
      dec.w.init(0, 0, 4, 0);
      dec.decodeString('"?');
      assert.strictEqual(dec.state[16], ST_DATA);
      // ST_COMPRESSION --> ST_DATA, also applies repeat count
      dec.w.init(0, 0, 4, 0);
      dec.decodeString('!10?');
      assert.strictEqual(dec.state[16], ST_DATA);
      assert.strictEqual(dec.w.current_width(), 10);
      // ST_COLOR --> ST_DATA, applying color select (+ definition)
      dec.w.init(0, 0, 4, 0);
      dec.palette[1] = 1111;
      dec.decodeString('#1?'); // select only
      assert.strictEqual(dec.state[16], ST_DATA);
      assert.strictEqual(dec.state[17], 1111);
      dec.w.init(0, 0, 4, 0);
      dec.decodeString('#3;2;1;2;3?'); // definition + select
      assert.strictEqual(dec.state[16], ST_DATA);
      assert.strictEqual(dec.state[17], toRGBA8888(Math.round(1 / 100 * 255), Math.round(2 / 100 * 255), Math.round(3 / 100 * 255)));
      assert.strictEqual(dec.palette[3], toRGBA8888(Math.round(1 / 100 * 255), Math.round(2 / 100 * 255), Math.round(3 / 100 * 255)));
    });
  });
  describe('color command', () => {
    it('select color from palette', () => {
      const sixelColor = 255;
      const fillColor = 0;
      dec.w.init(sixelColor, fillColor, 4, 0);
      assert.strictEqual(dec.state[17], 255);
      dec.palette[0] = 0;
      dec.palette[1] = 1;
      dec.palette[2] = 2;
      dec.palette[3] = 3;
      dec.decodeString('#0?');
      assert.strictEqual(dec.state[17], 0);
      dec.decodeString('#1?');
      assert.strictEqual(dec.state[17], 1);
      dec.decodeString('#2?');
      assert.strictEqual(dec.state[17], 2);
      dec.decodeString('#3?');
      assert.strictEqual(dec.state[17], 3);
      // with modulo back mapping
      dec.decodeString('#4?');
      assert.strictEqual(dec.state[17], 0);
      dec.decodeString('#5?');
      assert.strictEqual(dec.state[17], 1);
    });
    it('RGB set & select', () => {
      const sixelColor = 255;
      const fillColor = 0;
      dec.w.init(sixelColor, fillColor, 4, 0);
      dec.palette[0] = 123456;
      assert.strictEqual(dec.state[17], 255);
      dec.decodeString('#0;2;0;0;0?');
      assert.strictEqual(dec.state[17], toRGBA8888(0, 0, 0));
      assert.strictEqual(dec.palette[0], toRGBA8888(0, 0, 0));
      dec.decodeString('#1;2;100;100;100?');
      assert.strictEqual(dec.state[17], toRGBA8888(255, 255, 255));
      assert.strictEqual(dec.palette[1], toRGBA8888(255, 255, 255));
      dec.decodeString('#2;2;100;0;0?');
      assert.strictEqual(dec.state[17], toRGBA8888(255, 0, 0));
      assert.strictEqual(dec.palette[2], toRGBA8888(255, 0, 0));
      dec.decodeString('#3;2;0;100;0?');
      assert.strictEqual(dec.state[17], toRGBA8888(0, 255, 0));
      assert.strictEqual(dec.palette[3], toRGBA8888(0, 255, 0));
      // with modulo back mapping
      dec.decodeString('#4;2;0;0;100?');
      assert.strictEqual(dec.state[17], toRGBA8888(0, 0, 255));
      assert.strictEqual(dec.palette[0], toRGBA8888(0, 0, 255));
      dec.decodeString('#5;2;1;2;3?');
      assert.strictEqual(dec.state[17], toRGBA8888(Math.round(1 / 100 * 255), Math.round(2 / 100 * 255), Math.round(3 / 100 * 255)));
      assert.strictEqual(dec.palette[1], toRGBA8888(Math.round(1 / 100 * 255), Math.round(2 / 100 * 255), Math.round(3 / 100 * 255)));
    });
    it('RGB normalize', () => {
      dec.w.init(0, 0, 4, 0);
      // do full range check for RGB
      for (let r = 0; r <= 100; ++r) {
        for (let g = 0; g <= 100; ++g) {
          for (let b = 0; b <= 100; ++b) {
            dec.decodeString(`#0;2;${r};${g};${b}?`);
            const c = toRGBA8888(Math.round(r / 100 * 255), Math.round(g / 100 * 255), Math.round(b / 100 * 255));
            assert.strictEqual(dec.state[17], c);
            assert.strictEqual(dec.palette[0], c);
          }
        }
      }
    });
    it('HLS convert', () => {
      // only test edge colors in HLS for now (should max the RGB channels)
      dec.w.init(0, 0, 4, 0);
      dec.decodeString(`#0;1;0;50;100?`);
      almostEqualColor(dec.state[17], toRGBA8888(0, 0, 255), 0);
      dec.decodeString(`#0;1;120;50;100?`);
      almostEqualColor(dec.state[17], toRGBA8888(255, 0, 0), 0);
      dec.decodeString(`#0;1;240;50;100?`);
      almostEqualColor(dec.state[17], toRGBA8888(0, 255, 0), 0);
      dec.decodeString(`#0;1;180;50;100?`);
      almostEqualColor(dec.state[17], toRGBA8888(255, 255, 0), 0);
      dec.decodeString(`#0;1;300;50;100?`);
      almostEqualColor(dec.state[17], toRGBA8888(0, 255, 255), 0);
      dec.decodeString(`#0;1;60;50;100?`);
      almostEqualColor(dec.state[17], toRGBA8888(255, 0, 255), 0);
    });
    it('invalid color commands', () => {
      dec.w.init(255, 0, 4, 0);
      dec.palette[0] = 111;
      // invalid color format, should not change color
      dec.decodeString('#0;3;4;5;6');
      assert.strictEqual(dec.state[17], 255);
      assert.strictEqual(dec.palette[0], 111);
      // explicit abort of color definition, should load color from register
      dec.decodeString('#0;0;1;2;3');
      assert.strictEqual(dec.state[17], 111);
      assert.strictEqual(dec.palette[0], 111);
    });
  });
  describe('painting', () => {
    it('put single - full sixel range', () => {
      const sixelColor = 255;
      const fillColor = 0;
      dec.w.init(sixelColor, fillColor, 256, 0);
      dec.decodeString('?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~');
      assert.strictEqual(dec.w.current_width(), 64);
      for (let i = 0; i < 6; ++i) {
        const pixels = dec.getPixels(i).subarray(0, 64);
        for (let pos = 0; pos < 64; ++pos) {
          assert.strictEqual(pixels[pos], pos & (1 << i) ? sixelColor : fillColor);
        }
      }
    });
    it('put repeated - full sixel range', () => {
      const sixelColor = 255;
      const fillColor = 0;
      dec.w.init(255, 0, 256, 0);
      dec.decodeString('!4?!4@!4A!4B!4C!4D!4E!4F!4G!4H!4I!4J!4K!4L!4M!4N!4O!4P!4Q!4R!4S!4T!4U!4V!4W!4X!4Y!4Z!4[!4\\!4]!4^!4_!4`!4a!4b!4c!4d!4e!4f!4g!4h!4i!4j!4k!4l!4m!4n!4o!4p!4q!4r!4s!4t!4u!4v!4w!4x!4y!4z!4{!4|!4}!4~');
      assert.strictEqual(dec.w.current_width(), 256);
      for (let i = 0; i < 6; ++i) {
        const pixels = dec.getPixels(i).subarray(0, 256);
        for (let pos = 0; pos < 256; ++pos) {
          assert.strictEqual(pixels[pos], (pos / 4) & (1 << i) ? sixelColor : fillColor);
        }
      }
    });
    it('put repeated - above MAX_WIDTH', () => {
      const sixelColor = 255;
      const fillColor = 0;
      dec.w.init(sixelColor, fillColor, 256, 0);
      dec.decodeString('!100000@');
      // should have stopped at MAX_WIDTH-4
      const comp = new Uint32Array(LIMITS.MAX_WIDTH).fill(255).fill(0, LIMITS.MAX_WIDTH - 4);
      assert.deepStrictEqual(dec.getPixels(0), comp);
      // should not overflow into other pixel lines
      assert.deepStrictEqual(dec.getPixels(1), new Uint32Array(LIMITS.MAX_WIDTH));
      // reports clamped width
      assert.strictEqual(dec.w.current_width(), LIMITS.MAX_WIDTH - 4);
    });
    it('put single/repeated mixed', () => {
      const sixelColor = 255;
      const fillColor = 0;
      dec.w.init(sixelColor, fillColor, 256, 0);
      dec.decodeString('!3@A!3BC');
      assert.strictEqual(dec.w.current_width(), 8);
      assert.deepStrictEqual(dec.getPixels(0).subarray(0, 8), new Uint32Array([255, 255, 255,   0, 255, 255, 255,   0]));
      assert.deepStrictEqual(dec.getPixels(1).subarray(0, 8), new Uint32Array([  0,   0,   0, 255, 255, 255, 255,   0]));
      assert.deepStrictEqual(dec.getPixels(2).subarray(0, 8), new Uint32Array([  0,   0,   0,   0,   0,   0,   0, 255]));
      assert.deepStrictEqual(dec.getPixels(3), new Uint32Array(LIMITS.MAX_WIDTH));
      assert.deepStrictEqual(dec.getPixels(4), new Uint32Array(LIMITS.MAX_WIDTH));
      assert.deepStrictEqual(dec.getPixels(5), new Uint32Array(LIMITS.MAX_WIDTH));
    });
    describe('repeat count - edge cases', () => {
      it('!<sixel> counted as 1', () => {
        // !... default to 1
        const sixelColor = 255;
        const fillColor = 0;
        // single
        dec.w.init(sixelColor, fillColor, 256, 0);
        dec.decodeString('!@');
        assert.strictEqual(dec.w.current_width(), 1);
        // multiple
        dec.w.init(sixelColor, fillColor, 256, 0);
        dec.decodeString('!@!A!?!g!~');
        assert.strictEqual(dec.w.current_width(), 5);
        // M2
        dec.w.init(sixelColor, fillColor, 256, 0);
        dec.decodeString('"1;1;20;10!@!A!?!g!~');
        assert.strictEqual(dec.state[18]-4, 5); // [17](cursor) - 4(padding offset)
      });
      it('!0<sixel> counted as 1', () => {
        // !... default to 1
        const sixelColor = 255;
        const fillColor = 0;
        // single
        dec.w.init(sixelColor, fillColor, 256, 0);
        dec.decodeString('!0@');
        assert.strictEqual(dec.w.current_width(), 1);
        // multiple
        dec.w.init(sixelColor, fillColor, 256, 0);
        dec.decodeString('!0@!0A!0?!0g!000~');
        assert.strictEqual(dec.w.current_width(), 5);
        // M2
        dec.w.init(sixelColor, fillColor, 256, 0);
        dec.decodeString('"1;1;20;10!0@!0A!0?!0g!000~');
        assert.strictEqual(dec.state[18]-4, 5); // [17](cursor) - 4(padding offset)
      });
      it('!<non-sixel> ignored', () => {
        // !... default to 1
        const sixelColor = 255;
        const fillColor = 0;
        dec.w.init(sixelColor, fillColor, 256, 0);
        dec.decodeString('!-!$!#@@@');
        assert.strictEqual(dec.w.current_width(), 3);
        // M2
        dec.w.init(sixelColor, fillColor, 256, 0);
        dec.decodeString('"1;1;20;10!-!$!#@@@');
        assert.strictEqual(dec.state[18]-4, 3);
      });
    });
  });
  describe('callbacks', () => {
    it('mode_parsed', () => {
      const stack: ParseMode[] = [];
      dec = new TestDecoder(
        mode => {
          stack.push(mode);
          return 0;
        },
        _ => 0
      );
      dec.w.init(0, 0, 4, 0);
      assert.strictEqual(dec.state[9], 0);              // lvl0 - undecided
      assert.strictEqual(dec.state[10], ParseMode.M0);  // --> M0
      // level 1 image --> M1
      dec.decodeString('????');
      assert.deepStrictEqual(stack, [ParseMode.M1]);
      assert.strictEqual(dec.state[9], 1);              // lvl1 image
      assert.strictEqual(dec.state[10], ParseMode.M1);  // --> M1
      stack.length = 0;

      // level 1 image with partial raster attribs --> M1
      dec.w.init(0, 0, 4, 0);
      assert.strictEqual(dec.state[9], 0);              // lvl0 - undecided
      assert.strictEqual(dec.state[10], ParseMode.M0);  // --> M0
      dec.decodeString('"1;1?????');
      assert.deepStrictEqual(stack, [ParseMode.M1]);
      assert.strictEqual(dec.state[9], 1);              // lvl1 image
      assert.strictEqual(dec.state[10], ParseMode.M1);  // --> M1
      stack.length = 0;

      // level 2 image with truncate=false --> M1
      dec.w.init(0, 0, 4, 0);
      assert.strictEqual(dec.state[9], 0);              // lvl0 - undecided
      assert.strictEqual(dec.state[10], ParseMode.M0);  // --> M0
      dec.decodeString('"1;1;10;5?????');
      assert.deepStrictEqual(stack, [ParseMode.M1]);
      assert.strictEqual(dec.state[9], 2);              // lvl2 image
      assert.strictEqual(dec.state[10], ParseMode.M1);  // --> M1
      stack.length = 0;

      // level 2 image with truncate=true --> M1
      dec.w.init(0, 0, 4, 1);
      assert.strictEqual(dec.state[9], 0);              // lvl0 - undecided
      assert.strictEqual(dec.state[10], ParseMode.M0);  // --> M0
      dec.decodeString('"1;1;10;5?????');
      assert.deepStrictEqual(stack, [ParseMode.M2]);
      assert.strictEqual(dec.state[9], 2);              // lvl2 image
      assert.strictEqual(dec.state[10], ParseMode.M2);  // --> M2
      stack.length = 0;
    });
    it('mode_parsed, return 0 (continue)', () => {
      dec = new TestDecoder(_ => 0, _ => 0);
      dec.w.init(0, 0, 4, 0);
      dec.decodeString('"1;1;10;5?????');
      assert.strictEqual(dec.state[18], 5 + 4);  // cursor pos (+4)
      assert.strictEqual(dec.w.current_width(), 5);
    });
    it('mode_parsed, return 1 (abort)', () => {
      dec = new TestDecoder(_ => 1, _ => 0);
      dec.w.init(0, 0, 4, 0);
      dec.decodeString('"1;1;10;5?????');
      assert.strictEqual(dec.state[18], 4);  // cursor pos (+4)
      assert.strictEqual(dec.w.current_width(), 0);
    });
    it('handle_band, return 0 (continue)', () => {
      const stack: number[] = [];
      dec = new TestDecoder(_ => 0, width => { stack.push(width); return 0; });
      // M1 - reports real cursor advance as band width
      dec.w.init(0, 0, 4, 0);
      dec.decodeString('"1;1;10;5A-BB-CCC-DDDD-EEEEE');
      assert.deepStrictEqual(stack, [1, 2, 3, 4]);
      assert.strictEqual(dec.state[18], 5 + 4);  // cursor pos (+4)
      assert.strictEqual(dec.w.current_width(), 5);
      stack.length = 0;
      // M2 - always reports rasterWidth as band width
      dec.w.init(0, 0, 4, 1);
      dec.decodeString('"1;1;10;5A-BB-CCC-DDDD-EEEEE');
      assert.deepStrictEqual(stack, [10, 10, 10, 10]);
      assert.strictEqual(dec.state[18], 5 + 4);  // cursor pos (+4)
      assert.strictEqual(dec.w.current_width(), 10);
    });
    it('handle_band, return 1 (abort)', () => {
      const stack: number[] = [];
      dec = new TestDecoder(_ => 0, width => { stack.push(width); return width >= 3 ? 1 : 0; });
      // M1 - reports real cursor advance as band width
      dec.w.init(0, 0, 4, 0);
      dec.decodeString('"1;1;10;5A-BB-CCC-DDDD-EEEEE');
      assert.deepStrictEqual(stack, [1, 2, 3]);
      assert.strictEqual(dec.state[18], 0 + 4);  // cursor pos (+4)
      assert.strictEqual(dec.w.current_width(), 0);
      stack.length = 0;
      // M2 - always reports rasterWidth as band width
      dec.w.init(0, 0, 4, 1);
      dec.decodeString('"1;1;10;5A-BB-CCC-DDDD-EEEEE');
      assert.deepStrictEqual(stack, [10]);
      assert.strictEqual(dec.state[18], 0 + 4);  // cursor pos (+4)
      assert.strictEqual(dec.w.current_width(), 10);
    });
  });
  describe('operation modes', () => {
    describe('M1 specifics', () => {
      it('reports cursor advance in band and current width', () => {
        const stack: number[] = [];
        dec = new TestDecoder(_ => 0, width => { stack.push(width); return 0; });
        dec.w.init(0, 0, 4, 0);
        dec.decodeString('"1;1;20;10'); // 20x10px image
        // empty line
        dec.decodeString('-');
        assert.deepStrictEqual(stack, [0]);
        assert.strictEqual(dec.w.current_width(), 0);
        // half line
        dec.decodeString('-!10A');
        assert.deepStrictEqual(stack, [0, 0]);
        assert.strictEqual(dec.w.current_width(), 10);
        // full line
        dec.decodeString('-!20A');
        assert.deepStrictEqual(stack, [0, 0, 10]);
        assert.strictEqual(dec.w.current_width(), 20);
        // overpaint
        dec.decodeString('-!2000A');
        assert.deepStrictEqual(stack, [0, 0, 10, 20]);
        assert.strictEqual(dec.w.current_width(), 2000);
        // >MAX_WIDTH
        dec.decodeString('-!2000000A');
        assert.deepStrictEqual(stack, [0, 0, 10, 20, 2000]);
        assert.strictEqual(dec.w.current_width(), 16380);   // clamped to MAX_WIDTH - 4
        dec.decodeString('-');
        assert.deepStrictEqual(stack, [0, 0, 10, 20, 2000, 16380]);
      });
    });
    describe('M2 specifics', () => {
      it('always reports rasterWidth in band and current width', () => {
        const stack: number[] = [];
        dec = new TestDecoder(_ => 0, width => { stack.push(width); return 0; });
        dec.w.init(0, 0, 4, 1);
        dec.decodeString('"1;1;20;10'); // 20x10px image
        // empty line
        dec.decodeString('-');
        assert.deepStrictEqual(stack, [20]);
        assert.strictEqual(dec.w.current_width(), 20);
        // half line
        dec.decodeString('-!10A');
        assert.deepStrictEqual(stack, [20, 20]);
        assert.strictEqual(dec.w.current_width(), 20);
        // full line
        dec.decodeString('-!20A');
        assert.deepStrictEqual(stack, [20, 20, 20]);
        assert.strictEqual(dec.w.current_width(), 20);
        // overpaint
        dec.decodeString('-!2000A');
        assert.deepStrictEqual(stack, [20, 20, 20, 20]);
        assert.strictEqual(dec.w.current_width(), 20);
        // >MAX_WIDTH
        dec.decodeString('-!2000000A');
        assert.deepStrictEqual(stack, [20, 20, 20, 20, 20]);
        assert.strictEqual(dec.w.current_width(), 20);
      });
    });
  });
});


describe('Decoder', () => {
  it('should have wrapped wasm data', () => {
    assert.strictEqual(LIMITS.CHUNK_SIZE, 16384);
    assert.strictEqual(LIMITS.PALETTE_SIZE, 4096);
    assert.strictEqual(LIMITS.MAX_WIDTH, 16384);
    assert.strictEqual(LIMITS.BYTES.length !== 0, true);
  });
  it('sync ctor', () => {
    const dec = new Decoder();
    assert.notStrictEqual((dec as any)._instance, undefined);
    assert.strictEqual(dec.palette.length, 4096);
    assert.strictEqual(dec.data32.length, 0);   // uninitialized defaults to 0 x 0
    assert.strictEqual(dec.width, 0);
    assert.strictEqual(dec.height, 0);
  });
  it('async ctor', async () => {
    assert.strictEqual(DecoderAsync() instanceof Promise, true);
    const dec = await DecoderAsync();
    assert.notStrictEqual((dec as any)._instance, undefined);
    assert.strictEqual(dec.palette.length, 4096);
    assert.strictEqual(dec.data32.length, 0);   // uninitialized defaults to 0 x 0
    assert.strictEqual(dec.width, 0);
    assert.strictEqual(dec.height, 0);
  });
  it('should have loaded default options', () => {
    const dec = new Decoder();
    assert.strictEqual((dec as any)._opts.memoryLimit, 2048 * 65536);
    assert.strictEqual((dec as any)._opts.sixelColor, DEFAULT_FOREGROUND);
    assert.strictEqual((dec as any)._opts.fillColor, DEFAULT_BACKGROUND);
    assert.deepStrictEqual((dec as any)._opts.palette, PALETTE_VT340_COLOR);
    assert.strictEqual((dec as any)._opts.paletteLimit, LIMITS.PALETTE_SIZE);
    assert.strictEqual((dec as any)._opts.truncate, true);
  });
  it('should respect customized options', () => {
    const dec = new Decoder({
      memoryLimit: 10,
      sixelColor: 123,
      fillColor: 456,
      palette: PALETTE_ANSI_256,
      paletteLimit: 1024,
      truncate: false
    });
    assert.strictEqual((dec as any)._opts.memoryLimit, 10);
    assert.strictEqual((dec as any)._opts.sixelColor, 123);
    assert.strictEqual((dec as any)._opts.fillColor, 456);
    assert.deepStrictEqual((dec as any)._opts.palette, PALETTE_ANSI_256);
    assert.strictEqual((dec as any)._opts.paletteLimit, 1024);
    assert.strictEqual((dec as any)._opts.truncate, false);
  });
  it('chunk/pixel addresses should be 128bit aligned', () => {
    const dec = new Decoder();
    assert.strictEqual((dec as any)._wasm.get_chunk_address() % 16, 0);
    assert.strictEqual((dec as any)._wasm.get_p0_address() % 16, 0);
  });
  describe('init', () => {
    it('fillColor from default', () => {
      let dec = new Decoder(); dec.init();
      assert.strictEqual(dec.properties.fillColor, DEFAULT_BACKGROUND);
      dec = new Decoder({ fillColor: 123 }); dec.init();
      assert.strictEqual(dec.properties.fillColor, 123);
    });
    it('fillColor init override', () => {
      const dec = new Decoder();
      dec.init(123);
      assert.strictEqual(dec.properties.fillColor, 123);
      dec.init(456);
      assert.strictEqual(dec.properties.fillColor, 456);
    });
    it('palette skip with null', () => {
      const dec = new Decoder();
      assert.deepStrictEqual(dec.palette.subarray(0, 16), PALETTE_VT340_COLOR);
      dec.init(0, null, 16);
      assert.deepStrictEqual(dec.palette, PALETTE_VT340_COLOR);
      dec.palette[0] = 255;
      dec.init(0, null, 16);
      assert.strictEqual(dec.palette[0], 255);
      assert.deepStrictEqual(dec.palette.subarray(1, 16), PALETTE_VT340_COLOR.subarray(1, 16));
    });
    it('palette init override / skip with null / pull default with undefined', () => {
      const dec = new Decoder();
      dec.init(0, PALETTE_ANSI_256, 256);
      assert.deepStrictEqual(dec.palette, PALETTE_ANSI_256);
      dec.init(0, null, 256);
      assert.deepStrictEqual(dec.palette, PALETTE_ANSI_256);
      dec.init(0, undefined, 16);
      assert.deepStrictEqual(dec.palette, PALETTE_VT340_COLOR);
    });
    it('invalid paletteLength defaults to PALETTE_SIZE', () => {
      const dec = new Decoder();
      dec.init(0, PALETTE_ANSI_256, 123456789);
      assert.strictEqual(dec.palette.length, LIMITS.PALETTE_SIZE);
      dec.init(0, PALETTE_ANSI_256, 256);
      assert.strictEqual(dec.palette.length, 256);
      dec.init(0, PALETTE_ANSI_256, -55);
      assert.strictEqual(dec.palette.length, LIMITS.PALETTE_SIZE);
    });
    it('init should reset dimensions', () => {
      const dec = new Decoder();
      dec.init(0, null, 256);
      dec.decodeString('ABC-DEFGH-IJ');   // M1: 5x18, current 2
      assert.strictEqual(dec.width, 5);
      assert.strictEqual(dec.height, 16);
      assert.strictEqual((dec as any)._wasm.current_width(), 2);
      dec.init(0, null, 256);
      assert.strictEqual(dec.width, 0);
      assert.strictEqual(dec.height, 0);
      assert.strictEqual((dec as any)._wasm.current_width(), 0);
      dec.init(0, null, 256);
      dec.decodeString('"1;1;5;3ABC-DEFGH-IJ');   // M2: 5x3, current 5
      assert.strictEqual(dec.width, 5);
      assert.strictEqual(dec.height, 3);
      assert.strictEqual((dec as any)._wasm.current_width(), 5);
      dec.init(0, null, 256);
      assert.strictEqual(dec.width, 0);
      assert.strictEqual(dec.height, 0);
      assert.strictEqual((dec as any)._wasm.current_width(), 0);
    });
  });
  describe('decode, properties & data8/32', () => {
    describe('mode settlement', () => {
      it('lvl 1 image --> M1', () => {
        const dec = new Decoder();
        dec.init(9, new Uint32Array([128, 129, 130, 131]), 4, false);
        dec.decodeString('#0A#1B$-#2!3C#3D');  // 4x9px - A: -x---- B: xx---- C: --x--- D: x-x---
        assert.strictEqual(dec.properties.fillColor, 9);
        assert.strictEqual(dec.properties.height, 9);
        assert.strictEqual(dec.properties.level, 1);
        assert.strictEqual(dec.properties.mode, 1);
        assert.strictEqual(dec.properties.memUsage > 400000, true);
        assert.strictEqual(dec.properties.paletteLimit, 4);
        assert.strictEqual(dec.properties.truncate, false);
        assert.strictEqual(dec.properties.width, 4);
        assert.deepStrictEqual(dec.properties.rasterAttributes, {numerator: 0, denominator: 0, width: 0, height: 0});
        const pixels = dec.data32;
        assert.strictEqual(pixels.length, 36);
        assert.strictEqual(pixels[0], 9); assert.strictEqual(pixels[4], 128); // A
        assert.strictEqual(pixels[1], 129); assert.strictEqual(pixels[5], 129); // B
        assert.strictEqual(pixels[24], 9); assert.strictEqual(pixels[28], 9); assert.strictEqual(pixels[32], 130); // C
        assert.strictEqual(pixels[25], 9); assert.strictEqual(pixels[29], 9); assert.strictEqual(pixels[33], 130); // C
        assert.strictEqual(pixels[26], 9); assert.strictEqual(pixels[30], 9); assert.strictEqual(pixels[34], 130); // C
        assert.strictEqual(pixels[27], 131); assert.strictEqual(pixels[31], 9); assert.strictEqual(pixels[35], 131); // D
        // current_width
        assert.strictEqual((dec as any)._wasm.current_width(), 4);
        // enter another line
        dec.decodeString('$-');
        assert.strictEqual(dec.properties.fillColor, 9);
        assert.strictEqual(dec.properties.height, 12);
        assert.strictEqual(dec.properties.level, 1);
        assert.strictEqual(dec.properties.mode, 1);
        assert.strictEqual(dec.properties.memUsage > 400000, true);
        assert.strictEqual(dec.properties.paletteLimit, 4);
        assert.strictEqual(dec.properties.truncate, false);
        assert.strictEqual(dec.properties.width, 4);
        assert.deepStrictEqual(dec.properties.rasterAttributes, {numerator: 0, denominator: 0, width: 0, height: 0});
        assert.strictEqual(dec.data32.length, 48);
        assert.strictEqual((dec as any)._wasm.current_width(), 0);
        // enter longer line should expand pixel area
        dec.decodeString('$-!10~'); // --> 10x24px
        assert.strictEqual(dec.properties.fillColor, 9);
        assert.strictEqual(dec.properties.height, 24);
        assert.strictEqual(dec.properties.level, 1);
        assert.strictEqual(dec.properties.mode, 1);
        assert.strictEqual(dec.properties.memUsage > 400000, true);
        assert.strictEqual(dec.properties.paletteLimit, 4);
        assert.strictEqual(dec.properties.truncate, false);
        assert.strictEqual(dec.properties.width, 10);
        assert.deepStrictEqual(dec.properties.rasterAttributes, {numerator: 0, denominator: 0, width: 0, height: 0});
        assert.strictEqual(dec.data32.length, 240);
        assert.strictEqual((dec as any)._wasm.current_width(), 10);
      });
      it('lvl 2 image, truncate=false --> M1', () => {
        const dec = new Decoder();
        dec.init(9, new Uint32Array([128, 129, 130, 131]), 4, false);
        dec.decodeString('"1;1;20;10#0A#1B$-#2!3C#3D');  // 4x12px - A: -x---- B: xx---- C: --x--- D: x-x---
        assert.strictEqual(dec.properties.fillColor, 9);
        assert.strictEqual(dec.properties.height, 9);
        assert.strictEqual(dec.properties.level, 2);
        assert.strictEqual(dec.properties.mode, 1);
        assert.strictEqual(dec.properties.memUsage > 400000, true);
        assert.strictEqual(dec.properties.paletteLimit, 4);
        assert.strictEqual(dec.properties.truncate, false);
        assert.strictEqual(dec.properties.width, 4);
        assert.deepStrictEqual(dec.properties.rasterAttributes, {numerator: 1, denominator: 1, width: 20, height: 10});
        const pixels = dec.data32;
        assert.strictEqual(pixels.length, 36);
        assert.strictEqual(pixels[0], 9); assert.strictEqual(pixels[4], 128); // A
        assert.strictEqual(pixels[1], 129); assert.strictEqual(pixels[5], 129); // B
        assert.strictEqual(pixels[24], 9); assert.strictEqual(pixels[28], 9); assert.strictEqual(pixels[32], 130); // C
        assert.strictEqual(pixels[25], 9); assert.strictEqual(pixels[29], 9); assert.strictEqual(pixels[33], 130); // C
        assert.strictEqual(pixels[26], 9); assert.strictEqual(pixels[30], 9); assert.strictEqual(pixels[34], 130); // C
        assert.strictEqual(pixels[27], 131); assert.strictEqual(pixels[31], 9); assert.strictEqual(pixels[35], 131); // D
        // current_width
        assert.strictEqual((dec as any)._wasm.current_width(), 4);
        // enter another line
        dec.decodeString('$-');
        assert.strictEqual(dec.properties.fillColor, 9);
        assert.strictEqual(dec.properties.height, 12);
        assert.strictEqual(dec.properties.level, 2);
        assert.strictEqual(dec.properties.mode, 1);
        assert.strictEqual(dec.properties.memUsage > 400000, true);
        assert.strictEqual(dec.properties.paletteLimit, 4);
        assert.strictEqual(dec.properties.truncate, false);
        assert.strictEqual(dec.properties.width, 4);
        assert.deepStrictEqual(dec.properties.rasterAttributes, {numerator: 1, denominator: 1, width: 20, height: 10});
        assert.strictEqual(dec.data32.length, 48);
        assert.strictEqual((dec as any)._wasm.current_width(), 0);
        // enter longer line should expand pixel area
        dec.decodeString('$-!10~'); // --> 10x24px
        assert.strictEqual(dec.properties.fillColor, 9);
        assert.strictEqual(dec.properties.height, 24);
        assert.strictEqual(dec.properties.level, 2);
        assert.strictEqual(dec.properties.mode, 1);
        assert.strictEqual(dec.properties.memUsage > 400000, true);
        assert.strictEqual(dec.properties.paletteLimit, 4);
        assert.strictEqual(dec.properties.truncate, false);
        assert.strictEqual(dec.properties.width, 10);
        assert.deepStrictEqual(dec.properties.rasterAttributes, {numerator: 1, denominator: 1, width: 20, height: 10});
        assert.strictEqual(dec.data32.length, 240);
        assert.strictEqual((dec as any)._wasm.current_width(), 10);
      });
      it('lvl 2 image, truncate=true --> M2', () => {
        const dec = new Decoder();
        dec.init(9, new Uint32Array([128, 129, 130, 131]), 4, true);
        dec.decodeString('"1;1;20;10#0A#1B$-#2!3C#3D');  // 4x12px - A: -x---- B: xx---- C: --x--- D: x-x---
        assert.strictEqual(dec.properties.fillColor, 9);
        assert.strictEqual(dec.properties.height, 10);
        assert.strictEqual(dec.properties.level, 2);
        assert.strictEqual(dec.properties.mode, 2);
        assert.strictEqual(dec.properties.memUsage > 400000, true);
        assert.strictEqual(dec.properties.paletteLimit, 4);
        assert.strictEqual(dec.properties.truncate, true);
        assert.strictEqual(dec.properties.width, 20);
        assert.deepStrictEqual(dec.properties.rasterAttributes, {numerator: 1, denominator: 1, width: 20, height: 10});
        const pixels = dec.data32;
        assert.strictEqual(pixels.length, 200);
        assert.strictEqual(pixels[0], 9); assert.strictEqual(pixels[20], 128); // A
        assert.strictEqual(pixels[1], 129); assert.strictEqual(pixels[21], 129); // B
        assert.strictEqual(pixels[120], 9); assert.strictEqual(pixels[140], 9); assert.strictEqual(pixels[160], 130); // C
        assert.strictEqual(pixels[121], 9); assert.strictEqual(pixels[141], 9); assert.strictEqual(pixels[161], 130); // C
        assert.strictEqual(pixels[122], 9); assert.strictEqual(pixels[142], 9); assert.strictEqual(pixels[162], 130); // C
        assert.strictEqual(pixels[123], 131); assert.strictEqual(pixels[143], 9); assert.strictEqual(pixels[163], 131); // D
        // check last pixel
        assert.strictEqual(pixels[pixels.length - 1], 9);
        // current_width
        assert.strictEqual((dec as any)._wasm.current_width(), 20);
        // enter another line
        dec.decodeString('$-');
        assert.strictEqual(dec.properties.fillColor, 9);
        assert.strictEqual(dec.properties.height, 10);
        assert.strictEqual(dec.properties.level, 2);
        assert.strictEqual(dec.properties.mode, 2);
        assert.strictEqual(dec.properties.memUsage > 400000, true);
        assert.strictEqual(dec.properties.paletteLimit, 4);
        assert.strictEqual(dec.properties.truncate, true);
        assert.strictEqual(dec.properties.width, 20);
        assert.deepStrictEqual(dec.properties.rasterAttributes, {numerator: 1, denominator: 1, width: 20, height: 10});
        assert.strictEqual(dec.data32.length, 200);
        assert.strictEqual((dec as any)._wasm.current_width(), 20);
        // enter longer line should not expand pixel area
        dec.decodeString('$-!10~');
        assert.strictEqual(dec.properties.fillColor, 9);
        assert.strictEqual(dec.properties.height, 10);
        assert.strictEqual(dec.properties.level, 2);
        assert.strictEqual(dec.properties.mode, 2);
        assert.strictEqual(dec.properties.memUsage > 400000, true);
        assert.strictEqual(dec.properties.paletteLimit, 4);
        assert.strictEqual(dec.properties.truncate, true);
        assert.strictEqual(dec.properties.width, 20);
        assert.deepStrictEqual(dec.properties.rasterAttributes, {numerator: 1, denominator: 1, width: 20, height: 10});
        assert.strictEqual(dec.data32.length, 200);
        assert.strictEqual((dec as any)._wasm.current_width(), 20);
      });
    });
    it('decodeString equals decode', () => {
      const bdata = fs.readFileSync('./testfiles/test1_clean.sixel');
      const sdata = fs.readFileSync('./testfiles/test1_clean.sixel', 'utf-8');
      const dec1 = new Decoder();
      dec1.init(0, null, 256);
      dec1.decode(bdata);
      const dec2 = new Decoder();
      dec2.init(0, null, 256);
      dec2.decodeString(sdata);
      assert.deepStrictEqual(dec2.data32, dec1.data32);
    });
    it('bytewise equals blob input', () => {
      const data = fs.readFileSync('./testfiles/test1_clean.sixel');
      const dec1 = new Decoder();
      dec1.init(0, null, 256);
      dec1.decode(data);
      const dec2 = new Decoder();
      dec2.init(0, null, 256);
      const container = new Uint8Array(1);
      for (let i = 0; i < data.length; ++i) {
        container[0] = data[i];
        dec2.decode(container);
      }
      assert.deepStrictEqual(dec2.data32, dec1.data32);
    });
    it('data8/32 access', () => {
      const data = fs.readFileSync('./testfiles/test1_clean.sixel');
      const dec = new Decoder();
      dec.init(0, null, 256);
      dec.decode(data);
      const data32 = dec.data32;
      const data8 = dec.data8;
      assert.strictEqual(data8.length, data32.length * 4);
      for (let i = 0; i < data32.length; ++i) {
        const v1 = data32[i];
        const v2 = Array.from(data8.slice(i*4, i*4+4)) as [number, number, number, number];
        assert.strictEqual(toRGBA8888(...v2), v1);
      }
      // from empty data32
      dec.init(0, null, 256);
      assert.strictEqual(dec.data8.length, 0);
    });
    it('M1 reports and uses correct with/height', () => {
      const dec = new Decoder();
      // no sixels at all
      dec.decodeString('#0;');
      assert.strictEqual(dec.width, 0);
      assert.strictEqual(dec.height, 0);
      assert.strictEqual(dec.data32.length, 0);

      // helper to generate arbitrary diagonale
      function diag(n: number) {
        const d6 = '@ACGO_';
        let final = '';
        for (let i = 0; i < Math.floor(n / 6); ++i) {
          final += d6;
          final += '$-!' + ((i+1)*6) + '?';
        }
        final += d6.slice(0, n % 6)
        return final;
      }

      // draw diagonale as 1x1, 2x2, 3x3, ... 19x19
      for (let h = 1; h < 19; ++h) {
        dec.init(0, null, 256);
        dec.decodeString(diag(h));
        assert.strictEqual(dec.width, h);
        assert.strictEqual(dec.height, h);
        assert.strictEqual(dec.data32.length, h*h);
      }
    });
  });
  describe('release', () => {
    const data = fs.readFileSync('./testfiles/test1_clean.sixel');
    const dec = new Decoder();
    const initialMemory = dec.memoryUsage;
    dec.init(123, null, 256);
    dec.decode(data);
    assert.strictEqual(dec.memoryUsage > initialMemory, true);
    assert.strictEqual(dec.data32.length, 1280 * 720);
    dec.release();
    // should reset mem & pixels
    assert.strictEqual(dec.memoryUsage, initialMemory);
    assert.strictEqual(dec.data32.length, 0);
    // should reset/nullify properties
    assert.strictEqual(dec.properties.fillColor, 0);
    assert.strictEqual(dec.properties.height, 0);
    assert.strictEqual(dec.properties.level, 0);
    assert.strictEqual(dec.properties.mode, 0);
    assert.strictEqual(dec.properties.paletteLimit, (dec as any)._opts.paletteLimit);
    assert.strictEqual(dec.properties.truncate, false);
    assert.strictEqual(dec.properties.width, 0);
  });
  describe('memory limit', () => {
    const dec = new Decoder({memoryLimit: 400});  // allow only 100px
    // M2 - pre-allocs and tests limits once
    dec.init();
    assert.throws(() => dec.decodeString('"1;1;16;16?'), /image exceeds memory limit/);
    dec.init();
    assert.doesNotThrow(() => dec.decodeString('"1;1;10;10?'), /image exceeds memory limit/);
    // M1 - allocates 256*256 pixels initially before realloc happens, skip with 5000*6+5000*6+922*6
    dec.init();
    assert.doesNotThrow(() => dec.decodeString('!5000A$-!5000A$-'), /image exceeds memory limit/);
    assert.doesNotThrow(() => dec.decodeString('!922A$-'), /image exceeds memory limit/);
    // next line should throw
    assert.throws(() => dec.decodeString('A$-'), /image exceeds memory limit/);
  });
});
