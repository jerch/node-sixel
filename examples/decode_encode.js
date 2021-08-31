const { introducer, FINALIZER, sixelEncode, decode } = require('../lib/index');
const fs = require('fs');

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
fs.readFile('testfiles/biplane_clean.six', (err, data) => {

  // decoding with sync version (does not work in browser main, use decodeAsync there)
  const img = decode(data);

  // extract colors
  const palette = new Set();
  for (let i = 0; i < img.data32.length; ++i) {
    palette.add(img.data32[i]);
  }

  // encode to sixel again
  const sixelData = sixelEncode(
    new Uint8Array(img.data32.buffer),
    img.width,
    img.height,
    Array.from(palette)
  );

  // write to sixel capable terminal
  // `sixelEncode` gives us only the sixel data part,
  // to get a full sequence, we need to add the introducer and the finalizer
  // (never forget the finalizer or the terminal will "hang")
  console.log(introducer(1) + sixelData + FINALIZER);
})
