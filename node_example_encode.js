const { SixelImage } = require('./lib/index');
const { createCanvas, createImageData } = require('canvas');
const fs = require('fs');
const open = require('open');

// create some canvas
const canvas = createCanvas(204, 202);
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'white';
ctx.fillRect(0, 0, canvas.width, canvas.height);

// gradient
const gradient = ctx.createLinearGradient(0, 0, 204, 0);
gradient.addColorStop(0, 'green');
gradient.addColorStop(.5, 'cyan');
gradient.addColorStop(1, 'green');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, 204, 50);
 
// yellow circle
ctx.strokeStyle = 'yellow';
ctx.beginPath();
ctx.arc(100, 120, 50, 0, 2 * Math.PI);
ctx.stroke();

// line at end - 1
ctx.translate(0.5,0.5);
ctx.strokeStyle = 'red';
ctx.beginPath();
ctx.moveTo(0, 200);
ctx.lineTo(204, 200);
ctx.stroke();

// some text
ctx.font = '30px Impact';
ctx.rotate(0.1);
ctx.fillStyle = 'black';
ctx.fillText('Awesome!', 50, 100);

// green underline half opaque
const text = ctx.measureText('Awesome!');
ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.lineTo(50, 102);
ctx.lineTo(50 + text.width, 102);
ctx.stroke();

/**
 * For proper results we have to quantize and dither the image
 * before we can convert it to SIXEL.
 * We simply use rgbquant in the example:
 */
const RgbQuant = require('rgbquant');
const q = new RgbQuant({colors: 16, dithKern: 'FloydSteinberg', dithSerp: true});
q.sample(canvas);
const palette = q.palette(true);
const quantizedData = q.reduce(canvas);

// finally create the SixelImage
const sixelImage = SixelImage.fromImageData(quantizedData, 204, 202, palette);

/**
 * You might want to skip the expensive quantization step (not recommended),
 * either because the image data is already in reduced colors (simple graphics)
 * or the output quality does not matter.
 * The palette should closely ressemble the colors in the image, otherwise 16 default
 * colors are used. Color replacement is done by simple euclidean distance.
 * Note: Some terminal have strict palette restrictions (16 colors for xterm).
 */
// const imageData = ctx.getImageData(0, 0, 204, 202);
// const sImage = SixelImage.fromImageData(imageData.data, 204, 202); // assumes 16 default colors (prolly not wanted)
// const sImage = SixelImage.fromImageData(imageData.data, 204, 202, customPalette); // uses customPalette


// output SIXEL data to terminal (Terminal must have SIXEL enabled!)
process.stdout.write(SixelImage.introducer(1));
try {
  sixelImage.toSixelBytes(chunk => process.stdout.write(chunk));
} finally {
  // never forget the finalizer or the terminal will "hang"
  // ensure it by an exception clause (in case `toSixelBytes` throws an error)
  process.stdout.write(SixelImage.finalizer());
}

/**
 * For comparison we also output the image to a PNG file.
 */
const width = sixelImage.width;
const height = sixelImage.height;

// transfer bitmap data to ImageData object
const imageData2 = createImageData(width, height);
sixelImage.toImageData(imageData2.data, width, height);

// draw ImageData to canvas
const canvas2 = createCanvas(width, height);
const ctx2 = canvas2.getContext('2d');
ctx2.putImageData(imageData2, 0, 0);

// write to some file and show it
const targetFile = __dirname + '/node_encode_output.png';
const out = fs.createWriteStream(targetFile);
const stream = canvas2.createPNGStream();
stream.pipe(out);
out.on('finish', () => open(targetFile));
