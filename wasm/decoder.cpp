/**
 * WasmDecoder - static SIXEL band decoder.
 * 
 * Copyright (c) 2021 Joerg Breitbart.
 * @license MIT
 */

// cmdline overridable defines
#ifndef CHUNK_SIZE
  #define CHUNK_SIZE 4096
#endif
#ifndef PALETTE_SIZE
  #define PALETTE_SIZE 256
#endif
#ifndef MAX_WIDTH
  #define MAX_WIDTH 4096
#endif

// internal defines
#define  ST_DATA 0
#define  ST_COMPRESSION 33
#define  ST_ATTR 34
#define  ST_COLOR 35

#define PARAM_SIZE 8


#define LV0 0
#define LV1 1
#define LV2 2

#define M0 0
#define M1 1
#define M2 2


/**
 * static parser state
 */
static struct {
  // exposed entries (when changed also needs changes in JS)
  long long fill_color;
  int width;
  int height;
  int r_num;
  int r_denom;
  int r_width;
  int r_height;
  int truncate;
  int level;  // LV0 undecided, LV1 level1, LV2 level2
  int mode;   // M0 undecided, M1 level1 or !truncate, M2 level2 + truncate
  int palette_length;

  // internal or individually exposed
  int abort;
  int cleared_width;
  int real_width;
  int state;
  int color;
  int cursor;
  int p_length;
  int params[PARAM_SIZE];
  int palette[PALETTE_SIZE];
  char chunk[CHUNK_SIZE + 1] __attribute__((aligned(16)));
  int p0[MAX_WIDTH + 4] __attribute__((aligned(16)));
  int p1[MAX_WIDTH + 4] __attribute__((aligned(16)));
  int p2[MAX_WIDTH + 4] __attribute__((aligned(16)));
  int p3[MAX_WIDTH + 4] __attribute__((aligned(16)));
  int p4[MAX_WIDTH + 4] __attribute__((aligned(16)));
  int p5[MAX_WIDTH + 4] __attribute__((aligned(16)));
} __attribute__((aligned(16))) ps;


/**
 * Exported/imported functions.
 */
extern "C" {
  void* get_state_address() { return &ps.fill_color; }
  void* get_chunk_address() { return &ps.chunk[0]; }
  void* get_p0_address() { return &ps.p0[4]; }
  void* get_palette_address() { return &ps.palette[0]; }

  void init(int sixel_color, int fill_color, unsigned int palette_length, int truncate);
  void decode(int start, int end);
  int current_width();

  // imported
  int handle_band(int width);
  int mode_parsed(int mode);
}


/**
 * Sixel painting.
 */

// Put single sixel at current cursor position.
static inline void put_single(unsigned int code, int color, unsigned int cursor) {
  if (cursor < MAX_WIDTH) {
    ps.p0[(code >> 0 & 1) * cursor] = color;
    ps.p1[(code >> 1 & 1) * cursor] = color;
    ps.p2[(code >> 2 & 1) * cursor] = color;
    ps.p3[(code >> 3 & 1) * cursor] = color;
    ps.p4[(code >> 4 & 1) * cursor] = color;
    ps.p5[(code >> 5 & 1) * cursor] = color;
  }
}

// Put sixel n-times from current cursor position.
static inline void put(int code, int color, unsigned int n, unsigned int cursor) {
  if (code && cursor < MAX_WIDTH) {
    if (cursor + n >= MAX_WIDTH) {
      n = MAX_WIDTH - cursor;
    }
    if (code >> 0 & 1) { int *pp = ps.p0 + cursor; int r = n; while (r--) *pp++ = color; }
    if (code >> 1 & 1) { int *pp = ps.p1 + cursor; int r = n; while (r--) *pp++ = color; }
    if (code >> 2 & 1) { int *pp = ps.p2 + cursor; int r = n; while (r--) *pp++ = color; }
    if (code >> 3 & 1) { int *pp = ps.p3 + cursor; int r = n; while (r--) *pp++ = color; }
    if (code >> 4 & 1) { int *pp = ps.p4 + cursor; int r = n; while (r--) *pp++ = color; }
    if (code >> 5 & 1) { int *pp = ps.p5 + cursor; int r = n; while (r--) *pp++ = color; }
  }
}


