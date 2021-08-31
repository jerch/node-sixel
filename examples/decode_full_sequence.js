const { toRGBA8888, Decoder } = require('../lib/index');
const { createCanvas, createImageData } = require('canvas');
const fs = require('fs');
const open = require('open');
const AnsiParser = require('node-ansiparser');

// create a sixel decoder instance (sync version, use DecoderAsync in browser main)
const decoder = new Decoder();

/**
 * Despite the other decode examples we use the normal testfiles here
 * with full DCS sequences. For parsing of the escape sequence we can use `node-anisparser`.
 * 
 * Note that `node-ansiparser` works only with strings, thus we have to set 'utf-8' as file encoding
 * (and use `decodeString` later on). This will not work with all testfiles,
 * some of them have 8bit control characters that get stripped/scrambled with 'utf-8'.
 */
fs.readFile('testfiles/boticelli.six', 'utf-8', (err, data) => {

  // terminal object needed for the sequence parser
  // we are only interested in the DCS calls, thus skip the other methods
  const terminal = {
    // some background color (red to make the effect obvious)
    backgroundColor: toRGBA8888(255, 0, 0, 255),

    // some state to determine whether DCS payload should go to sixel image
    // the state is needed since the input might contain other non DCS sequences
    // that should not be treated as SIXEL data
    inSixel: false,

    // inst_H: called whan a DCS sequence starts
    inst_H(collected, params, flag) {
      // q means incoming SIXEL DCS, thus create new SIXEL image
      if (flag === 'q') {
        // also eval params of the sequence, P2 is backgroundSelect
        // if set to 1 we should set fillColor to 0 (leave transparent)
        // else set to background color from the terminal
        // hint: try changing the test file or the color to see the effect of this setting

        // init a new image (null for `palette` means to keep the current loaded one)
        decoder.init(params[1] === 1 ? 0 : this.backgroundColor, null, 256);
        this.inSixel = true;
      }
    },

    // inst_P: called for DCS payload chunks
    inst_P(chunk) {
      if (this.inSixel) {
        decoder.decodeString(chunk);
      }
    },

    // inst_U: called when DCS sequence finishs
    inst_U() {
      if (this.inSixel) {
        this.inSixel = false;

        // we were actually in a SIXEL DCS sequence
        // and have now all image data received, thus
        // can continue image handling:

        // transfer bitmap data to ImageData object
        const imageData = createImageData(decoder.width, decoder.height);
        new Uint32Array(imageData.data.buffer).set(decoder.data32);

        // draw ImageData to canvas
        const canvas = createCanvas(decoder.width, decoder.height);
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);

        // write to some file and show it
        const targetFile = __dirname + '/node_decode_full_sequence_output.png';
        const out = fs.createWriteStream(targetFile);
        const stream = canvas.createPNGStream();
        stream.pipe(out);
        out.on('finish', () => open(targetFile));

        // free ressources on sixel decoder
        decoder.release();
      }
    }
  };

  // create sequence parser and parse the file data
  const parser = new AnsiParser(terminal);
  parser.parse(data);
})
