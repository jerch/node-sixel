/**
 * Copyright (c) 2019 Joerg Breitbart.
 * @license MIT
 */

import { RuntimeCase, perfContext, before, ThroughputRuntimeCase } from 'xterm-benchmark';
import { toRGBA8888, SixelDecoder, introducer, FINALIZER, sixelEncode } from './index';
import * as fs from 'fs';
import { RGBA8888 } from './Types';
import { Decoder } from './Decoder';
import { ICaseResult, IPerfCase } from 'xterm-benchmark/lib/interfaces';


// test data: 9-bit palette in 10x10 tiles (512 colors: 8*8*8) - 640x80 -> 6 rows => 640x480
const { SOURCE32, SOURCE8, PALETTE, SIXELSTRING, SIXELBYTES } = (() => {
  const channelValues = Array.from(Array(8).keys()).map(v => v * 32);
  const palette: RGBA8888[] = [];
  for (let r = 0; r < channelValues.length; ++r) {
    for (let g = 0; g < channelValues.length; ++g) {
      for (let b = 0; b < channelValues.length; ++b) {
        palette.push(toRGBA8888(channelValues[r], channelValues[g], channelValues[b]));
      }
    }
  }
  const source32 = new Uint32Array(512 * 10 * 10 * 6);
  for (let row = 0; row < 6; ++row) {
    for (let colorIdx = 0; colorIdx < 512; ++colorIdx) {
      const cy = colorIdx % 8;
      const cx = Math.floor(colorIdx / 8);
      for (let y = 0; y < 10; ++y) {
        for (let x = 0; x < 10; ++x) {
          source32[row * 640 * 80 + cy * 8 * 8 * 10 * 10 + y * 8 * 8 * 10 + cx * 10 + x] = palette[colorIdx];
        }
      }
    }
  }
  const source8 = new Uint8Array(source32.buffer);
  const sixelString = sixelEncode(source8, 640, 480, palette);
  const bytes = new Uint8Array(sixelString.length);
  for (let i = 0; i < sixelString.length; ++i) bytes[i] = sixelString.charCodeAt(i);
  return {
    SOURCE32: source32,
    SOURCE8: source8,
    PALETTE: palette,
    SIXELSTRING: sixelString,
    SIXELBYTES: bytes
  };
})();
const TARGET = new Uint8ClampedArray(512 * 10 * 10 * 6 * 4);

