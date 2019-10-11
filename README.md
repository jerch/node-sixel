## Sixel images in Javascript.

SIXEL decoding / encoding library for node and the browser.
The library provides a class `SixelImage` with the following properties:

- `constructor(fillColor: RGBA8888 = DEFAULT_BACKGROUND)`  
    Creates a new SIXEL image. The optional `fillColor` (default black) is used to fill
    "holey pixels" with a background color during pixel transfer in `toImageData`.

- `width: number`  
    Pixel width of the image. Updates during `write`.

- `height: number`  
    Pixel height of the image. Updates during `write`.

- `fillColor: RGBA8888`  
    Number respresenting the background fill color. The number depends on endianess of the architecture,
    create it with `toRGBA8888(r, g, b, a)`.

- `write(data: UintTypedArray, start: number = 0, end: number = data.length): void`  
    Writes SIXEL bytes to the image and updates the image data. This is done as a stream,
    therefore it is possible to grab partly transmitted images (see browser example).
    `data` can be any array like type with single bytes per index position.

- `writeString(data: string, start: number = 0, end: number = data.length): void`  
    Same as `write` but with string data instead. For better performance use `write`.

- `toImageData(target: Uint8ClampedArray, width: number, height: number, dx: number = 0, dy: number = 0, sx: number = 0, sy: number = 0, swidth: number = this.width, sheight: number = this.height, fillColor: RGBA8888 = this.fillColor): Uint8ClampedArray`  
    Write pixel data to pixel array `target`. A pixel array can be obtained from `ImageData.data`, e.g. from a canvas.
    `width` and `height` must contain the full dimension of the target. Use `dx`, `dy` (offset in target) and
    `sx`, `sy` (offset in source) and `swidth`, `sheight` (area in source) for cropping/clipping. `fillColor` has the same
    meaning as in the constructor, explicit setting it to 0 will leave non encoded pixels unaltered (pixels, that were not colored in the SIXEL data). This can be used for a transparency like effect (background/previous pixel value will remain). Returns the altered `target`.

- `toSixelBytes(cb: (chunk: Uint8Array) => void): void`  
    Encodes image data as chunks of SIXEL bytes. `cb` will be called multiple times the SIXEL data in `chunk` until all image data was transmitted. `chunk` is borrowed, thus the data should be copied/written right away.  
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
    Note: Some terminals have strict palette limitations (e.g. xterm is bound to 16 colors only in VT340 mode).

- `static introducer(backgroundSelect: number = 0): string`  
    Creates the escape sequence introducer for a SIXEL data stream.
    This should be written to the terminal before any SIXEL data.  
    `backgroundSelect` is a hint for the terminal how to deal with uncolored pixels:

    - 0 - device default action (most terminals will apply background color)
    - 1 - no action (no change to zero bit value grid positions)
    - 2 - set to background color - zero bit value grid positions are set to background color (device dependent).

- `static finalizer(): string`  
    Finalizes the SIXEL escape sequence. Write this, when the SIXEL data stream has ended to restore
    the terminal to normal operation. Note that a SIXEL escape sequences changes the operation mode
    of a terminal, forgetting the finalizer might leave the terminal in an unrecoverable state.

Furthermore the library exposes two convenient functions to convert native RGBA colors:

- `function toRGBA8888(r: number, g: number, b: number, a: number = 255): RGBA8888`  
    Converts the RGB channels values to the native color type `RGBA8888`.

- `function fromRGBA8888(color: RGBA8888): number[]`  
    Converts the native color to an array of [r, g, b, a].

### Installation
Install the library with `npm install sixel`.

### Demos and examples
See the example files for decoding/encoding in nodejs. Note that the examples are not contained in the npm package,
clone the repo and run `npm install` if you want to see them in action.

Decoding can also be tested in the browser:
```
npm install
npm start
```
and open `localhost:8080`.

### Status
Currently alpha, tests are yet to come.

### TODO
- tests
- optimizations
- more docs
