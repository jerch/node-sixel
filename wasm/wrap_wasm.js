const fs = require('fs');

const wasmData = JSON.stringify({
  chunkSize: parseInt(process.argv[2]),
  canvasSize: parseInt(process.argv[3]),
  paletteSize: parseInt(process.argv[4]),
  bytes: fs.readFileSync('sixel.wasm').toString('base64')
});

// also overwrite src target in case a bundler pulls from TS source folders
fs.writeFileSync('../lib/wasm.json', wasmData);
fs.writeFileSync('../src/wasm.json', wasmData);
