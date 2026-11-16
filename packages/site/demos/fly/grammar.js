// A small rule grammar in the spirit of Context Free Art. Each rule has
// weighted alternatives; each alternative is a list of shapes and rule calls,
// each with a transform relative to its parent: translate `t`, rotate `r`
// (degrees, about x, y then z) and scale `s` (a number, or one per axis),
// applied in that order. `h` steps the palette. Any of them can be a
// function of the random number generator. Expanding a rule draws shapes
// until they get too small, or there's no room left.

/** A seeded random number generator: mulberry32. */
export function random(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A seed for a cell of space, from its coordinates and the world's seed. */
export function hash(x, y, z, seed) {
  let h = seed ^ Math.imul(x, 0x8da6b343)
  h ^= Math.imul(y, 0xd8163841)
  h ^= Math.imul(z, 0xcb1ab31f)
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
  return (h ^ (h >>> 16)) >>> 0
}

const DEG = Math.PI / 180
const value = (v, rng) => (typeof v === 'function' ? v(rng) : v)

// A column-major 4×4 for T × R × S
function local(out, t, r, s) {
  const [rx, ry, rz] = r ?? [0, 0, 0]
  const sx = Array.isArray(s) ? s[0] : (s ?? 1)
  const sy = Array.isArray(s) ? s[1] : (s ?? 1)
  const sz = Array.isArray(s) ? s[2] : (s ?? 1)
  const cx = Math.cos(rx * DEG)
  const snx = Math.sin(rx * DEG)
  const cy = Math.cos(ry * DEG)
  const sny = Math.sin(ry * DEG)
  const cz = Math.cos(rz * DEG)
  const snz = Math.sin(rz * DEG)
  // R = Rz × Ry × Rx
  out[0] = cy * cz * sx
  out[1] = cy * snz * sx
  out[2] = -sny * sx
  out[3] = 0
  out[4] = (cz * sny * snx - snz * cx) * sy
  out[5] = (snz * sny * snx + cz * cx) * sy
  out[6] = cy * snx * sy
  out[7] = 0
  out[8] = (cz * sny * cx + snz * snx) * sz
  out[9] = (snz * sny * cx - cz * snx) * sz
  out[10] = cy * cx * sz
  out[11] = 0
  out[12] = t ? t[0] : 0
  out[13] = t ? t[1] : 0
  out[14] = t ? t[2] : 0
  out[15] = 1
  return out
}

// out = a × b, for affine column-major 4×4s
function multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4]
    const b1 = b[c * 4 + 1]
    const b2 = b[c * 4 + 2]
    const b3 = b[c * 4 + 3]
    out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3
    out[c * 4 + 3] = b3
  }
  return out
}

// The largest scale along any axis
const scaleOf = (m) =>
  Math.sqrt(
    Math.max(
      m[0] * m[0] + m[1] * m[1] + m[2] * m[2],
      m[4] * m[4] + m[5] * m[5] + m[6] * m[6],
      m[8] * m[8] + m[9] * m[9] + m[10] * m[10]
    )
  )

const MAX_DEPTH = 400
// One matrix per depth: expansion is depth-first, so a parent's matrix is
// untouched while its children expand
const pool = Array.from({ length: MAX_DEPTH + 1 }, () => new Float32Array(16))
const scratch = new Float32Array(16)

/**
 * Expand `start` from the matrix `base`, calling `emit(shape, matrix, h)`
 * for each shape. `emit` returns false when there's no room left, which
 * stops the expansion.
 */
export function expand(
  rules,
  start,
  base,
  rng,
  emit,
  { minScale = 0.12 } = {}
) {
  let stopped = false

  const run = (name, depth, h) => {
    if (stopped || depth >= MAX_DEPTH) return
    const parent = pool[depth]
    if (scaleOf(parent) < minScale) return

    // A weighted choice of alternative
    const alternatives = rules[name]
    let total = 0
    for (const a of alternatives) total += a.w
    let pick = rng() * total
    let body = alternatives[alternatives.length - 1].body
    for (const a of alternatives) {
      if ((pick -= a.w) < 0) {
        body = a.body
        break
      }
    }

    for (const item of body) {
      if (stopped) return
      local(scratch, value(item.t, rng), value(item.r, rng), value(item.s, rng))
      const child = multiply(pool[depth + 1], parent, scratch)
      const hue = h + (value(item.h, rng) ?? 0)
      if (item.shape) {
        if (emit(item.shape, child, hue) === false) stopped = true
      } else {
        run(item.call, depth + 1, hue)
      }
    }
  }

  pool[0].set(base)
  run(start, 0, 0)
}

