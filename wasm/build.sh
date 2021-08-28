#!/bin/bash

#################################
# compile time decoder settings #
#################################

# EMSCRIPTEN_PATH
# Path to emscripten SDK.
# Change this if you have emscripten already installed somewhere
# and/or dont want to use the auto installation.
# (auto install script is under bin/install_emscripten.sh)
EMSCRIPTEN_PATH=../emsdk/emsdk_env.sh

# CHUNK_SIZE
# Maximum size of a single chunk, that can be loaded into the decoder.
# This has only a tiny impact on the decoder speed, thus we can go with
# a rather low value (aligned with typical PIPE_BUF values).
# Use one of 2 ^ (8 .. 16).
CHUNK_SIZE=16384

# PALETTE_SIZE
# Maximum color slots the internal palette may hold.
# Most SIXEL images never request more than 256 colors (demanded by the spec).
# We use a much higher default of 4096, thus can deal up to 12bit-RGB.
# Use one of 2 ^ (8 .. 16).
PALETTE_SIZE=4096

# MAX_WIDTH
# Maximum width of a pixel line the decoder can handle.
# Changing this will also change the memory needs below.
MAX_WIDTH=16384

# MEMORY
# Memory used by an instance. Formula is roughly MAX_WIDTH * 4 * 6 + 65536.
MEMORY=$((7 * 65536))

##################
# compile script #
##################


# activate emscripten env
source $EMSCRIPTEN_PATH

# compile with customizations
emcc -O3 \
-DCHUNK_SIZE=$CHUNK_SIZE \
-DPALETTE_SIZE=$PALETTE_SIZE \
-DMAX_WIDTH=$MAX_WIDTH \
-s ASSERTIONS=0 \
-s IMPORTED_MEMORY=0 \
-s MALLOC=none \
-s ALLOW_MEMORY_GROWTH=0 \
-s SAFE_HEAP=0 \
-s WARN_ON_UNDEFINED_SYMBOLS=0 \
-s ERROR_ON_UNDEFINED_SYMBOLS=0 \
-s DISABLE_EXCEPTION_CATCHING=1 \
-s DEFAULT_TO_CXX=0 \
-s STRICT=1 \
-s SUPPORT_ERRNO=0 \
-s TOTAL_STACK=0 \
-s INITIAL_MEMORY=$MEMORY \
-s MAXIMUM_MEMORY=$MEMORY \
-s EXPORTED_FUNCTIONS='[
  "_init",
  "_decode",
  "_current_width",
  "_get_state_address",
  "_get_chunk_address",
  "_get_p0_address",
  "_get_palette_address"
]' \
--no-entry -mbulk-memory decoder.cpp -o decoder.wasm

# export compile time settings with settings.json
echo "{\"CHUNK_SIZE\": $CHUNK_SIZE, \"PALETTE_SIZE\": $PALETTE_SIZE, \"MAX_WIDTH\": $MAX_WIDTH}" > settings.json


# SIMD test
#emcc -O3 \
#-DCHUNK_SIZE=$CHUNK_SIZE \
#-DPALETTE_SIZE=$PALETTE_SIZE \
#-DMAX_WIDTH=$MAX_WIDTH \
#-s ASSERTIONS=0 \
#-s IMPORTED_MEMORY=0 \
#-s MALLOC=none \
#-s ALLOW_MEMORY_GROWTH=0 \
#-s SAFE_HEAP=0 \
#-s WARN_ON_UNDEFINED_SYMBOLS=0 \
#-s ERROR_ON_UNDEFINED_SYMBOLS=0 \
#-s DISABLE_EXCEPTION_CATCHING=1 \
#-s DEFAULT_TO_CXX=0 \
#-s STRICT=1 \
#-s SUPPORT_ERRNO=0 \
#-s TOTAL_STACK=0 \
#-s INITIAL_MEMORY=$((145 * 65536)) \
#-s MAXIMUM_MEMORY=$((145 * 65536)) \
#-s EXPORTED_FUNCTIONS='[
#  "_init",
#  "_decode",
#  "_get_chunk_address",
#  "_get_canvas_address",
#  "_get_palette_address"
#]' \
#--no-entry -msimd128 -msse -msse2 -msse4.1 decoder-simd.cpp -o decoder-simd.wasm
