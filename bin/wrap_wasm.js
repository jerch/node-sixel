const fs = require('fs');
const LIMITS = require('../wasm/settings.json');

const file = `
export const LIMITS = {
  CHUNK_SIZE: ${LIMITS.CHUNK_SIZE},
  PALETTE_SIZE: ${LIMITS.PALETTE_SIZE},
  MAX_WIDTH: ${LIMITS.MAX_WIDTH},
  BYTES: '${fs.readFileSync('wasm/decoder.wasm').toString('base64')}'
};
`;
fs.writeFileSync('src/wasm.ts', file);
