/**
 * WasmDecoder - static instance SIXEL decoder with fixed canvas limit.
 * 
 * Copyright (c) 2021 Joerg Breitbart.
 * @license MIT
 */      

/**
 * Note: This decoder is just a PoC for SIMD.
 * It is in a much earlier development state and
 * not compatible to the current JS interface.
 */

#include <immintrin.h>


// cmdline overridable defines
#ifndef CHUNK_SIZE
  #define CHUNK_SIZE 4096
#endif
#ifndef PALETTE_SIZE
  #define PALETTE_SIZE 256
#endif

// internal defines
#define  ST_DATA 0
#define  ST_COMPRESSION 33
#define  ST_COLOR 35

#define PARAM_SIZE 8


// static parser state
static struct {
  int width;
  int height;
  int state;
  int color;
  int cursor;
  int y_offset;
  int offset;
  int p_length;
  int palette_length;
  int params[PARAM_SIZE];
  int palette[PALETTE_SIZE];
  char chunk[CHUNK_SIZE + 1] __attribute__((aligned(16)));
  int canvas[2359296] __attribute__((aligned(16))); // fixed at 1536 * 1526 pixels for now
} __attribute__((aligned(16))) ps = {0};


// exported functions
extern "C" {
  void* get_chunk_address() { return &ps.chunk[0]; }
  void* get_canvas_address() { return &ps.canvas[0]; }
  void* get_palette_address() { return &ps.palette[0]; }

  void init(unsigned int width, unsigned int height, int fill_color, unsigned int palette_length);
  void decode(int length);
}



// Put sixel n-times from current cursor position.
//__attribute__((noinline))
static inline void put(int code, int color, unsigned int n, unsigned int cursor) {
  if (code && cursor < ps.width) {
    if (cursor + n >= ps.width) {
      n = ps.width - cursor;
    }
    int *p = ps.canvas + ps.offset + cursor;
    if (code & 1)  { int *pp = p;                int r = n; while (r--) *pp++ = color; }
    if (code & 2)  { int *pp = p + ps.width;     int r = n; while (r--) *pp++ = color; }
    if (code & 4)  { int *pp = p + ps.width * 2; int r = n; while (r--) *pp++ = color; }
    if (code & 8)  { int *pp = p + ps.width * 3; int r = n; while (r--) *pp++ = color; }
    if (code & 16) { int *pp = p + ps.width * 4; int r = n; while (r--) *pp++ = color; }
    if (code & 32) { int *pp = p + ps.width * 5; int r = n; while (r--) *pp++ = color; }
  }
}

// Put 4 consecutive sixels with SIMD.
#ifdef EMSCRIPTEN
static inline void put_simd(int sixels_agg, int offset, int color) {
  v128_t colors = wasm_i32x4_splat(color);
  v128_t sixels = wasm_i32x4_make(sixels_agg, 0, 0, 0);
  sixels = wasm_u16x8_extend_low_u8x16(sixels);
  sixels = wasm_u32x4_extend_low_u16x8(sixels);

  int *pp = &ps.canvas[offset];
  for (int i = 0; i < 6; ++i, pp += ps.width) {
    v128_t matcher = wasm_i32x4_splat(1 << i);
    v128_t bitmask = wasm_i32x4_eq(matcher, wasm_v128_and((v128_t) sixels, matcher));
    v128_t updated = wasm_v128_and(bitmask, colors);
    v128_t prev = wasm_v128_load((v128_t *) pp);
    v128_t keep = wasm_v128_andnot(prev, bitmask);
    wasm_v128_store((v128_t *) pp, wasm_v128_or(keep, updated));
  }
  // much nicer, but also 10% slower on v8 (bitselect not optimized in wasm engine?):
  //for (int i = 0; i < 6; ++i, pp += ps.width) {
  //  v128_t matcher = wasm_i32x4_splat(1 << i);
  //  v128_t bitmask = wasm_i32x4_eq(matcher, wasm_v128_and((v128_t) sixels, matcher));
  //  v128_t prev = wasm_v128_load((v128_t *) pp);
  //  wasm_v128_store((v128_t *) pp, wasm_v128_bitselect(colors, prev, bitmask));
  //}
}
#else
static inline void put_simd(int sixels_agg, int offset, int color) {
  __m128i colors = _mm_set1_epi32(color);
  __m128i sixels;
  sixels = _mm_insert_epi32(sixels, sixels_agg, 0);
  sixels = _mm_cvtepu8_epi32(sixels);

  int *pp = &ps.canvas[offset];
  for (int i = 0; i < 6; ++i) {
    __m128i matcher = _mm_set1_epi32(1 << i);
    __m128i bitmask = _mm_cmpeq_epi32(matcher, _mm_and_si128(sixels, matcher));
    __m128i updated = _mm_and_si128(bitmask, colors);
    __m128i prev = _mm_loadu_si128((__m128i *) pp);
    __m128i keep = _mm_andnot_si128(bitmask, prev);
    _mm_storeu_si128((__m128i *) pp, _mm_or_si128(keep, updated));
    pp += ps.width;
  }
}
#endif