// preview test image
function preview(dec: SixelDecoder): void {
  const { createCanvas, createImageData } = require('canvas');
  const fs = require('fs');
  const open = require('open');
  const width = dec.width;
  const height = dec.height;
  const imageData = createImageData(width, height);
  dec.toPixelData(imageData.data, width, height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  const targetFile = __dirname + '/testimage.png';
  const out = fs.createWriteStream(targetFile);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  out.on('finish', () => open(targetFile));
}

// preview in terminal
function previewTerminal(sixels: string): void {
  console.log(introducer(1));
  console.log(sixels);
  console.log(FINALIZER);
}


perfContext('testimage', () => {
  perfContext('pixel transfer', () => {
    const dec = new SixelDecoder();
    dec.decode(SIXELBYTES);
    new RuntimeCase('toPixelData - with fillColor', () => {
      return dec.toPixelData(TARGET, 640, 480, 0, 0, 0, 0, 640, 480, toRGBA8888(0, 0, 0));
    }, { repeat: 20 }).showAverageRuntime();
    new RuntimeCase('toPixelData - without fillColor', () => {
      return dec.toPixelData(TARGET, 640, 480, 0, 0, 0, 0, 640, 480, 0);
    }, { repeat: 20 }).showAverageRuntime();
  });

  perfContext('decode (DefaultDecoder)', () => {
    new RuntimeCase('decode', () => {
      const dec = new SixelDecoder();
      dec.decode(SIXELBYTES);
      return dec.width;
    }, { repeat: 20 }).showAverageRuntime();
    new RuntimeCase('decodeString', () => {
      const dec = new SixelDecoder();
      dec.decodeString(SIXELSTRING);
      return dec.width;
    }, { repeat: 20 }).showAverageRuntime();
    new RuntimeCase('decode + pixel transfer', () => {
      const dec = new SixelDecoder();
      dec.decode(SIXELBYTES);
      return dec.toPixelData(TARGET, 640, 480, 0, 0, 0, 0, 640, 480, 0);
    }, { repeat: 20 }).showAverageRuntime();
  });

  perfContext('decode (WasmDecoder)', () => {
    const wasmDec = new Decoder();
    new RuntimeCase('decode', () => {
      wasmDec.init();
      wasmDec.decode(SIXELBYTES);
    }, { repeat: 20 }).showAverageRuntime();
    new RuntimeCase('decodeString', () => {
      wasmDec.init();
      wasmDec.decodeString(SIXELSTRING);
    }, { repeat: 20 }).showAverageRuntime();
  });

  perfContext('encode', () => {
    new RuntimeCase('sixelEncode', () => {
      return sixelEncode(SOURCE8, 640, 480, PALETTE).length;
    }, { repeat: 20 }).showAverageRuntime();
    // }, {repeat: 1, fork: true, forkOptions: {execArgv: ['--inspect-brk']}}).showAverageRuntime();
  });
});


const TEST1 = fs.readFileSync(__dirname + '/../testfiles/test1_clean.sixel');
const TEST2 = fs.readFileSync(__dirname + '/../testfiles/test2_clean.sixel');
const SAMPSA = fs.readFileSync(__dirname + '/../testfiles/sampsa_reencoded_clean.six');

const FHD1 = fs.readFileSync(__dirname + '/../testfiles/fhd1_clean.six');
const FHD2 = fs.readFileSync(__dirname + '/../testfiles/fhd2_clean.six');

// create 1920 x 1080 random noise in 12bit-RGB
// const channelValues = Array.from(Array(16).keys()).map(v => v * 16);
// const palette: RGBA8888[] = [];
// for (let r = 0; r < channelValues.length; ++r) {
//   for (let g = 0; g < channelValues.length; ++g) {
//     for (let b = 0; b < channelValues.length; ++b) {
//       palette.push(toRGBA8888(channelValues[r], channelValues[g], channelValues[b]));
//     }
//   }
// }
// const pixels = new Uint32Array(2073600);
// for (let i = 0; i < pixels.length; ++i) {
//   pixels[i] = palette[Math.floor(Math.random() * 4096)];
// }
// const NOISE_STRING = sixelEncode(new Uint8Array(pixels.buffer), 1920, 1080, palette);
// fs.writeFileSync('testfiles/fullhd_12bit_noise_clean.six', NOISE_STRING);
const NOISE = fs.readFileSync(__dirname + '/../testfiles/fullhd_12bit_noise_clean.six');

perfContext('decode - testfiles (DefaultDecoder)', () => {
  new ThroughputRuntimeCase('test1_clean.sixel', () => {
    const dec = new SixelDecoder();
    dec.decode(TEST1);
    return { payloadSize: TEST1.length };
  }, { repeat: 20 }).showAverageRuntime().showAverageThroughput();
  new ThroughputRuntimeCase('test2_clean.sixel', () => {
    const dec = new SixelDecoder();
    dec.decode(TEST2);
    return { payloadSize: TEST2.length };
  }, { repeat: 20 }).showAverageRuntime().showAverageThroughput();
  new ThroughputRuntimeCase('sampsa_reencoded_clean.six', () => {
    const dec = new SixelDecoder();
    dec.decode(SAMPSA);
    return { payloadSize: SAMPSA.length };
  }, { repeat: 20 }).showAverageRuntime().showAverageThroughput();
  new ThroughputRuntimeCase('FullHD 12bit noise', () => {
    const dec = new SixelDecoder();
    dec.decode(NOISE);
    return { payloadSize: NOISE.length };
  }, { repeat: 20 }).showAverageRuntime().showAverageThroughput();
});


perfContext('decode - testfiles (WasmDecoder)', () => {
  let wasmDec: Decoder;
  before(() => {
    wasmDec = new Decoder();
  });
  new ThroughputRuntimeCase('test1_clean.sixel', () => {
    wasmDec.init();
    wasmDec.decode(TEST1);
    return { payloadSize: TEST1.length, pixelSize: wasmDec.width * wasmDec.height };
  }, { repeat: 20 }).showAverageRuntime().showAverageThroughput().postAll(sixelStats);
  new ThroughputRuntimeCase('test2_clean.sixel', () => {
    wasmDec.init();
    wasmDec.decode(TEST2);
    return { payloadSize: TEST2.length, pixelSize: wasmDec.width * wasmDec.height };
  }, { repeat: 20 }).showAverageRuntime().showAverageThroughput().postAll(sixelStats);
  new ThroughputRuntimeCase('sampsa_reencoded_clean.six', () => {
    wasmDec.init();
    wasmDec.decode(SAMPSA);
    return { payloadSize: SAMPSA.length, pixelSize: wasmDec.width * wasmDec.height };
  }, { repeat: 20 }).showAverageRuntime().showAverageThroughput().postAll(sixelStats);
  new ThroughputRuntimeCase('FullHD 12bit noise', () => {
    wasmDec.init();
    wasmDec.decode(NOISE);
    return { payloadSize: NOISE.length, pixelSize: wasmDec.width * wasmDec.height };
  }, { repeat: 20 }).showAverageRuntime().showAverageThroughput().postAll(sixelStats);


  new ThroughputRuntimeCase('640x480 9bit tiles', () => {
    wasmDec.init();
    wasmDec.decode(SIXELBYTES);
    return { payloadSize: SIXELBYTES.length, pixelSize: 640 * 480 };
  }, { repeat: 20 }).showAverageRuntime().showAverageThroughput().postAll(sixelStats);

  new ThroughputRuntimeCase('FullHD 1', () => {
    wasmDec.init();
    wasmDec.decode(FHD1);
    return { payloadSize: FHD1.length, pixelSize: wasmDec.width * wasmDec.height };
  }, { repeat: 20 }).showAverageRuntime().showAverageThroughput().postAll(sixelStats);
  new ThroughputRuntimeCase('FullHD 2', () => {
    wasmDec.init();
    wasmDec.decode(FHD2);
    return { payloadSize: FHD2.length, pixelSize: wasmDec.width * wasmDec.height };
  }, { repeat: 20 }).showAverageRuntime().showAverageThroughput().postAll(sixelStats);
});

function sixelStats(results: ICaseResult[], perfCase: IPerfCase) {
  return;
  let runtime = 0;
  let pixels = 0;
  for (const r of results) {
    runtime += r.runtime[0] * 1000 + r.runtime[1] / 1000000;
    pixels += r.returnValue.pixelSize;
  }
  const fps = results.length / runtime * 1000;
  const pps = pixels / runtime * 1000;
  const pixelWrite = pixels * 4 / runtime * 1000;
  console.log(
    `${perfCase.getIndent()} --> image throughput`,
    {
      FPS: fps.toFixed(2),
      PPS: fmtBig(pps),
      pixelWrite: fmtBig(pixelWrite) + 'B/s',
    }
  );
}

function fmtBig(v: number): string {
  return v > 1000000000
    ? (v / 1000000000).toFixed(2) + ' G'
    : v > 1000000
      ? (v / 1000000).toFixed(2) + ' M'
      : v > 1000
        ? (v / 1000).toFixed(2) + ' K'
        : '' + v;
}
