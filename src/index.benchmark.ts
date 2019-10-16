import { RuntimeCase, perfContext, beforeEach } from 'xterm-benchmark';
import { toRGBA8888, SixelImage, RGBA8888, fromRGBA8888 } from './index';


// test data: 9-bit palette in 10x10 tiles (512 colors: 8*8*8) - 640x80 -> 6 rows => 640x480
const {SOURCE32, SOURCE8, PALETTE, TEST_IMAGE, SIXELSTRING, SIXELBYTES} = (() => {
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
  const testImage = SixelImage.fromImageData(source8, 640, 480, palette);
  const sixelString = testImage.toSixelString();
  const bytes = new Uint8Array(sixelString.length);
  for (let i = 0; i < sixelString.length; ++i) bytes[i] = sixelString.charCodeAt(i);
  return {
    SOURCE32: source32,
    SOURCE8: source8,
    PALETTE: palette,
    TEST_IMAGE: testImage,
    SIXELSTRING: sixelString,
    SIXELBYTES: bytes
  };
})();
const TARGET = new Uint8ClampedArray(512 * 10 * 10 * 6 * 4);

// preview test image
function preview(sixelImage: SixelImage): void {
  const { createCanvas, createImageData } = require('canvas');
  const fs = require('fs');
  const open = require('open');
  const width = sixelImage.width;
  const height = sixelImage.height;
  const imageData = createImageData(width, height);
  sixelImage.toImageData(imageData.data, width, height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  const targetFile = __dirname + '/testimage.png';
  const out = fs.createWriteStream(targetFile);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  out.on('finish', () => open(targetFile));
}

function previewTerminal(sixelImage: SixelImage): void {
  console.log(SixelImage.introducer(1));
  console.log(sixelImage.toSixelString());
  console.log(SixelImage.finalizer());
}
//preview(TEST_IMAGE);
//previewTerminal(TEST_IMAGE);
//console.log(TEST_IMAGE.toSixelString().length);


perfContext('SixelImage', () => {
  new RuntimeCase('fromImageData - unsafe palette', () => {
    const img = SixelImage.fromImageData(SOURCE8, 640, 480, PALETTE, false);
    return img.width;
  }, {repeat: 10}).showAverageRuntime();
  new RuntimeCase('fromImageData - safe palette', () => {
    const img = SixelImage.fromImageData(SOURCE8, 640, 480, PALETTE, true);
    return img.width;
  }, {repeat: 10}).showAverageRuntime();

  new RuntimeCase('toImageData - with fillColor', () => {
    return TEST_IMAGE.toImageData(TARGET, 640, 480, 0, 0, 0, 0, 640, 480, toRGBA8888(0, 0, 0));
  }, {repeat: 10}).showAverageRuntime();
  new RuntimeCase('toImageData - without fillColor', () => {
    return TEST_IMAGE.toImageData(TARGET, 640, 480, 0, 0, 0, 0, 640, 480, 0);
  }, {repeat: 10}).showAverageRuntime();

  new RuntimeCase('writeString', () => {
    const img = new SixelImage();
    img.writeString(SIXELSTRING);
    return img.width;
  }, {repeat: 10}).showAverageRuntime();
  new RuntimeCase('write', () => {
    const img = new SixelImage();
    img.write(SIXELBYTES);
    return img.width;
  }, {repeat: 10}).showAverageRuntime();

  new RuntimeCase('toSixelString', () => {
    return TEST_IMAGE.toSixelString().length;
  }, {repeat: 10}).showAverageRuntime();
  new RuntimeCase('toSixelBytes', () => {
    let length = 0;
    TEST_IMAGE.toSixelBytes(c => { length += c.length; });
    return length;
  }, {repeat: 10}).showAverageRuntime();
  // }, {repeat: 1, fork: true, forkOptions: {execArgv: ['--inspect-brk']}}).showAverageRuntime();
});
