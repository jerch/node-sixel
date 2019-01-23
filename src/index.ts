interface IColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const DEFAULT_COLOR = {
  r: 0,
  g: 0,
  b: 0,
  a: 255
};

type UintTypedArray = Uint8Array | Uint16Array | Uint32Array;


/**
 * Class to hold a single sixel band.
 * The underlying data storage grows with `addSixel` if needed.
 * For multiple colors reset the the band cursor with `CR()`.
 * The class stores information about touched pixels, thus will not
 * overdraw a pixel with a default color that was never touched.
 */
class SixelBand {
  private _cursor = 0;
  public width = 0;
  public data: Uint8ClampedArray;
  public touched: Uint8ClampedArray;
  constructor(length: number = 4) {
    this.data = new Uint8ClampedArray(length * 6 * 4);
    this.touched = new Uint8ClampedArray(length);
  }

  /**
   * Add a sixel to the band.
   * Called by the parser for any data byte of the sixel stream.
   */
  public addSixel(code: number, color: IColor): void {
    const pos = this._cursor * 24;
    // resize by power of 2 if needed
    if (pos >= this.data.length) {
      const data = new Uint8ClampedArray(this.data.length * 2);
      data.set(this.data);
      this.data = data;
      const touched = new Uint8ClampedArray(this.width * 2);
      touched.set(this.touched);
      this.touched = touched;
    }
    // update data
    code -= 63;
    this.touched[this._cursor] |= code;
    for (let p = 0; p < 6; ++p) {
      if (code & (1 << p)) {
        this.data[pos + p * 4] = color.r;
        this.data[pos + p * 4 + 1] = color.g;
        this.data[pos + p * 4 + 2] = color.b;
        this.data[pos + p * 4 + 3] = color.a;
      }
    }
    // update cursor pos and length
    this._cursor++;
    this.width = Math.max(this.width, this._cursor);
  }

  public addSixels(data: UintTypedArray, start: number, end: number, color: IColor): void {
    for (let pos = start; pos < end; ++pos) {
      this.addSixel(data[pos], color);
    }
  }

  /**
   * Carriage return.
   */
  public CR(): void {
    this._cursor = 0;
  }

  /**
   * Copy a single row of pixels to `target`.
   * Low level method to access the band's image data.
   * Not for direct usage (no bound checks), use `SixelImage.toImageData` instead.
   */
  public copyPixelRow(target: Uint8ClampedArray, offset: number, row: number, start: number, length: number): void {
    const end = Math.min(this.width, start + length);
    const touchMask = 1 << row;
    row *= 4;
    for (let i = start; i < end; ++i) {
      if ((this.touched[i] & touchMask)) {
        target[offset + i * 4] = this.data[i * 24 + row];
        target[offset + i * 4 + 1] = this.data[i * 24 + row + 1];
        target[offset + i * 4 + 2] = this.data[i * 24 + row + 2];
        target[offset + i * 4 + 3] = this.data[i * 24 + row + 3];
      }
    }
  }
}

const enum SixelState {
  GROUND = 0,
  COMPRESSION = 1,
  COLOR = 2
}

