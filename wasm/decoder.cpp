/**
 * WasmDecoder - static instance SIXEL decoder with fixed canvas limit.
 * 
 * Copyright (c) 2021 Joerg Breitbart.
 * @license MIT
 */


// cmdline overridable defines
#ifndef CHUNK_SIZE
  #define CHUNK_SIZE 4096
#endif
#ifndef CANVAS_SIZE
  #define CANVAS_SIZE 1024 * 1024
#endif
#ifndef PALETTE_SIZE
  #define PALETTE_SIZE 256
#endif

// internal defines
#define  ST_DATA 0
#define  ST_COMPRESSION 1
#define  ST_ATTR 2
#define  ST_COLOR 3

#define PARAM_SIZE 6


// static parser state
struct ParserState {
  int width;
  int height;
  int state;
  int color;
  int cursor;
  int y_offset;
  int offset;
  int not_aborted;
  int p_length;
  int palette_length;
  int jump_offsets[6];
  int params[PARAM_SIZE];
  int palette[PALETTE_SIZE];
  char chunk[CHUNK_SIZE];
  int canvas[CANVAS_SIZE];
};
static struct ParserState ps;


// exported functions
extern "C" {
  void* get_chunk_address() { return &ps.chunk[0]; }
  void* get_canvas_address() { return &ps.canvas[8]; }
  void* get_palette_address() { return &ps.palette[0]; }

  void init(int width, int height, int fill_color, int palette_length);
  void decode(int length);
}

/**
 * Some inline helpers.
 */

// Put single sixel at current cursor position.
// Note: does not alter cursor position.
inline void put_single(int code, int color) {
  if (code && ps.cursor < ps.width && ps.y_offset < ps.height) {
    int p = ps.cursor + ps.offset;
    for (int i = 0; i < 6; ++i) {
      ps.canvas[((code >> i) & 1) * (p + ps.jump_offsets[i])] = color;
    }
  }
}

// Put sixel n-times from current cursor position.
// Note: does not alter cursor position.
inline void put(int code, int color, int n) {
  if (code && ps.cursor < ps.width && ps.y_offset < ps.height) {
    if (ps.cursor + n >= ps.width) {
      n = ps.width - ps.cursor;
    }
    int p = ps.cursor + ps.offset;
    for (int i = 0; i < 6; ++i) {
      if ((code >> i) & 1) {
        int pp = p + ps.jump_offsets[i];
        for (int r = 0; r < n; ++r) {
          ps.canvas[pp + r] = color;
        }
      }
    }
  }
}

// State jump helper.
inline void jump(int code) {
  switch (code) {
    case 33:
      ps.state = ST_COMPRESSION;
      break;
    case 35:
      ps.state = ST_COLOR;
      break;
    case 36:
      ps.cursor = 0;
      break;
    case 45:
      ps.y_offset += 6;
      ps.offset = ps.y_offset * ps.width + 8;
      ps.cursor = 0;
      break;
    case 34:
      ps.state = ST_ATTR;
      break;
  }
}

// Reset params array to [0], always length 1 based (ZDM like).
inline void params_reset() {
  ps.params[0] = 0;
  ps.p_length = 1;
}
// Add a param to params.
inline void params_add_param() {
  if (ps.p_length < PARAM_SIZE) {
    ps.params[ps.p_length++] = 0;
  }
}
// Add a decimal digit to current param.
inline void params_add_digit(int v) {
  if (ps.p_length < PARAM_SIZE) {
    ps.params[ps.p_length - 1] = ps.params[ps.p_length - 1] * 10 + v;
  }
}

// Normalize %-based SIXEL RGB 0..100 to channel byte values 0..255.
// Note: does some rounding in integer arithmetics.
inline int normalize_rgb(int r, int g, int b) {
  return 0xFF000000 | ((b * 255 + 99) / 100) << 16 | ((g * 255 + 99) / 100) << 8 | ((r * 255 + 99) / 100);
}

// hue to channel value helper.
inline float h2c(float t1, float t2, float c) {
  if (c < 0) c += 1;
  else if (c > 1) c -= 1;
  return c * 6 < 1
    ? t2 + (t1 - t2) * 6 * c
    : c * 2 < 1
      ? t1
      : c * 3 < 2
        ? t2 + (t1 - t2) * (4 - c * 6)
        : t2;
}