const between = (a, b) => (rng) => a + (b - a) * rng()

/**
 * The world's rules. The prisms are a unit tall and a unit across: `TRI` has
 * three sides and `HEX` six.
 */
export const RULES = {
  // A few structures scattered through a cell of space
  CLUSTER: [
    {
      w: 1,
      body: Array.from({ length: 14 }, () => ({
        call: 'SEED',
        t: (rng) => [
          (rng() - 0.5) * 50,
          (rng() - 0.5) * 50,
          (rng() - 0.5) * 50
        ],
        r: (rng) => [rng() * 360, rng() * 360, rng() * 360],
        s: between(1.4, 3.6),
        h: (rng) => Math.floor(rng() * 5)
      }))
    }
  ],

  SEED: [
    { w: 3, body: [{ call: 'TOWER' }] },
    { w: 2, body: [{ call: 'SPIRAL' }] },
    { w: 2, body: [{ call: 'RING' }] },
    { w: 1, body: [{ call: 'BRANCH' }] }
  ],

  // Hexagons stacked up, twisting and shrinking as they rise, now and then
  // splitting or capped with a flat triangle
  TOWER: [
    {
      w: 22,
      body: [
        { shape: 'HEX', s: [1, 0.5, 1] },
        { call: 'TOWER', t: [0, 0.55, 0], r: [0, 9, 0], s: 0.94 }
      ]
    },
    {
      w: 1.2,
      body: [
        { shape: 'HEX', s: [1, 0.5, 1] },
        { call: 'BRANCH', t: [0, 0.5, 0], h: 1 }
      ]
    },
    { w: 1, body: [{ shape: 'TRI', s: [1.5, 0.25, 1.5], h: 2 }] }
  ],

  // Two or three smaller towers leaning apart
  BRANCH: [
    {
      w: 1,
      body: [
        { call: 'TOWER', r: [0, 0, 32], s: 0.72 },
        { call: 'TOWER', r: [0, 0, -32], s: 0.72 }
      ]
    },
    {
      w: 1,
      body: [
        { call: 'TOWER', r: [32, 0, 0], s: 0.68 },
        { call: 'TOWER', r: [-32, 0, 0], s: 0.68 },
        { call: 'TOWER', r: [0, 45, 0], s: 0.6, h: 1 }
      ]
    }
  ],

  // The classic: step, turn and shrink, over and over, now and then flipping
  // to curl the other way
  SPIRAL: [
    {
      w: 30,
      body: [
        { shape: 'TRI', s: [1, 0.35, 1] },
        { call: 'SPIRAL', t: [0.9, 0, 0], r: [0, 22, 4], s: 0.97 }
      ]
    },
    {
      w: 1,
      body: [
        { shape: 'TRI', s: [1, 0.35, 1] },
        { call: 'SPIRAL', r: [180, 0, 0], h: 1 }
      ]
    },
    { w: 0.5, body: [{ call: 'TOWER', s: 0.8 }] }
  ],

  // Pillars around a circle, some sprouting small spirals
  RING: [
    {
      w: 1,
      body: Array.from({ length: 14 }, (_, i) => ({
        call: 'ARM',
        r: [0, (i * 360) / 14, 0]
      }))
    }
  ],
  ARM: [
    { w: 4, body: [{ shape: 'HEX', t: [4, 0, 0], s: [0.6, 1.6, 0.6] }] },
    {
      w: 1,
      body: [
        { shape: 'HEX', t: [4, 0, 0], s: [0.6, 1.6, 0.6] },
        { call: 'SPIRAL', t: [4, 0.8, 0], s: 0.35, h: 1 }
      ]
    }
  ]
}