// Normalize %-based SIXEL RGB 0..100 to to RGBA8888.
#ifdef EMSCRIPTEN
static inline int normalize_rgb_simd(float r, float g, float b) {
  v128_t reg = wasm_f32x4_make(r, g, b, 100);
  reg = wasm_f32x4_mul(reg, wasm_f32x4_splat(2.55f));
  reg = wasm_u32x4_trunc_sat_f32x4(reg);
  // this might be faster than swizzle:
  //reg = wasm_u16x8_narrow_i32x4(reg, reg);
  //reg = wasm_u8x16_narrow_i16x8(reg, reg);
  reg = wasm_i8x16_swizzle(reg, wasm_i8x16_make(
    0x00, 0x04, 0x08, 0x0C,
    0x80, 0x80, 0x80, 0x80,
    0x80, 0x80, 0x80, 0x80,
    0x80, 0x80, 0x80, 0x80
  ));
  return wasm_i32x4_extract_lane(reg, 0);
}
#else
static inline int normalize_rgb_simd(float r, float g, float b) {
  __m128 reg = _mm_set_ps(r, g, b, 100);
  reg = _mm_mul_ps(reg, _mm_set1_ps(2.55f));
  __m128i result = _mm_cvtps_epi32(reg);
  result = _mm_shuffle_epi8(result, _mm_set_epi8(
    0x80, 0x80, 0x80, 0x80,
    0x80, 0x80, 0x80, 0x80,
    0x80, 0x80, 0x80, 0x80,
    0x00, 0x04, 0x08, 0x0C
  ));
  return _mm_cvtsi128_si32(result);
}
#endif


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
// Incoming values are in: H - 0..360 (hue turned by 240°), L - 0..100, S - 0..100.
// TODO: faster SIMD version possible?
static inline int normalize_hls(float h, float l, float s) {
  if (!s) {
    return normalize_rgb_simd(l, l, l);
  }
  h = (h + 240 % 360) / 360;
  l = l / 100;
  s = s / 100;
  float t1 = l < 0.5f ? l * (1 + s) : l * (1 - s) + s;
  float t2 = l * 2 - t1;
  unsigned char r = 255 * h2c(t1, t2, h + 0.3333333433f);  // + 1.0f / 3
  unsigned char g = 255 * h2c(t1, t2, h);
  unsigned char b = 255 * h2c(t1, t2, h - 0.3333333433f);  // - 1.0f / 3
  return 0xFF000000 | b << 16 | g << 8 | r;
}

// Static color converter fp array to avoid branching.
typedef int (*color_converter)(float, float, float);
const static color_converter COLOR_CONVERTERS[2] = { &normalize_hls, &normalize_rgb_simd };


// Tiny modulo optimization.
static inline int fastmod(int value, int ceil) {
  return value < ceil ? value : value % ceil;
}

// Apply color request.
//__attribute__((noinline))
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
 * @brief Initialize a new SIXEL image.
 */
void init(unsigned int width, unsigned int height, int fill_color, unsigned int palette_length) {
  // note: overflow/range checks already done in JS
  ps.width = width;
  ps.height = height;
  ps.state = ST_DATA;
  ps.color = 0;
  ps.cursor = 0;
  ps.y_offset = 0;
  ps.offset = 0;
  ps.palette_length = (palette_length < PALETTE_SIZE) ? palette_length : PALETTE_SIZE;
  ps.params[0] = 0;
  ps.p_length = 1;

  // clear canvas with fill_color
  // we dont have to use SIMD manually here (done by compiler)
  int length = (((height + 5) / 6 * 6) * width + 8);
  int *p = ps.canvas;
  while (length--) *p++ = fill_color;
}


/**
 * FIXME:
 * - compression stacking with multiple !255!255?
 * - cursor width overflow (may overwrite next line pixels, possible mem overflow in last line)
 */
void decode(int length) {
  if (ps.y_offset < ps.height) {
    int cur = ps.cursor;
    int state = ps.state;
    int color = ps.color;
    ps.chunk[length] = 0xFF;
    for (int i = 0; i < length; ++i) {
      int code = ps.chunk[i] & 0x7F;

      int p = ps.params[ps.p_length - 1];
      while (unsigned(code - 48) < 10) {
        p = p * 10 + code - 48;
        code = ps.chunk[++i] & 0x7F;
      }
      ps.params[ps.p_length - 1] = p;

      if (unsigned(code - 63) < 64 && state != ST_DATA) {
        if (state == ST_COMPRESSION) {
          put(code - 63, color, ps.params[0], cur);
          cur += ps.params[0];
          code = ps.chunk[++i] & 0x7F;
        } else {
          color = apply_color(color);
        }
        state = ST_DATA;
      }

      int shift = 0;
      int off = cur + ps.offset;
      int agg = 0;
      while (unsigned(code - 63) < 64) {
        agg |= (code - 63) << shift;
        cur++;
        shift += 8;
        if (shift == 32) {
          put_simd(agg, off, color);
          agg = shift = 0;
          off += 4;
        }
        code = ps.chunk[++i] & 0x7F;
      }
      if (agg) put_simd(agg, off, color);

      if (code == ST_COMPRESSION || code == ST_COLOR) {
        if (state == ST_COLOR) color = apply_color(color);
        ps.params[0] = 0;
        ps.p_length = 1;
        state = code == ST_COMPRESSION ? ST_COMPRESSION : ST_COLOR;
      } else
      if (code == '$' || code == '-') {
        if (code == '-') {
          ps.y_offset += 6;
          if (ps.y_offset >= ps.height) return;
          ps.offset = ps.y_offset * ps.width;
        }
        cur = 0;
        off = ps.offset;
      } else
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
}
