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
const { SixelImage } = require('./lib/index');


async function processImage(filename) {
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
  const q = new RgbQuant({colors: MAX_PALETTE, dithKern: 'FloydSteinberg', dithSerp: true});
  q.sample(canvas);
  const palette = q.palette(true);
  const quantizedData = q.reduce(canvas);
  
  // output to terminal
  const sixelImage = SixelImage.fromImageData(quantizedData, img.width, img.height, palette);
  console.log(`${filename}:`);
  console.log(SixelImage.introducer(BACKGROUND_SELECT));
  try {
    console.log(sixelImage.toSixelString());
  } finally {
    console.log(SixelImage.finalizer());
  }
}

for (const filename of process.argv.slice(2)) {
  processImage(filename);
}