/**
 * Color handling.
 */

// Normalize %-based SIXEL RGB 0..100 to channel byte values 0..255.
// Note: does some rounding in integer arithmetics.
static inline int normalize_rgb(int r, int g, int b) {
  return 0xFF000000 | ((b * 256 - b + 50) / 100) << 16 | ((g * 256 - g + 50) / 100) << 8 | ((r * 256 - r + 50) / 100);
}

// hue to channel value helper.
static inline float h2c(float t1, float t2, float c) {
  if (c < 0) c += 1;
  else if (c > 1) c -= 1;
  return c < 0.1666666716f    // c * 6 < 1
    ? t2 + (t1 - t2) * 6 * c
    : c < 0.5f                // c * 2 < 1
      ? t1
      : c < 0.6666666865f     // c * 3 < 2
        ? t2 + (t1 - t2) * (4 - c * 6)
        : t2;
}

// Normalize SIXEL HLS to RGBA8888.
// Incoming values are integer in: H - 0..360 (hue turned by 240°), L - 0..100, S - 0..100.
static inline int normalize_hls(int hi, int li, int si) {
  if (!si) {
    return normalize_rgb(li, li, li);
  }
  float h = ((float) (hi + 240 % 360)) / 360;
  float l = ((float) li) / 100;
  float s = ((float) si) / 100;
  float t1 = l < 0.5f ? l * (1 + s) : l * (1 - s) + s;
  float t2 = l * 2 - t1;
  unsigned char r = 255 * h2c(t1, t2, h + 0.3333333433f) + 0.5f;  // + 1.0f / 3
  unsigned char g = 255 * h2c(t1, t2, h) + 0.5f;
  unsigned char b = 255 * h2c(t1, t2, h - 0.3333333433f) + 0.5f;  // - 1.0f / 3
  return 0xFF000000 | b << 16 | g << 8 | r;
}

// Static color converter fp array to avoid branching.
typedef int (*color_converter)(int, int, int);
static const color_converter COLOR_CONVERTERS[2] = { &normalize_hls, &normalize_rgb };

// Tiny modulo optimization.
static inline int fastmod(unsigned int value, unsigned int ceil) {
  return value < ceil ? value : value % ceil;
}

// Apply color request.
static inline int apply_color(int color) {
  if (ps.p_length == 1) {
    color = ps.palette[fastmod(ps.params[0], ps.palette_length)];
  } else if (ps.p_length == 5
    && ps.params[1] == 1 ? ps.params[2] <= 360 : ps.params[2] <= 100
    && ps.params[3] <= 100
    && ps.params[4] <= 100)
  {
    if (ps.params[1] && ps.params[1] < 3) {
      ps.palette[fastmod(ps.params[0], ps.palette_length)] = COLOR_CONVERTERS[ps.params[1] - 1](
        ps.params[2], ps.params[3], ps.params[4]);
    }
    color = ps.palette[fastmod(ps.params[0], ps.palette_length)];
  }
  return color;
}


/**
 * Pixel buffer reset handling clearing with fill_color.
 */

// Clear next chunk in pixel buffers (m1). Hardcoded to 128px width.
static inline void clear_next() {
  long long *blueprint = (long long *) &ps.p0[ps.cleared_width];
  for (int i = 0; i < 64; ++i) blueprint[i] = ps.fill_color;
  __builtin_memcpy(&ps.p1[ps.cleared_width], blueprint, 512);
  __builtin_memcpy(&ps.p2[ps.cleared_width], blueprint, 512);
  __builtin_memcpy(&ps.p3[ps.cleared_width], blueprint, 512);
  __builtin_memcpy(&ps.p4[ps.cleared_width], blueprint, 512);
  __builtin_memcpy(&ps.p5[ps.cleared_width], blueprint, 512);
  ps.cleared_width += 128;
}