// Normalize SIXEL HLS to RGBA8888.
// Incoming values are integer in: H - 0..360 (hue turned by 240°), L - 0..100, S - 0..100.
inline int normalize_hls(int hi, int li, int si) {
  if (!si) {
    return 0xFF000000 | ((li * 255 + 99) / 100) << 16 | ((li * 255 + 99) / 100) << 8 | ((li * 255 + 99) / 100);
  }
  float h = ((float) (hi + 240 % 360)) / 360;
  float l = ((float) li) / 100;
  float s = ((float) si) / 100;
  float t1 = l < 0.5 ? l * (1 + s) : l + s - l * s;
  float t2 = l * 2 - t1;
  unsigned char r = 255 * h2c(t1, t2, h + (1.0f / 3));
  unsigned char g = 255 * h2c(t1, t2, h);
  unsigned char b = 255 * h2c(t1, t2, h - (1.0f / 3));
  return 0xFF000000 | b << 16 | g << 8 | r;
}


/**
 * @brief Initialize a new SIXEL image.
 * 
 * This works pretty much like a constructor, but other than with real memory isolated instances we operate
 * on static memory flushing the old state. Therefore the decoder can only process one image at a time.
 * If you need interleaved decoding of multiple images, consider spawning multiple wasm decoder instances.
 * 
 * @param width       Pixel width of the image to be decoded.
 * @param height      Pixel height of the image to be decoded.
 * @param fill_color  Fillcolor in RGBA8888 to initialize canvas with.
 */
void init(int width, int height, int fill_color, int palette_length) {
  // basic overflow check
  // Note: The height adjustment here is needed to avoid a potential overflow in the last sixel line.
  // By adjusting here to multiples of 6 we reduce the usable canvas a bit, but can avoid nasty special
  // case branching in put.
  // +8 - canvas[0..7] as dummy pixels, image starts at canvas[8]
  int length = ((height + 5) / 6 * 6) * width + 8;
  if (0 < width && width < 0xFFFF && 0 < height && height < 0xFFFF && length < CANVAS_SIZE) {
    ps.not_aborted = 1;
    ps.width = width;
    ps.height = height;
    ps.state = ST_DATA;
    ps.color = 0;
    ps.cursor = 0;
    ps.y_offset = 0;
    ps.offset = 8;
    ps.palette_length = (0 < palette_length && palette_length < PALETTE_SIZE) ? palette_length : PALETTE_SIZE;
    params_reset();

    // clear canvas with fill_color
    // for (int i = 1; i < length; ++i) {
    //   ps.canvas[i] = fill_color;
    // }
    // faster variant with 64 bit
    int length64 = (length + 1) / 2;
    long long color = ((unsigned long long) fill_color) << 32 | (unsigned int) fill_color;
    long long *p = (long long *) &ps.canvas[0];
    for (int i = 1; i < length64; ++i) {
      p[i] = color;
    }

    // calc sixel pixel line jump offsets
    for (int i = 0, v = 0; i < 6; ++i, v += ps.width) {
      ps.jump_offsets[i] = v;
    }

  } else {
    ps.not_aborted = 0;
    ps.width = 0;
    ps.height = 0;
  }
}


/**
 * @brief Decode length bytes of the data loaded to chunk.
 */
