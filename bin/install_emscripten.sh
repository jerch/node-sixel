#!/bin/bash

if [ -d emsdk ]; then
  exit 0
fi

# pull emscripten on fresh checkout
echo "Fetching emscripten..."

git clone https://github.com/emscripten-core/emsdk.git
cd emsdk

# wasm module is only tested with 2.0.25, install by default
./emsdk install 2.0.25
./emsdk activate 2.0.25

cd ..