// Clear pixel buffers for next line processing (m1). Hardcoded to 128px chunk.
static inline void reset_line_m1() {
  ps.real_width = 4;

  // fill 128 pixels in p0 as copy source
  long long *blueprint = (long long *) &ps.p0[4];
  for (int i = 0; i < 64; ++i) blueprint[i] = ps.fill_color;

  // clear remaining in p0 .. p5
  int parts128 = (ps.width + 127) / 128;
  for (int i = 1; i < parts128; ++i) __builtin_memcpy(&ps.p0[4 + i * 128], blueprint, 512);
  for (int i = 0; i < parts128; ++i) __builtin_memcpy(&ps.p1[4 + i * 128], blueprint, 512);
  for (int i = 0; i < parts128; ++i) __builtin_memcpy(&ps.p2[4 + i * 128], blueprint, 512);
  for (int i = 0; i < parts128; ++i) __builtin_memcpy(&ps.p3[4 + i * 128], blueprint, 512);
  for (int i = 0; i < parts128; ++i) __builtin_memcpy(&ps.p4[4 + i * 128], blueprint, 512);
  for (int i = 0; i < parts128; ++i) __builtin_memcpy(&ps.p5[4 + i * 128], blueprint, 512);

  ps.cleared_width = 4 + parts128 * 128;
}

// Clear pixel buffers for next line processing (m2). Clears ps.width pixels.
static inline void reset_line_m2() {
  long long *blueprint = (long long *) &ps.p0[4];
  int l = (ps.width - 3) / 2;  // -4 because we added 4 in init, +1 for ceil in 8byte
  for (int i = 0; i < l; ++i) blueprint[i] = ps.fill_color;
  __builtin_memcpy(&ps.p1[4], blueprint, ps.width * 4);
  __builtin_memcpy(&ps.p2[4], blueprint, ps.width * 4);
  __builtin_memcpy(&ps.p3[4], blueprint, ps.width * 4);
  __builtin_memcpy(&ps.p4[4], blueprint, ps.width * 4);
  __builtin_memcpy(&ps.p5[4], blueprint, ps.width * 4);
}

/**
 * Decoders
 * 
 * - m1:      level 1 images w'o raster attributes and level 1/2 with truncate=false
 *            Does width expansion and clearing on the fly, thus lines may have different
 *            pixels output lengths.
 * 
 * - m2:      level 2 images truncate=false
 *            Optimizes width handling and clearing by always assuming the raster width
 *            truncating excess pixels. While this is not 100% spec conform,
 *            it is what most ppl want. The optimization gives a 15-20% speed bonus.
 * 
 * - raster:  decoder for raster attributes
 *            Decoder running first after init to determine, whether the image data
 *            contains raster attributes. Calls into m1 or m2 afterwards.
 */

void decode_raster(int start, int end);
void decode_m1(int start, int end);
void decode_m2(int start, int end);

typedef void (*decode_func)(int, int);
static const decode_func DECODERS[3] = { &decode_raster, &decode_m1, &decode_m2 };


