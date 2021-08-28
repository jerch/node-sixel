## Sixel images in Javascript.

SIXEL image decoding / encoding library for node and the browser.


### Decoding

For decoding the library provides two decoder classes with slightly different semantics.


#### DefaultDecoder

The `DefaultDecoder` is a general purpose decoder written in Typescript. It can decode level1 and level2
SIXEL data with reasonable speed and without any further preparations. It currently only supports _printerMode_(_terminalMode_ with proper shared/private palette semantics is planned).

Properties of `DefaultDecoder`:

- `constructor(public fillColor: RGBA8888 = DEFAULT_BACKGROUND, public palette: RGBA8888[] = PALETTE_VT340_COLOR, public paletteLimit: number = 65536)`  
    Creates a new SIXEL image. The optional `fillColor` (default black) is used to fill
    "holey pixels" with a background color during pixel transfer in `toPixelData`. Set `palette` to the
    terminal's default colors (defaults to 16 VT340 colors). `paletteLimit` can be used to restrict the color registers.

- `width: number`  
    Pixel width of the image. Updates during `decode`. Other than stated in the SIXEL specification (DEC STD 070)
    a width from raster attributes takes precedence, thus if a SIXEL data stream contains raster attributes
    with a valid horizontal extend, width will always be set to this value, even for half transmitted images.
    Also overlong sixel bands (a row of 6 vertical pixels) will be stripped to the raster attribute width.
    If no raster attributes were transmitted (used in earlier SIXEL variant) width will be set to the longest sixel band width found.

- `height: number`  
    Pixel height of the image. Updates during `decode`. Height is either set from a valid vertical extend in
    raster attributes, or grows with the number of sixel bands found in the data stream (number of bands * 6).
    Raster attributes again have precedence over number of bands (also see `width`).

- `realWidth: number`  
    Other than `width` contains the real width of image data derived from longest SIXEL band found. For spec conform output use this.

- `realHeight: number`  
    Contains the real height of the image data, which might be greater or lesser than `height`. For spec conform output use this.

- `rasterWidth: number`  
    Contains width from raster attributes. 0 if no raster attributes were found.

- `rasterHeight: number`  
    Contains height from raster attributes. 0 if no raster attributes were found.

- `rasterRatioNumerator: number` & `rasterRatioDenominator: number`  
    Contains the pixel ratio numerator and denominator given by raster attributes. Note that `toPixelData` does not evaluate these settings and always assumes 1:1.

- `fillColor: RGBA8888`  
    Number respresenting the background fill color. A value of 0 will leave background pixels untouched.
    The number depends on endianess of the architecture, create it with `toRGBA8888(r, g, b, a)`.

- `memoryUsage: number`  
    Get current memory usage of the image data in bytes. Can be used to restrict image handling if memory is limited.  
    Note: This only accounts the image pixel data storage, the real value will be slightly higher due to some JS object overhead.

- `decode(data: UintTypedArray, start: number = 0, end: number = data.length): void`  
    Decodes SIXEL bytes and updates the image data. This is done as a stream,
    therefore it is possible to grab partly transmitted images (see "Simulate slow chunks" in browser example).
    `data` can be any array like type with single byte values per index position.  
    Note: Normally SIXEL data is embedded in a DCS escape sequence. To properly handle the full sequence with introducer
    and finalizer you should to use an escape sequence parser (like `node-ansiparser` or the parser found in `xterm.js`).
    Note that this method is only meant for the data part of a SIXEL sequence (also see example `node_example_decode_full_sequence.js`).

- `decodeString(data: string, start: number = 0, end: number = data.length): void`  
    Same as `decode` but with string data instead. For better performance use `decode`.

- `toPixelData(target: Uint8ClampedArray, width: number, height: number, dx: number = 0, dy: number = 0, sx: number = 0, sy: number = 0, swidth: number = this.width, sheight: number = this.height, fillColor: RGBA8888 = this.fillColor): Uint8ClampedArray`  
    Writes pixel data to pixel array `target`. A pixel array can be obtained from `ImageData.data`, e.g. from a canvas.
    `width` and `height` must contain the full dimension of the target. Use `dx`, `dy` (offset in target) and
    `sx`, `sy` (offset in source) and `swidth`, `sheight` (area in source) for cropping/clipping. `fillColor` has the same
    meaning as in the constructor, explicit setting it to 0 will leave non encoded pixels unaltered (pixels, that were not colored in the SIXEL data). This can be used for a transparency like effect (background/previous pixel value will remain). Returns the altered `target`.