void decode(int length) {
  if (ps.not_aborted && ps.y_offset < ps.height) {
    for (int i = 0; i < length; ++i) {
      int code = ps.chunk[i] & 0x7F;
      switch (ps.state) {
        case ST_DATA:
          if (code > 62 && code != 127) {
            put_single(code - 63, ps.color);
            ps.cursor++;
          } else jump(code);
          break;
        case ST_COMPRESSION:
          if (code > 47 && code < 58) {
            params_add_digit(code - 48);
          } else if (code > 62 && code != 127) {
            // FIXME: re-introduce compression stacking !255!255 == !510
            // STD 070: !0 == !1
            put(code - 63, ps.color, ps.params[0]);
            ps.cursor += ps.params[0];
            params_reset();
            ps.state = ST_DATA;
          } else switch (code) {
            case 33:
              params_add_param();
              break;
            case 35:
              params_reset();
              ps.state = ST_COLOR;
              break;
            case 36:
              params_reset();
              ps.cursor = 0;
              break;
            case 45:
              params_reset();
              ps.y_offset += 6;
              ps.offset = ps.y_offset * ps.width + 8;
              ps.cursor = 0;
              break;
            case 34:
              params_reset();
              ps.cursor = ST_ATTR;
              break;
          }
          break;
        case ST_COLOR:
          if (code > 47 && code < 58) {
            params_add_digit(code - 48);
          } else if (code == 59) {
            params_add_param();
          } else if ((code > 62  && code != 127) || code == 33 || code == 35 || code == 36 || code == 45) {
            if (ps.p_length == 1) {
              ps.color = ps.palette[ps.params[0] % ps.palette_length];
            } else if (ps.p_length == 5) {
              if (ps.params[1] < 3
                && ps.params[1] == 1 ? ps.params[2] <= 360 : ps.params[2] <= 100
                && ps.params[3] <= 100
                && ps.params[4] <= 100) {
                switch (ps.params[1]) {
                  case 2:  // RGB
                    ps.palette[ps.params[0] % ps.palette_length] = ps.color = normalize_rgb(
                      ps.params[2], ps.params[3], ps.params[4]);
                    break;
                  case 1:  // HLS
                    ps.palette[ps.params[0] % ps.palette_length] = ps.color = normalize_hls(
                      ps.params[2], ps.params[3], ps.params[4]);
                    break;
                  case 0:  // illegal, only apply color switch
                    ps.color = ps.palette[ps.params[0] % ps.palette_length];
                }
              }
            }
            params_reset();
            if (code > 62 && code != 127) {
              put_single(code - 63, ps.color);
              ps.cursor++;
              ps.state = ST_DATA;
            } else jump(code);
          }
          break;
        case ST_ATTR:
          if (code > 47 && code < 58) {
            params_add_digit(code - 48);
          } else if (code == 59) {
            params_add_param();
          } else {
            params_reset();
            if (code > 62 && code != 127) {
              put_single(code - 63, ps.color);
              ps.cursor++;
              ps.state = ST_DATA;
            } else jump(code);
          }
          break;
      }
    }
  }
}

/**
 * Decode approach with cleaner state handling.
 * Not quite as fast as above, but more condensed still missing several transistions.
 */

inline void maybe_color() {
  if (ps.state == ST_COLOR) {
    if (ps.p_length == 1) {
      ps.color = ps.palette[ps.params[0] % ps.palette_length];
    } else if (ps.p_length == 5) {
      if (ps.params[1] < 3
        && ps.params[1] == 1 ? ps.params[2] <= 360 : ps.params[2] <= 100
        && ps.params[3] <= 100
        && ps.params[4] <= 100) {
        switch (ps.params[1]) {
          case 2:  // RGB
            ps.palette[ps.params[0] % ps.palette_length] = ps.color = normalize_rgb(
              ps.params[2], ps.params[3], ps.params[4]);
            break;
          case 1:  // HLS
            ps.palette[ps.params[0] % ps.palette_length] = ps.color = normalize_hls(
              ps.params[2], ps.params[3], ps.params[4]);
            break;
          case 0:  // illegal, only apply color switch
            ps.color = ps.palette[ps.params[0] % ps.palette_length];
        }
      }
    }
  }
}

void decode_(int length) {
  if (ps.not_aborted && ps.y_offset < ps.height) {
    for (int i = 0; i < length; ++i) {
      int code = ps.chunk[i] & 0x7F;
      if (62 < code && code < 127) {
        switch (ps.state) {
          case ST_COMPRESSION:
            put(code - 63, ps.color, ps.params[0]);
            ps.cursor += ps.params[0];
            ps.state = ST_DATA;
            break;
          case ST_COLOR:
            maybe_color();
            ps.state = ST_DATA;
          default:
            put_single(code - 63, ps.color);
            ps.cursor++;
        }
      } else if (47 < code && code < 58) {
        params_add_digit(code - 48);
      } else
      switch (code) {
        case 59:
          params_add_param();
          break;
        case 33:
          maybe_color();
          params_reset();
          ps.state = ST_COMPRESSION;
          break;
        case 35:
          maybe_color();
          params_reset();
          ps.state = ST_COLOR;
          break;
        case 36:
          ps.cursor = 0;
          break;
        case 45:
          ps.y_offset += 6;
          ps.offset = ps.y_offset * ps.width + 8;
          ps.cursor = 0;
          break;
        case 34:
          maybe_color();
          params_reset();
          ps.state = ST_ATTR;
          break;
      }
    }
  }
}
