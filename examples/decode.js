const { decodeAsync, PALETTE_ANSI_256 } = require('./lib/index');
const { createCanvas, createImageData } = require('canvas');
const fs = require('fs');
const open = require('open');

/**
 * Note on *_clean.six files:
 * 
 * Normally SIXEL data is embedded in a DCS sequence like this:
 *    DCS P1 ; P2 ; P3 q <SIXEL DATA> ST
 * 
 * To handle this properly we would have to include an escape
 * sequence parser in the example which is beyond the scope. Thus
 * the _clean.six files are stripped down to the <SIXEL DATA> part.
 */
fs.readFile('testfiles/screen_clean.six', (err, data) => {
  // example with decodeAsync
  decodeAsync(data, {palette: PALETTE_ANSI_256, memoryLimit: 65536 * 20})
  .then(result => {
    // transfer bitmap data to ImageData object
    const imageData = createImageData(result.width, result.height);
    new Uint32Array(imageData.data.buffer).set(result.data32);

    // draw ImageData to canvas
    const canvas = createCanvas(result.width, result.height);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    // write to some file and show it
    const targetFile = __dirname + '/node_decode_output.png';
    const out = fs.createWriteStream(targetFile);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    out.on('finish', () => open(targetFile));
  });
})