### Encoding

For encoding the library provides the following properties:

- `image2sixel(data: Uint8Array | Uint8ClampedArray, width: number, height: number, maxColors: number = 256,backgroundSelect: 0 | 1 | 2 = 0): string`  
    Convenient function to create a full SIXEL escape sequence for given image data (note this is still alpha).

    Quantization is done by the internal quantizer, with dithering on 4 neighboring pixels for speed reasons, which works great for real pictures to level out hard color plane borders, but might show moiré or striping artefacts on color gradients. Currently the dithering is not configurable, resort to custom quantizer library in conjunction with `sixelEncode` if you observe dithering issues.

- `sixelEncode(data: Uint8ClampedArray | Uint8Array, width: number, height: number, palette: RGBA8888[] | RGBColor[], rasterAttributes: boolean = true): string`  
    Encodes pixel data to a SIXEL string. `data` should be an array like type with RGBA pixel data. `width` and `height` must contain the pixel dimension of `data`. `palette` should contain the used colors in `data` and must not be empty. To avoid poor output quality consider using a quantizer with dithering and palette creation before converting to SIXEL. See `node_example_encode.js` for an example usage in conjunction with `rgbquant`.
    For transparency only an alpha value of 0 will be respected as fully transparent, other alpha values are set to fully opaque (255). Transparent pixels will be colored by the terminal later on depending on the `backgroundSelect` setting of the introducer.  
    Note: Some terminals have strict palette limitations, in general the palette should not contain more than 256 colors.

- `introducer(backgroundSelect: number = 0): string`  
    Creates the escape sequence introducer for a SIXEL data stream.
    This should be written to the terminal before any SIXEL data.  
    `backgroundSelect` is a hint for the terminal how to deal with uncolored pixels:

    - 0 - device default action (most terminals will apply background color)
    - 1 - no action (previous pixel value at output position should remain)
    - 2 - set to background color (device dependent)

- `FINALIZER: string`  
    Finalizes the SIXEL escape sequence. Write this, when the SIXEL data stream has ended.
    Note that a SIXEL escape sequences changes the operation mode of a terminal,
    forgetting the finalizer might leave the terminal in an unrecoverable state.


### Convenient Properties

Furthermore the library exposes some convenient properties:

- `function toRGBA8888(r: number, g: number, b: number, a: number = 255): RGBA8888`  
    Converts the RGBA channel values to the native color type `RGBA8888`.

- `function fromRGBA8888(color: RGBA8888): number[]`  
    Converts the native color to an array of [r, g, b, a].

- `PALETTE_VT340_COLOR: RGBA8888[]`  
    16 color palette of VT340.

- `PALETTE_VT340_GREY: RGBA8888[]`  
    16 monochrome palette of VT340.

- `PALETTE_ANSI_256: RGBA8888[]`  
    256 ANSI color palette derived from xterm.


### Installation
Install the library with `npm install sixel`.

### Examples and browser demo
See the example files for decoding/encoding in nodejs. Note that the examples and the browser demo are not part
of the npm package, clone the repo and run `npm install` if you want to see them in action.

Decoding can also be tested in the browser after `npm start` under `localhost:8080`.

Encoding can be tested in a SIXEL capable terminal with `img2sixel.js`, e.g.
```
$> node img2sixel.js -p16 http://leeoniya.github.io/RgbQuant.js/demo/img/bluff.jpg
```

## Benchmarks
Performance is measured for typical actions based on 9-bit palette image:
![test image](palette.png "test image")

The test image repeats the palette image 6 times to form a 640x480 image with 512 colors. The unusual (and not spec conform) high number of colors was chosen to explicit test for this as an upper bound.

