## Sixel images in Javascript.

SIXEL image decoding / encoding library for node and the browser.

The library provides a class `SixelImage` with the following properties:

- `constructor(fillColor: RGBA8888 = DEFAULT_BACKGROUND)`  
    Creates a new SIXEL image. The optional `fillColor` (default black) is used to fill
    "holey pixels" with a background color during pixel transfer in `toImageData`.

- `width: number`  
    Pixel width of the image. Updates during `write`. Other than stated in the SIXEL specification (DEC STD 070)
    a width from raster attributes takes precedence, thus if a SIXEL data stream contains raster attributes
    with a valid horizontal extend, width will always be set to this value, even for half transmitted images.
    Also overlong sixel bands (a row of 6 vertical pixels) will be stripped to the raster attribute width.
    (band data beyond width is not accessible anymore later on). If no raster attributes were transmitted
    (used in earlier SIXEL variant) width will be set to the longest sixel band width found.

- `height: number`  
    Pixel height of the image. Updates during `write`. Height is either set from a valid vertical extend in
    raster attributes, or grows with the number of sixel bands found in the data stream (number of bands * 6).
    Raster attributes again have precedence over number of bands (band data beyond height is not
    accessible anymore later on, also see `width`).

- `fillColor: RGBA8888`  
    Number respresenting the background fill color. A value of 0 will leave background pixels untouched.
    The number depends on endianess of the architecture, create it with `toRGBA8888(r, g, b, a)`.

- `memoryUsage: number`  
    Get current memory usage of the image data in bytes. Can be used to restrict image handling if memory is limited.  
    Note: This only accounts the image pixel data storage, the real value will be slightly higher due to some JS object overhead.

- `write(data: UintTypedArray, start: number = 0, end: number = data.length): void`  
    Decodes SIXEL bytes and updates the image data. This is done as a stream,
    therefore it is possible to grab partly transmitted images (see "Simulate slow chunks" in browser example).
    `data` can be any array like type with single byte values per index position.  
    Note: Normally SIXEL data is embedded in a DCS escape sequence. To properly handle the full sequence with introducer
    and finalizer you should to use an escape sequence parser (like `node-ansiparser` or the parser found in `xterm.js`).
    The `write` method of `SixelImage` is only meant for the data part
    (also see example `node_example_decode_full_sequence.js`).

- `writeString(data: string, start: number = 0, end: number = data.length): void`  
    Same as `write` but with string data instead. For better performance use `write`.

- `toImageData(target: Uint8ClampedArray, width: number, height: number, dx: number = 0, dy: number = 0, sx: number = 0, sy: number = 0, swidth: number = this.width, sheight: number = this.height, fillColor: RGBA8888 = this.fillColor): Uint8ClampedArray`  
    Writes pixel data to pixel array `target`. A pixel array can be obtained from `ImageData.data`, e.g. from a canvas.
    `width` and `height` must contain the full dimension of the target. Use `dx`, `dy` (offset in target) and
    `sx`, `sy` (offset in source) and `swidth`, `sheight` (area in source) for cropping/clipping. `fillColor` has the same
    meaning as in the constructor, explicit setting it to 0 will leave non encoded pixels unaltered (pixels, that were not colored in the SIXEL data). This can be used for a transparency like effect (background/previous pixel value will remain). Returns the altered `target`.

- `toSixelBytes(cb: (chunk: Uint8Array) => void): void`  
    Encodes image data as chunks of SIXEL bytes. `cb` will be called multiple times with SIXEL data in `chunk` until all image data was transmitted. `chunk` is borrowed, thus the data should be copied/written right away.  
    Note: The output contains only the SIXEL image data (no escape sequence introducer / finalizer).

- `toSixelString(): string`  
    Encodes image data as a single string. If performance matters, use `toSixelBytes`.  
    Note: The output contains only the SIXEL image data (no escape sequence introducer / finalizer).

