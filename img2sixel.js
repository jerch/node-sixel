/**
 * Example script as cmdline converter.
 * Call: `node img2sixel.js <image files>`
 */


// set to 16 for xterm in VT340 mode
const MAX_PALETTE = 256;

// 0 - default action (background color)
// 1 - keep previous content
// 2 - set background color
const BACKGROUND_SELECT = 0;


const { loadImage, createCanvas } = require('canvas');
const RgbQuant = require('rgbquant');
const { introducer, FINALIZER, sixelEncode } = require('./lib/index');
const { quantize } = require('upng-js');

let quantization = 0;
let sixelConversion = 0;

async function processImage(filename, palLimit) {
  // load image
  let img;
  try {
    img = await loadImage(filename);
  } catch (e) {
    console.error(`cannot load image "${filename}"`);
    return;
  }
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // quantize and dither
  const s1 = Date.now();
  const q = new RgbQuant({colors: palLimit, dithKern: 'FloydSteinberg', dithSerp: true});
  q.sample(canvas);
  const palette = q.palette(true);
  const quantizedData = q.reduce(canvas);

  //const data = ctx.getImageData(0,0,img.width, img.height).data;
  //const res = quantize(data, palLimit);
  //const quantizedData = new Uint8Array(res.abuf);
  //const palette = res.plte.map(el => el.est.rgba);
  
  quantization += Date.now() - s1;
  
  // output to terminal
  const s2 = Date.now();

  console.log(`${filename}:`);
  console.log(introducer(BACKGROUND_SELECT));
  try {
    console.log(sixelEncode(quantizedData, img.width, img.height, palette));
  } finally {
    console.log(FINALIZER);
  }

  sixelConversion += Date.now() - s2;
}

async function main() {
  let palLimit = MAX_PALETTE;
  for (const arg of process.argv) {
    if (arg.startsWith('-p')) {
      palLimit = parseInt(arg.slice(2));
      process.argv.splice(process.argv.indexOf(arg), 1);
      break;
    }
  }
  for (const filename of process.argv.slice(2)) {
    await processImage(filename, palLimit);
  }
  console.log('runtime:', {quantization, sixelConversion});
}

main();
