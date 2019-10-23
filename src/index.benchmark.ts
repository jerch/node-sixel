/**
 * Copyright (c) 2019 Joerg Breitbart.
 * @license MIT
 */

import { RuntimeCase, perfContext } from 'xterm-benchmark';
import { toRGBA8888, SixelDecoder, introducer, FINALIZER, sixelEncode } from './index';
import * as fs from 'fs';
import { RGBA8888 } from './Types';


// test data: 9-bit palette in 10x10 tiles (512 colors: 8*8*8) - 640x80 -> 6 rows => 640x480
const {SOURCE32, SOURCE8, PALETTE, SIXELSTRING, SIXELBYTES} = (() => {
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
    }, {repeat: 10}).showAverageRuntime();
    new RuntimeCase('toPixelData - without fillColor', () => {
      return dec.toPixelData(TARGET, 640, 480, 0, 0, 0, 0, 640, 480, 0);
    }, {repeat: 10}).showAverageRuntime();
  });

  perfContext('decode', () => {
    new RuntimeCase('decode', () => {
      const dec = new SixelDecoder();
      dec.decode(SIXELBYTES);
      return dec.width;
    }, {repeat: 10}).showAverageRuntime();
    new RuntimeCase('decodeString', () => {
      const dec = new SixelDecoder();
      dec.decodeString(SIXELSTRING);
      return dec.width;
    }, {repeat: 10}).showAverageRuntime();
    new RuntimeCase('decode + pixel transfer', () => {
      const dec = new SixelDecoder();
      dec.decode(SIXELBYTES);
      return dec.toPixelData(TARGET, 640, 480, 0, 0, 0, 0, 640, 480, 0);
    }, {repeat: 10}).showAverageRuntime();
  });

  perfContext('encode', () => {
    new RuntimeCase('sixelEncode', () => {
      return sixelEncode(SOURCE8, 640, 480, PALETTE).length;
    }, {repeat: 10}).showAverageRuntime();
    // }, {repeat: 1, fork: true, forkOptions: {execArgv: ['--inspect-brk']}}).showAverageRuntime();
  });
});


const TEST1 = fs.readFileSync(__dirname + '/../testfiles/test1_clean.sixel');
const TEST2 = fs.readFileSync(__dirname + '/../testfiles/test2_clean.sixel');
const SAMPSA = fs.readFileSync(__dirname + '/../testfiles/sampsa1_clean.sixel');

perfContext('decode - testfiles', () => {
  new RuntimeCase('test1_clean.sixel', () => {
    const dec = new SixelDecoder();
    dec.decode(TEST1);
    return dec.width;
  }, {repeat: 10}).showAverageRuntime();
  new RuntimeCase('test2_clean.sixel', () => {
    const dec = new SixelDecoder();
    dec.decode(TEST2);
    return dec.width;
  }, {repeat: 10}).showAverageRuntime();
  new RuntimeCase('sampsa1_clean.sixel', () => {
    const dec = new SixelDecoder();
    dec.decode(SAMPSA);
    return dec.width;
  }, {repeat: 10}).showAverageRuntime();
});