Results:
```
   Context "./lib/index.benchmark.js"
      Context "testimage"
         Context "pixel transfer"
            Case "toPixelData - with fillColor" : 20 runs - average runtime: 1.42 ms
            Case "toPixelData - without fillColor" : 20 runs - average runtime: 1.12 ms
         Context "decode (DefaultDecoder)"
            Case "decode" : 20 runs - average runtime: 4.34 ms
            Case "decodeString" : 20 runs - average runtime: 4.62 ms
            Case "decode + pixel transfer" : 20 runs - average runtime: 3.39 ms
         Context "decode (WasmDecoder)"
            Case "decode" : 20 runs - average runtime: 1.35 ms
            Case "decodeString" : 20 runs - average runtime: 1.81 ms
         Context "encode"
            Case "sixelEncode" : 20 runs - average runtime: 25.10 ms
      Context "decode - testfiles (DefaultDecoder)"
         Case "test1_clean.sixel" : 20 runs - average runtime: 16.75 ms
         Case "test1_clean.sixel" : 20 runs - average throughput: 37.70 MB/s
         Case "test2_clean.sixel" : 20 runs - average runtime: 7.23 ms
         Case "test2_clean.sixel" : 20 runs - average throughput: 45.48 MB/s
         Case "sampsa_reencoded_clean.six" : 20 runs - average runtime: 16.53 ms
         Case "sampsa_reencoded_clean.six" : 20 runs - average throughput: 39.57 MB/s
         Case "FullHD 12bit noise" : 20 runs - average runtime: 228.52 ms
         Case "FullHD 12bit noise" : 20 runs - average throughput: 67.84 MB/s
      Context "decode - testfiles (WasmDecoder)"
         Case "test1_clean.sixel" : 20 runs - average runtime: 9.99 ms
         Case "test1_clean.sixel" : 20 runs - average throughput: 61.25 MB/s
         Case "test2_clean.sixel" : 20 runs - average runtime: 4.16 ms
         Case "test2_clean.sixel" : 20 runs - average throughput: 76.79 MB/s
         Case "sampsa_reencoded_clean.six" : 20 runs - average runtime: 10.54 ms
         Case "sampsa_reencoded_clean.six" : 20 runs - average throughput: 61.23 MB/s
         Case "FullHD 12bit noise" : 20 runs - average runtime: 100.77 ms
         Case "FullHD 12bit noise" : 20 runs - average throughput: 153.86 MB/s
```
`WasmDecoder` is roughly 1.5x - 2.3x faster than `DefaultDecoder`.
TODO...



### Decoder usage

For casual usage and when you have the full image data at hand,
you can use the convenient functions `decode` or `decodeAsync`.

_Example (Typescript):_
```typescript
import { decode, decodeAsync, ISixelDecoderOptions } from 'sixel';

// some options
const OPTIONS: ISixelDecoderOptions = {
    memoryLimit: 65536 * 256, // limit pixel memory to 16 MB (2048 x 2048 pixels)
    ...
};

// in nodejs or web worker context
const result = decode(some_data, OPTIONS);
someRawImageAction(result.data32, result.width, result.height);

// in browser main context
decodeAsync(some_data, OPTIONS)
  .then(result => someRawImageAction(result.data32, result.width, result.height));
```

These functions are much easier to use than the stream decoder,
but come with a performance penalty of ~25% due to bootstrapping into
the wasm module everytime. Do not use them, if you have multiple images to decode.
Also they cannot be used for chunked data.

For more advanced use cases with multiple images or chunked data,
use the stream decoder directly.

_Example (Typescript):_
```typescript
import { Decoder, DecoderAsync, ISixelDecoderOptions } from 'sixel';

// some options
const OPTIONS: ISixelDecoderOptions = {
    memoryLimit: 65536 * 256, // limit pixel memory to 16 MB (2048 x 2048 pixels)
    ...
};

// in nodejs or web worker context
const decoder = new Decoder(OPTIONS);
// in browser main context
const decoder = DecoderAsync(OPTIONS);

for (image of images) {
    // initialize for next image with defaults
    // for a more terminal like behavior you may want to override default settings
    // with init arguments, e.g. set fillColor to BG color / reflect palette changes
    decoder.init();

    // for every incoming chunk call decode
    for (chunk of image.data_chunks) {
        decoder.decode(chunk);
        // optional: check your memory limits
        if (decoder.memoryUsage > YOUR_LIMIT) {
        // the decoder is meant to be resilient for exceptional conditions
        // and can be re-used after calling .release (if not, please file a bug)
        // (for simplicity example exists whole loop)
        decoder.release();
        throw new Error('dont like your data, way too big');
        }
        // optional: grab partial data (useful for slow transmission)
        somePartialRawImageAction(decoder.data32, decoder.width, decoder.height);
    }

    // image finished, grab pixels and dimensions
    someRawImageAction(decoder.data32, decoder.width, decoder.height);

    // optional: release held pixel memory
    decoder.release();
}
```


