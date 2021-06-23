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


// IO memory
//static char CHUNK[CHUNK_SIZE];    // input data chunks
//static int CANVAS[CANVAS_SIZE];   // output pixel canvas in RGBA32


// exported functions
extern "C" {
  void* get_chunk_address() { return &ps.chunk[0]; }
  void* get_canvas_address() { return &ps.canvas[0]; }
  void* get_palette_address() { return &ps.palette[0]; }
  int get_chunk_limit() { return CHUNK_SIZE; }
  int get_canvas_limit() { return CANVAS_SIZE; }
  int get_palette_limit() { return PALETTE_SIZE; }

  void init(int width, int height, int fill_color, int palette_length);
  void decode(int length);
}

/**
 * Some inline helpers.
 */

// Put a single a single sixel at current cursor position.
// Note: does not alter cursor position.
inline void put_single(int code, int color) {
  if (code && ps.cursor < ps.width && ps.y_offset < ps.height) {
    int p = ps.cursor + ps.offset;
    if (code & 1) ps.canvas[p] = color;
    if (code & 2) ps.canvas[p + ps.jump_offsets[1]] = color;
    if (code & 4) ps.canvas[p + ps.jump_offsets[2]] = color;
    if (code & 8) ps.canvas[p + ps.jump_offsets[3]] = color;
    if (code & 16) ps.canvas[p + ps.jump_offsets[4]] = color;
    if (code & 32) ps.canvas[p + ps.jump_offsets[5]] = color;
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
      if (code & (1 << i)) {
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
      ps.offset = ps.y_offset * ps.width;
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


/**
 * @brief Initialize a new SIXEL image.
 * 
 * This works pretty much like a constructor, but other than with real memory isolated instances we operate
 * on static memory flushing the old state. Therefore the decoder can only process one image at a time.
 * If you need interleaved decoding of multiple images, consider spawning multiple wasm decoder instances.
 * 
 * @param width       Pixel width of the image to be decoded.
 * @param height      Pixel height of the image to be decoded.
 * @param fill_color  Fillcolor in RGBA8888 to initialize canvas with (LE only currently).
 */
void init(int width, int height, int fill_color, int palette_length) {
  ps.not_aborted = 1;
  ps.state = ST_DATA;
  ps.color = 0;
  ps.cursor = 0;
  ps.y_offset = 0;
  ps.offset = 0;
  ps.palette_length = (0 < palette_length && palette_length < PALETTE_SIZE) ? palette_length : PALETTE_SIZE;
  params_reset();

  // basic overflow check
  // Note: The height adjustment here is needed to avoid a potential overflow in the last sixel line.
  // By adjusting here to multiples of 6 we reduce the usable canvas a bit, but can avoid nasty special
  // case branching in put.
  if (width == 0 || width > 0xFFFF || height == 0 || height > 0xFFFF || width * (height + 5) / 6 > CANVAS_SIZE) {
    ps.not_aborted = 0;
    ps.width = 0;
    ps.height = 0;
    return;
  }

  ps.width = width;
  ps.height = height;

  // clear canvas with fill_color
  int p = 0;
  for (int y = 0; y < ps.height; ++y) {
    for (int x = 0; x < ps.width; ++x) {
      ps.canvas[p + x] = fill_color;
    }
    p = p + ps.width;
  }

  // calc sixel pixel line jump offsets
  for (int i = 0, v = 0; i < 6; ++i, v += ps.width) {
    ps.jump_offsets[i] = v;
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
              ps.offset = ps.y_offset * ps.width;
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
                && ps.params[2] <= 100
                && ps.params[3] <= 100) {
                switch (ps.params[1]) {
                  case 2:  // RGB
                    ps.color = ps.palette[ps.params[0] % ps.palette_length] = normalize_rgb(
                      ps.params[2], ps.params[3], ps.params[4]);
                    break;
                  case 1:  // HLS
                    // FIXME: port HLS calc
                    ps.color = ps.palette[ps.params[0] % ps.palette_length] = normalize_rgb(
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