- `static fromImageData(data: Uint8ClampedArray | Uint8Array, width: number, height: number, palette: RGBA8888[] | RGBColor[] = DEFAULT_COLORS): SixelImage`  
    Alternate constructor to create a sixel image from an existing image.
    `data` should be an array like type with RGBA pixel data. `width` and `height` must contain the pixel dimension
    of `data`. Since SIXEL is a palette based image format, `palette` should contain the used colors in `data`.
    If no palette was given the colors will fallback to a 16 colors palette derived from VT340. This is most
    likely unwanted, also to avoid poor results in general use proper quantization/dithering and palette creation
    before creating the SIXEL image. See `node_example_encode.js` for an example usage in conjunction with `rgbquant`.
    For transparency only an alpha value of 0 will be respected as fully transparent, other alpha values are set to fully opaque (255). Transparent pixels will be colored by the terminal later on depending on the `backgroundSelect` setting of the introducer.  
    Note: Some terminals have strict palette limitations (e.g. xterm is bound to 16 colors only in VT340 mode).

- `static introducer(backgroundSelect: number = 0): string`  
    Creates the escape sequence introducer for a SIXEL data stream.
    This should be written to the terminal before any SIXEL data.  
    `backgroundSelect` is a hint for the terminal how to deal with uncolored pixels:

    - 0 - device default action (most terminals will apply background color)
    - 1 - no action (previous pixel value at output position should remain)
    - 2 - set to background color (device dependent)

- `static finalizer(): string`  
    Finalizes the SIXEL escape sequence. Write this, when the SIXEL data stream has ended.
    Note that a SIXEL escape sequences changes the operation mode of a terminal,
    forgetting the finalizer might leave the terminal in an unrecoverable state.

Furthermore the library exposes two convenient functions to convert to and from native RGBA colors:

- `function toRGBA8888(r: number, g: number, b: number, a: number = 255): RGBA8888`  
    Converts the RGBA channel values to the native color type `RGBA8888`.

- `function fromRGBA8888(color: RGBA8888): number[]`  
    Converts the native color to an array of [r, g, b, a].

### Installation
Install the library with `npm install sixel`.

### Examples and browser demo
See the example files for decoding/encoding in nodejs. Note that the examples and the browser demo are not part
of the npm package, clone the repo and run `npm install` if you want to see them in action.

Decoding can also be tested in the browser after `npm start` under `localhost:8080`.

Encoding can be tested with `img2sixel.js` as small cmdline tool, e.g.
```
$> node img2sixel.js -p16 http://leeoniya.github.io/RgbQuant.js/demo/img/bluff.jpg
```

## Benchmarks
Performance is measured for typical actions based on 9-bit palette image:
![test image](palette.png "test image")

The test image repeats the palette image 8 times to form a 640x480 image with 512 colors. The unusual (and not spec conform) high number of colors was choosen to explicit test for this as an upper bound.

Results:
```
   Context "lib/index.benchmark.js"
      Context "SixelImage"
         Case "fromImageData - unsafe palette" : 10 runs - average runtime: 26.11 ms
         Case "fromImageData - safe palette" : 10 runs - average runtime: 8.34 ms
         Case "toImageData - with fillColor" : 10 runs - average runtime: 2.93 ms
         Case "toImageData - without fillColor" : 10 runs - average runtime: 1.93 ms
         Case "writeString" : 10 runs - average runtime: 38.42 ms
         Case "write" : 10 runs - average runtime: 34.57 ms
         Case "toSixelString" : 10 runs - average runtime: 36.10 ms
         Case "toSixelBytes" : 10 runs - average runtime: 29.63 ms
```

Note the high values for:
- "fromImageData - unsafe palette"  
  Caused by the additional needed ED calculation and color palette replacement. Prolly can be made faster.
- "write"  
  The decode parser is not yet further optimized.
- "toSixelBytes"  
  Has already seen some optimizations (down from ~150ms to ~30ms), not sure if that can be made much faster.

### Status
Currently alpha, tests are yet to come.

### TODO
- tests
- optimizations
- more docs

### References

While being quite common in the DEC ecosystem in the 80s (even used for printer protocols), SIXEL references are very limited these days. The closest to a specification we have can be found in the Video Systems Reference Manual ([DEC STD 070](http://www.bitsavers.org/pdf/dec/standards/EL-SM070-00_DEC_STD_070_Video_Systems_Reference_Manual_Dec91.pdf#page=908), p. 908-933). Also see [Sixel Graphics](https://www.vt100.net/docs/vt3xx-gp/chapter14.html) on vt100.net, which gives a quick overview. For implementation this old usenet article "[All About SIXELs](https://www.digiater.nl/openvms/decus/vax90b1/krypton-nasa/all-about-sixels.text)" was very helpful.