export class SixelImage {
  public static fromString(data: string): SixelImage {
    const bytes = new Uint8Array(data.length);
    const l = data.length;
    for (let i = 0; i < l; ++i) {
      bytes[i] = data.charCodeAt(i);
    }
    return SixelImage.fromData(bytes);
  }
  public static fromData(data: UintTypedArray): SixelImage {
    const img = new SixelImage();

    const colors: IColor[] = [];

    let state = SixelState.GROUND;
    let dataPos = -1;
    let band: SixelBand = null;
    let color = {r: 0, g: 0, b: 0, a: 0};
    let colorAccu: number[] = [0];
    let repeat = 0;

    // parse data
    const l = data.length;
    for (let i = 0; i < l; ++i) {
      const code = data[i];
      if (state === SixelState.GROUND) {
        if (code === 34) throw Error('not implemented')
        if (code >= 63 && code < 127) {  // data bytes
          dataPos = (~dataPos) ? dataPos : i;
        } else if (code === 33) {       // '!' compression
          if (~dataPos) {
            if (!band) {
              band = new SixelBand((img._bands.length > 1) ? img.width : i - dataPos);
              img._bands.push(band);
            }
            band.addSixels(data, dataPos, i, color);
            dataPos = -1;
          }
          state = SixelState.COMPRESSION;
        } else if (code === 35) {       // '#' color
          if (~dataPos) {
            if (!band) {
              band = new SixelBand((img._bands.length > 1) ? img.width : i - dataPos);
              img._bands.push(band);
            }
            band.addSixels(data, dataPos, i, color);
            dataPos = -1;
          }
          state = SixelState.COLOR;
        } else if (code === 36) {       // '$' CR
          if (~dataPos) {
            if (!band) {
              band = new SixelBand((img._bands.length > 1) ? img.width : i - dataPos);
              img._bands.push(band);
            }
            band.addSixels(data, dataPos, i, color);
            dataPos = -1;
          }
          band.CR();
        } else if (code === 45) {       // '-' LF
          if (~dataPos) {
            if (!band) {
              band = new SixelBand((img._bands.length > 1) ? img.width : i - dataPos);
              img._bands.push(band);
            }
            band.addSixels(data, dataPos, i, color);
            dataPos = -1;
          }
          band = null;
        }
      } else if (state === SixelState.COLOR) {
        if (code > 47 && code < 58) {
          colorAccu[colorAccu.length - 1] = colorAccu[colorAccu.length - 1] * 10 + code - 48;
        } else if (code === 59) {
          colorAccu.push(0);
        } else if (code >= 63 && code < 127) {
          if (colorAccu.length >= 5) {
            if (colorAccu[1] !== 2) {
              throw new Error('only RGB colors supported');
            }
            colors[colorAccu[0]] = {
              r: (colorAccu[2] * 255 / 100) | 0,
              g: (colorAccu[3] * 255 / 100) | 0,
              b: (colorAccu[4] * 255 / 100) | 0,
              a: 255
            };
          } else if (colorAccu.length === 1) {
            color = colors[colorAccu[0]] || DEFAULT_COLOR;
          }
          colorAccu = [0];
          state = SixelState.GROUND;
          dataPos = i;
        } else if (code === 35) {
          if (colorAccu.length >= 5) {
            if (colorAccu[1] !== 2) {
              throw new Error('only RGB colors supported');
            }
            colors[colorAccu[0]] = {
              r: (colorAccu[2] * 255 / 100) | 0,
              g: (colorAccu[3] * 255 / 100) | 0,
              b: (colorAccu[4] * 255 / 100) | 0,
              a: 255
            };
          } else if (colorAccu.length === 1) {
            color = colors[colorAccu[0]] || DEFAULT_COLOR;
          }
          colorAccu = [0];
        } else if (code === 33) {
          if (colorAccu.length >= 5) {
            if (colorAccu[1] !== 2) {
              throw new Error('only RGB colors supported');
            }
            colors[colorAccu[0]] = {
              r: (colorAccu[2] * 255 / 100) | 0,
              g: (colorAccu[3] * 255 / 100) | 0,
              b: (colorAccu[4] * 255 / 100) | 0,
              a: 255
            };
          } else if (colorAccu.length === 1) {
            color = colors[colorAccu[0]] || DEFAULT_COLOR;
          }
          colorAccu = [0];
          state = SixelState.COMPRESSION;
        }
      } else if (state === SixelState.COMPRESSION) {
        if (code > 47 && code < 58) {
          repeat = repeat * 10 + code - 48;
        } else if (code >= 63 && code < 127) {
          if (!band) {
            band = new SixelBand((img._bands.length > 1) ? img.width : i - dataPos);
            img._bands.push(band);
          }
          for (let i = 0; i < repeat; ++i) {
            band.addSixel(code, color);
          }
          state = SixelState.GROUND;
          repeat = 0;
        }
      }
    }
    // push levtover
    if (~dataPos) {
      if (!band) {
        band = new SixelBand(data.length - dataPos);
        img._bands.push(band);
      }
      band.addSixels(data, dataPos, data.length, color);
      dataPos = -1;
    }
    return img;
  }

  private _bands: SixelBand[] = [];
  
  public get height(): number {
    return this._bands.length * 6;
  }

  public get width(): number {
    return Math.max.apply(null, this._bands.map(el => el.width));
  }

  /**
   * Write image data into `target`.
   * `target` should be specified with correct `width` and `height`.
   * `dx` and `dy` mark the destination offset.
   * `sx` and `sy` mark the source offset, `swidth` and `sheight` the size to be copied.
   */
  public toImageData(
    target: Uint8ClampedArray, width: number, height: number,
    dx: number = 0, dy: number = 0,
    sx: number = 0, sy: number = 0, swidth: number = this.width, sheight: number = this.height): Uint8ClampedArray {
      if (width * height * 4 !== target.length) {
        throw new Error('wrong geometry of target');
      }
      // border checks
      if (dx >= width || dy >= height) {
        return target;
      }
      if (sx >= this.width || sy >= this.height) {
        return target;
      }
      // determine copy area
      const rx = width - dx;
      const ry = height - dy;
      swidth = Math.min(swidth, rx, this.width);
      sheight = Math.min(sheight, ry, this.height);
      if (swidth <= 0 || sheight <= 0) {
        return;
      }
      // copy data
      let p = sy % 6;
      let bandIdx = (sy / 6) | 0;
      let i = 0;
      while (bandIdx < this._bands.length && bandIdx * 6 + p < sy + sheight) {
        const offset = ((dy + i) * width + dx) * 4;
        this._bands[bandIdx].copyPixelRow(target, offset, p, sx, swidth);
        p++;
        i++;
        if (p === 6) {
          bandIdx++;
          p = 0;
        }
      }
      return target;
  }
}
