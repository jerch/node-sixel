
## Sixel band decoder


__Features__:
- written in C
- allocation free (single instance static memory)
- crafted for web assembly / emscripten
- also embeddable in native code
- quite fast (decoding throughput >150 MB/s)
- small wasm binary (~11 kB)
- small memory footprint (<<1 MB, depending on `MAX_WIDTH`)


### Note on WASM features

Currently wasm engines differ alot in supported wasm features.
To still support a wide variety of engines, this module is coded in vanilla C and
only uses the `bulk-memory` feature (optionally).


### Note on native usage

The decoder can be used from other native C/C++ projects by simply including `decoder.cpp`.
Still for native embedding there are a few things to consider first:

- single instance / static memory  
  The parser state is a single statically allocated struct. While this is a perfect fit
  for isolated wasm module instances, it is prolly not what you want in a C or C++ project,
  unless for a simple cmdline converter tool. Without code modifications decoding is limited
  to one parser state / one image at a time. (This is easy fixable by introducing
  state indirections at the function interfaces, but beyond the scope here.)

- code optimizations  
  The decoder loop is a highly optimized byte-by-byte loop in vanilla C.
  While this also runs fast natively, things like SIMD extensions would give
  another quite remarkable boost, but do not work reliable in wasm yet.


### Future optimization ideas

- wasm-SIMD, currently engines have no to lousy support with bad performance
  (see dysfunctional proof of concept in `decoder-simd.cpp`)
- shared memory, currently shifting too much in browsers
- wasm-threading, still not fully landed in wasm, depends on stable shared memory interfaces


### Interface

To use the decoder from other non javascript wasm environments or natively,
you gonna need to hook into the following API.
For reference usage and how to build a full image decoder from the sixel band handling,
see the implementation for javascript under `src/WasmDecoder.ts`.

Important compile time settings (see build.sh to adjust):
 - `CHUNK_SIZE`     - max amount of chunk bytes
 - `PALETTE_SIZE`   - max colors in the palette
 - `MAX_WIDTH`      - max band width (excess pixels to the right are truncated)

Exported symbols:
 - `void* get_state_address()`  
    Void pointer to the static `ParserState` struct in WASM memory.\
    Properties of interest (indexed in 32bit):
    - 1:  fill color as ABGR32 (as given by `init`)
    - 2:  width+4 in M2, else 0
    - 3:  height in M2, else 0
    - 4:  raster numerator (unmodified) in M2, else 0
    - 5:  raster denominator (unmodified) in M2, else 0
    - 6:  raster width (unmodified) in M2, else 0
    - 7:  raster height (unmodified)in M2, else 0
    - 8:  truncate (as given by `init`)
    - 9:  image level (L0 - undecided, L1 - level 1, L2 - level 2)
    - 10: operation mode (M0 - undecided, M1 - level 1/2 !truncate, M2 - level 2 truncating)
    - 11: palette length
 - `void* get_chunk_address()`  
    Void pointer to `ParserState.chunk` byte array (max size of `CHUNK_SIZE`).
    Used to load image data to be processed by `decode`.
 - `void* get_p0_address()`  
    Void pointer to first pixel line p0 the band. The other pixel lines p1 - p5
    start at `get_p0_address() + (MAX_WIDTH + 4) * line_idx`.
    Used to grab pixel data when a band was finished.
 - `void* get_palette_address()`  
    Void pointer to `ParserState.palette` ABGR32 array (max size of `PALETTE_SIZE`).
    Used to read/write palette colors.
 - `void init(int fill_color, unsigned int palette_limit, int truncate)`  
    Initialize decoder for new image. Must be called before any decoding happens.
 - `void decode(int start, int end)`  
    Decode data loaded into `ParserState.chunk[start .. end]` (right exclusive).
 - `int current_width()`  
    Return the cursor advance of the current band in M1 mode, or width in M2 mode.
    This is needed to properly construct the full image at the end of decoding,
    in case the data did not finish with LF.

Needed callbacks:
 - `int mode_parsed(int mode)`  
    Called once early during decoding when the parser settled the operation mode.
    The operation mode will be settled by the decoder on reading a valid raster
    attributes command or any other sixel command or sixel data bytes.
    Used to announce the operation mode and potential raster attributes for
    further preparation steps.
    Return 0 to continue, 1 to abort further processing.
 - `int handle_band(int width)`  
    Called upon finishing decoding of a sixel band (on LF). `width` is either the
    raster width (M2 mode), or the max cursor advance (both clamped to `maxWidth`).
    Used to copy pixel in p0 .. p5, before continuing with the next band.
    Return 0 to continue, 1 to abort further processing.


### Note on SIXEL handling

- The data to be digested by this decoder should only be the "Picture Definition" part of a SIXEL
  escape sequence, as denoted by the spec. Any other data byond that is likely to screw up
  the image creation. In particular this means, that the decoder should run behind
  a terminal escape sequence, that is capable of proper DEC style DCS parsing
  (also handling spurious ESC, SUB and C1 codes).
- Raster or pixel ratio definitions are not dealt with beside width and height (if `truncate` is set).
  Raster attributes are exposed unmodified in 0 .. 2^31-1 (mirrored as read from data),
  and can be used to postprocess pixel data as needed.
- With `truncate` set in `init`, the decoder will truncate the image to given raster dimensions.
  This does not apply to level 1 images without any raster attributes. While truncation to
  raster dimensions on decoder side is not spec-conform, it is the expected data format created by
  a spec-conform encoder.
- If `truncate` is not set, the width will be derived from cursor advance to the right, clamped
  to `MAX_WIDTH-4`. In this mode, the height is always reported in terms of multiple of 6
  (pixel height of a sixel band). Furthermore in this mode the height is not limited by any means,
  thus decoding may run forever. Use some sort of accounting during `handle_band` to spot
  malformed data or excessive memory usage, especially when dealing with data streams.
- Sixels are translated to a color value immediately, there is currently no palette-indexed mode.
  While this is in line with the spec, it does not allow to mimick older terminals with their
  shared palette idea. (There is an open issue for this, still unsure whether to implement that
  inferior mode.)
- The decoder unconditionally strips the 8th bit, mapping all data bytes in 7-bit space.
  While the spec defines this only as error recovery strategy for GR codes, the decoder also does this
  for C1, which might lead to sixel command interpretation from spurious C1 codes. Note that C1
  never should appear in sixel data, if used behind a proper escape sequence parser.
- Other than stated in the spec, the decoder does not error on low C0 codes, instead silently ignores them.
  Again a proper escape sequence parser will filter / act upon those.
- In a previous version, sixel repeat was allowed to stack, e.g. '!200!200a' would be equivalent
  to '!400a'. This not the case anymore, as the spec states, that a start of a sixel command will
  cancel a pending repeat count. Note that this not in line with VT240 behavior (used to create
  stacking repeats like '!255!255...').
- The repeat count gets not limited/clamped to 32767. The digits are parsed in signed int32 for
  performance reasons, and converted to unsigned before used as repeat count. While the counter
  will show weird behavior above 2^31-1 (counting backwards), it should not possible to overflow
  the pixel arrays with malicious data (separately tested against `MAX_WIDTH` before any painting).

There are probably more deviations from the SIXEL spec not listed here.


### Open issues:
- to be fixed: '!0' will not output any pixels or advance the cursor, while it should equal to
  a repeat count of 1.
- undecided: true shared palette mode for terminals
- undecided: establish some real height accounting for M1
  

### Status

Beta. The code is tested with unit/regression tests from the JS integration.
