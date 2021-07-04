#!/bin/bash

#################################
# compile time decoder settings #
#################################

# EMSCRIPTEN_PATH
# Path to your emscripten SDK.
EMSCRIPTEN_PATH=../../../playground/emsdk/emsdk_env.sh

# CHUNK_SIZE
# Maximum size of a single chunk, that can be loaded into the decoder.
# This has only a tiny impact on the decoder speed, thus we can go with
# a rather low value (aligned with typical PIPE_BUF values).
# Use one of 2 ^ (12 .. 16).
CHUNK_SIZE=4096

# CANVAS_SIZE
# Maximum amount of pixels the internal canvas can hold.
# This value has a huge impact on the allocated static memory,
# as every pixels is stored as RGBA32. Therefore thus the default is choosen
# to deal with images up to FullHD (~10 MB memory per decoder instance).
CANVAS_SIZE=$((1536 * 1536))

# PALETTE_SIZE
# Maximum color slots the internal palette can hold.
# Most SIXEL images never have more than 256 (demanded by the spec).
# We use a much higher default of 4096, thus can deal up to 12bit-RGB.
# Use one of 2 ^ (8 .. 16).
PALETTE_SIZE=4096

# INITIAL_MEMORY
# This is the total memory the wasm instance will occupy.
# Always adjust this after changes to values above.
# If not enough memory was given, emscripten will throw a linking error.
# This can be used to spot the real usage and round it up to the next 64KiB multiple.
INITIAL_MEMORY=$((145 * 65536))




##################
# compile script #
##################

cd wasm

# activate emscripten env
source $EMSCRIPTEN_PATH

# compile with customizations
emcc -O3 \
-DCHUNK_SIZE=$CHUNK_SIZE \
-DCANVAS_SIZE=$CANVAS_SIZE \
-DPALETTE_SIZE=$PALETTE_SIZE \
-s ASSERTIONS=0 \
-s SUPPORT_ERRNO=0 \
-s TOTAL_STACK=16384 \
-s MALLOC=none \
-s INITIAL_MEMORY=$INITIAL_MEMORY \
-s MAXIMUM_MEMORY=$INITIAL_MEMORY \
-s EXPORTED_FUNCTIONS='[
  "_init",
  "_decode",
  "_get_chunk_address",
  "_get_canvas_address",
  "_get_palette_address"
]' \
--no-entry decoder.cpp -o sixel.wasm

# wrap wasm bytes into JSON file
node wrap_wasm.js $CHUNK_SIZE $CANVAS_SIZE $PALETTE_SIZE
