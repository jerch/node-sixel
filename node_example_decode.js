const { SixelImage } = require('./lib/index');
const { createCanvas, createImageData } = require('canvas');
const fs = require('fs');
const open = require('open');

fs.readFile('testfiles/screen_clean.six', (err, data) => {
  // read in sixel data
  const sixelImage = new SixelImage();
  sixelImage.write(data);

  // image metrics
  const width = sixelImage.width;
  const height = sixelImage.height;

  // transfer bitmap data to ImageData object
  const imageData = createImageData(width, height);
  sixelImage.toImageData(imageData.data, width, height);

  // draw ImageData to canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);

  // write to some file and show it
  const targetFile = __dirname + '/node_output.png';
  const out = fs.createWriteStream(targetFile);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  out.on('finish', () => open(targetFile));
})