void decode_m1(int start, int end) {
  int cur = ps.cursor;
  int state = ps.state;
  int color = ps.color;
  char *c = &ps.chunk[start];
  char *c_end = &ps.chunk[end];
  *c_end = 0xFF;
  while (c < c_end) {
    int code = *c++ & 0x7F;

    // digits
    if (unsigned(code - 48) < 10) {
      int *p = &ps.params[ps.p_length - 1];
      do {
        *p = *p * 10 + code - 48;
        code = *c++ & 0x7F;
      } while (unsigned(code - 48) < 10);
    }

    // sixels
    if (unsigned(code - 63) < 64) {
      if (state != ST_DATA) {
        if (state == ST_COMPRESSION) {
          while (cur + ps.params[0] >= ps.cleared_width && ps.cleared_width < MAX_WIDTH) clear_next();
          put(code - 63, color, ps.params[0], cur);
          cur += ps.params[0];
          code = *c++ & 0x7F;
        } else {
          color = apply_color(color);
        }
        state = ST_DATA;
      }
      while (unsigned(code - 63) < 64) {
        if (cur >= ps.cleared_width && ps.cleared_width < MAX_WIDTH) clear_next();
        put_single(code - 63, color, cur++);
        code = *c++ & 0x7F;
      };
    }

    // compression and color
    if (code == ST_COMPRESSION || code == ST_COLOR) {
      if (state == ST_COLOR) color = apply_color(color);
      ps.params[0] = 0;
      ps.p_length = 1;
      state = code;
    } else

    // CR and LF
    if (code == '$') {
      ps.real_width = cur > ps.real_width ? cur : ps.real_width;
      ps.real_width = ps.real_width < MAX_WIDTH ? ps.real_width : MAX_WIDTH;
      cur = 4;
    } else
    if (code == '-') {
      ps.real_width = cur > ps.real_width ? cur : ps.real_width;
      ps.real_width = ps.real_width < MAX_WIDTH ? ps.real_width : MAX_WIDTH;
      ps.cursor = ps.real_width;  // explicit update to avoid conflicts if current_width() is called in handle_band
      if (handle_band(ps.real_width - 4)) {
        ps.abort = 1;
        ps.cursor = ps.real_width = 4;  // same - to fix current_width() after breaking
        return;
      }
      reset_line_m1();
      cur = 4;
    } else

    // new param
    if (code == ';') {
      if (ps.p_length < PARAM_SIZE) {
        ps.params[ps.p_length++] = 0;
      }
    }

  }
  ps.cursor = cur;
  ps.state = state;
  ps.color = color;
}


void decode_m2(int start, int end) {
  int cur = ps.cursor;
  int state = ps.state;
  int color = ps.color;
  char *c = &ps.chunk[start];
  char *c_end = &ps.chunk[end];
  *c_end = 0xFF;
  while (c < c_end) {
    int code = *c++ & 0x7F;

    // digits
    if (unsigned(code - 48) < 10) {
      int *p = &ps.params[ps.p_length - 1];
      do {
        *p = *p * 10 + code - 48;
        code = *c++ & 0x7F;
      } while (unsigned(code - 48) < 10);
    }

    // sixels
    if (unsigned(code - 63) < 64) {
      if (state != ST_DATA) {
        if (state == ST_COMPRESSION) {
          put(code - 63, color, ps.params[0], cur);
          cur += ps.params[0];
          code = *c++ & 0x7F;
        } else {
          color = apply_color(color);
        }
        state = ST_DATA;
      }
      while (unsigned(code - 63) < 64) {
        put_single(code - 63, color, cur++);
        code = *c++ & 0x7F;
      };
    }

    // compression and color
    if (code == ST_COMPRESSION || code == ST_COLOR) {
      if (state == ST_COLOR) color = apply_color(color);
      ps.params[0] = 0;
      ps.p_length = 1;
      state = code;
    } else

    // CR and LF
    if (code == '$') {
      cur = 4;
    } else
    if (code == '-') {
      if (handle_band(ps.width - 4)) {
        ps.abort = 1;
        return;
      }
      reset_line_m2();
      cur = 4;
    } else

    // new param
    if (code == ';') {
      if (ps.p_length < PARAM_SIZE) {
        ps.params[ps.p_length++] = 0;
      }
    }

  }
  ps.cursor = cur;
  ps.state = state;
  ps.color = color;
}