__Note on decoder memory handling__

The examples above all contain some sort of memory limit notions. This is needed,
because sixel image data does not strictly announce dimensions upfront,
instead incoming data may implicitly expand image dimensions. While the decoder already
limits the max width of an image with a compile time setting,
there is no good way to limit the height of an image (can run "forever").

To not run into out of memory issues the decoder respects an upper memory limit for the pixel array.
The default limit is set rather high (hardcoded to 128 MB) and can be adjusted in the decoder options
as `memoryLimit` in bytes. You should always adjust that value to your needs.

During chunk decoding the memory usage can be tracked with `memoryUsage`. Other than `memoryLimit`,
this value also accounts the static memory taken by the wasm module, thus is slightly higher and
closer to the real usage of the decoder. Note that the decoder will try to pre-allocate the pixel array,
if it can derive the dimensions early, thus `memoryUsage` might not change anymore for subsequent
chunks after an initial jump. If re-allocation is needed during decoding, the decoder will hold up to twice
of `memoryLimit` for a short amount of time.

During decoding the decoder will throw an error, if the needed pixel memory exceeds `memoryLimit`.

Between multiple images the decoder will not free the pixel memory of the previous image.
This is an optimization to lower allocation and GC pressure of the decoder.
Call `release` after decoding to explicitly free the pixel memory.

Rules of thumb regarding memory:
- set `memoryLimit` to a more realistic value, e.g. 64MB for 4096 x 4096 pixels
- conditionally call `release` after image decoding, e.g. check if  `memoryUsage` stays within your expectations
- under memory pressure set `memoryLimit` rather low, always call `release`


### Encoder usage

TODO...


### Package format and browser bundles

The node package comes as CommonJS and can be used as usual.
An ESM package version is planned for a later release.

For easier usage in the browser the package contains several prebuilt bundles under `/dist`:
- decode - color functions, default palettes and decoder
- encode - color functions, default palettes and encoder
- full - full package containing all definitions.

The browser bundles come in UMD and ESM flavors. Note that the UMD bundles export
the symbols under `sixel`.

Some usage examples:
- vanilla usage with UMD version:
  ```html
  <script nomodule src="/path/to/decode.umd.js"></script>
  ...
  <script>
    sixel.decodeAsync(some_data)
      .then(result => someRawImageAction(result.data32, result.width, result.height));
  </script>
  ```
- ESM example:
  ```html
  <script type="module">
    import { decodeAsync } from '/path/to/decode.esm.js';

    decodeAsync(some_data)
      .then(result => someRawImageAction(result.data32, result.width, result.height));

    // or with on-demand importing:
    import('/path/to/decode.esm.js')
      .then(m => m.decodeAsync(some_data))
      .then(result => someRawImageAction(result.data32, result.width, result.height));
  </script>
  ```
- web worker example:
  ```js
  importScripts('/path/to/decode.umd.js');

  // in web worker we are free to use the sync variants:
  const result = sixel.decode(some_data);
  someRawImageAction(result.data32, result.width, result.height);
  ```


### Status
Currently beta, still more tests to come. Also the API might still change.


### References

While being quite common in the DEC ecosystem in the 80s (even used for printer protocols), SIXEL references are very limited these days. The closest to a specification we have can be found in the Video Systems Reference Manual ([DEC STD 070](http://www.bitsavers.org/pdf/dec/standards/EL-SM070-00_DEC_STD_070_Video_Systems_Reference_Manual_Dec91.pdf#page=908), p. 908-933). Also see [Sixel Graphics](https://www.vt100.net/docs/vt3xx-gp/chapter14.html) on vt100.net, which gives a quick overview. For implementation the old usenet article "[All About SIXELs](https://www.digiater.nl/openvms/decus/vax90b1/krypton-nasa/all-about-sixels.text)" was very helpful.