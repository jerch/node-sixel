const { SixelImage } = require('./lib/index');
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
  // decode from file
  const image = new SixelImage();
  image.write(data);

  // insert a new line in terminal
  // bug with boticelli image - jumps one line up in xterm?
  console.log();

  // write SIXEL DCS sequence introducer
  console.log(SixelImage.introducer(1));
  try {
    // encode to SIXEL data and write to output
    console.log(image.toSixelString());
    // or with bytes (~20% faster)
    // image.toSixelBytes(chunk => process.stdout.write(chunk));
  } finally {
    // never forget the finalizer or the terminal will "hang"
    console.log(SixelImage.finalizer());
  }
})