void decode_raster(int start, int end) {
  char *c = &ps.chunk[start];
  char *c_end = &ps.chunk[end];
  while (c < c_end) {
    int code = *c++ & 0x7F;
    if (ps.state == ST_DATA) {
      if (code == ST_ATTR) {
        ps.state = ST_ATTR;
      } else
      if (unsigned(code - 63) < 64 || code == 33 || code == 35 || code == 36 || code == 45) {
        ps.level = LV1;
        ps.mode = M1;
        ps.r_num = 0;
        ps.r_denom = 0;
        ps.r_width = 0;
        ps.r_height = 0;
        break;
      }
    } else
    if (ps.state == ST_ATTR) {
      if (unsigned(code - 48) < 10) {
        ps.params[ps.p_length - 1] = ps.params[ps.p_length - 1] * 10 + code - 48;
      } else
      if (code == ';') {
        if (ps.p_length < PARAM_SIZE) {
          ps.params[ps.p_length++] = 0;
        }
      } else
      if (ps.p_length == 4) {
        ps.level = LV2;
        ps.mode = ps.truncate ? M2 : M1;
        ps.r_num = ps.params[0];
        ps.r_denom = ps.params[1];
        ps.r_width = ps.params[2];
        ps.r_height = ps.params[3];
        ps.state = ST_DATA;
        ps.width = ps.truncate ? (ps.r_width < MAX_WIDTH ? ps.r_width : MAX_WIDTH) + 4 : 0;
        ps.height = ps.truncate ? ps.r_height : 0;
        break;
      }
      // error   : some image have broken raster attributes defining not all values, e.g. "1;1 ...
      // recovery: set mode to M1, save any seen attributes, reset to state ST_DATA  
      if (unsigned(code - 63) < 64 || code == 33 || code == 35 || code == 36 || code == 45) {
        ps.level = LV1;
        ps.mode = M1;
        ps.r_num = ps.p_length > 0 ? ps.params[0] : 0;
        ps.r_denom = ps.p_length > 1 ? ps.params[1] : 0;
        ps.r_width = ps.p_length > 2 ? ps.params[2] : 0;
        ps.r_height = 0;
        ps.state = ST_DATA;
        break;
      }
    }
  }
  if (ps.mode) {
    if (ps.mode == M2) reset_line_m2();
    else reset_line_m1();
    ps.abort = mode_parsed(ps.mode);
    if (!ps.abort) DECODERS[ps.mode](start, end);
  }
}


/**
 * API functions.
 */

// Initialize parser state for new SIXEL image.
void init(int sixel_color, int fill_color, unsigned int palette_length, int truncate) {
  ps.state = ST_DATA;
  ps.color = sixel_color;
  ps.cursor = 4;
  ps.palette_length = (palette_length < PALETTE_SIZE) ? palette_length : PALETTE_SIZE;
  ps.params[0] = 0;
  ps.p_length = 1;
  ps.truncate = truncate;
  ps.level = LV0;
  ps.mode = M0;
  ps.state = ST_DATA;
  ps.fill_color = ((unsigned long long) fill_color) << 32 | (unsigned int) fill_color;
  ps.r_num = 0;
  ps.r_denom = 0;
  ps.r_width = 0;
  ps.r_height = 0;
  ps.width = 0;
  ps.height = 0;
  ps.abort = 0;
}

// Decode data in ps.chunk from start to end (exclusive).
void decode(int start, int end) {
  if (ps.abort) return;
  DECODERS[ps.mode](start, end);
}

// Width of the current band.
int current_width() {
  if (ps.mode == M1) {
    ps.real_width = ps.cursor > ps.real_width ? ps.cursor : ps.real_width;
    ps.real_width = ps.real_width < MAX_WIDTH ? ps.real_width : MAX_WIDTH;
    return ps.real_width - 4;
  }
  if (ps.mode == M2) {
    return ps.width - 4;
  }
  return 0;
}
