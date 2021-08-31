const { decodeAsync, image2sixel } = require('../lib/index');
const { createCanvas, createImageData } = require('canvas');
const fs = require('fs');
const open = require('open');

// create some canvas
const width = 204;
const height = 202;
const canvas = createCanvas(width, height);
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

// convert to sixel sequence
const sixelData = image2sixel(ctx.getImageData(0, 0, width, height).data, width, height, 256, 1);

// output SIXEL data to terminal (Terminal must have SIXEL enabled!)
console.log(sixelData);


/**
 * For comparison we also output the image to a PNG file.
 */

// note: we strip the first 7 bytes, since they belong to the escape sequence introducer
// (should be handled by a proper sequence parser, see node_example_decode_full_sequence.js)
decodeAsync(sixelData.slice(7), {fillColor:0, memoryLimit: 65536 *20})
.then(result => {
  // transfer bitmap data to ImageData object
  const imageData = createImageData(result.width, result.height);
  new Uint32Array(imageData.data.buffer).set(result.data32);

  // draw ImageData to canvas
  const canvas2 = createCanvas(result.width, result.height);
  const ctx2 = canvas2.getContext('2d');
  ctx2.putImageData(imageData, 0, 0);

  // write to some file and show it
  const targetFile = __dirname + '/node_encode_output.png';
  const out = fs.createWriteStream(targetFile);
  const stream = canvas2.createPNGStream();
  stream.pipe(out);
  out.on('finish', () => open(targetFile));
});
