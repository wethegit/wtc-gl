// Module shapes, all composed of axis-aligned boxes. Ported from the
// manifold mandala sketch.
// Local space: x = radial (outward), y = tangential (along the strand),
// z = binormal. `w` is the tangential slot width, so shapes that span `w`
// link to their neighbours.

// Every random choice goes through `rng`, so a seeded divider rebuilds the
// same modules on remount.
let rng: () => number = Math.random

/** Swap the random source used by every helper below. */
export function setRng(next: () => number) {
  rng = next
}

/** Small, fast seeded PRNG. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const rand = (a = 0, b = 1) => a + rng() * (b - a)
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1))
export const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]
export const chance = (p: number) => rng() < p

type V3 = [number, number, number]

export class Builder {
  positions: number[] = []
  normals: number[] = []
  // current transform applied to every box: offset + uniform scale
  o: V3 = [0, 0, 0]
  s = 1

  // box by centre + size
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) {
    const [ox, oy, oz] = this.o
    const k = this.s
    const x0 = ox + (cx - sx / 2) * k
    const x1 = ox + (cx + sx / 2) * k
    const y0 = oy + (cy - sy / 2) * k
    const y1 = oy + (cy + sy / 2) * k
    const z0 = oz + (cz - sz / 2) * k
    const z1 = oz + (cz + sz / 2) * k
    const faces: [V3, V3, V3, V3, V3][] = [
      [
        [1, 0, 0],
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x1, y0, z1]
      ],
      [
        [-1, 0, 0],
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
        [x0, y1, z0]
      ],
      [
        [0, 1, 0],
        [x0, y1, z0],
        [x0, y1, z1],
        [x1, y1, z1],
        [x1, y1, z0]
      ],
      [
        [0, -1, 0],
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1]
      ],
      [
        [0, 0, 1],
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1]
      ],
      [
        [0, 0, -1],
        [x0, y0, z0],
        [x0, y1, z0],
        [x1, y1, z0],
        [x1, y0, z0]
      ]
    ]
    for (const [n, a, b, c, d] of faces) {
      for (const v of [a, b, c, a, c, d]) {
        this.positions.push(...v)
        this.normals.push(...n)
      }
    }
  }

  // box spanning two corners
  span(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    this.box(
      (x0 + x1) / 2,
      (y0 + y1) / 2,
      (z0 + z1) / 2,
      Math.abs(x1 - x0),
      Math.abs(y1 - y0),
      Math.abs(z1 - z0)
    )
  }

  /** Largest distance of any vertex from the module origin. */
  get extent() {
    let m = 0
    const p = this.positions
    for (let i = 0; i < p.length; i += 3)
      m = Math.max(m, Math.hypot(p[i], p[i + 1], p[i + 2]))
    return m
  }
}

// --- shapes ---------------------------------------------------------------

// Stepped radial fin.
function fin(B: Builder, w: number) {
  const L = rand(3, 8) * w * 0.6
  const k = randInt(3, 6)
  const t = w * rand(0.18, 0.32)
  const step = L / k
  for (let j = 0; j < k; j++) {
    const h = (k - j) * w * rand(0.25, 0.4)
    B.box(j * step + step / 2, 0, h / 2, step * 1.001, t, h)
  }
  B.box(-w * 0.2, 0, w * 0.15, w * 0.5, w * 0.6, w * 0.5)
  if (chance(0.5)) B.box(L / 2, 0, -w * 0.15, L, t * 2.2, w * 0.15)
}

// ⊐ staple: two prongs and a back, with feet.
function staple(B: Builder, w: number) {
  const L = rand(2, 6) * w * 0.5
  const t = w * rand(0.14, 0.22)
  const sp = w * rand(0.45, 0.8)
  const th = t * rand(1.2, 2)
  B.box(L / 2, sp / 2, 0, L, t, th)
  B.box(L / 2, -sp / 2, 0, L, t, th)
  B.box(L, 0, 0, t * 1.6, sp + t, th * 1.2)
  B.box(0, sp / 2, 0, t * 2.2, t * 2.2, th * 1.6)
  B.box(0, -sp / 2, 0, t * 2.2, t * 2.2, th * 1.6)
  if (chance(0.4)) B.box(L * 0.5, 0, 0, t, sp, t * 0.8)
}

// Barbell / I-beam with mismatched end caps.
function barbell(B: Builder, w: number) {
  const L = rand(3, 8) * w * 0.5
  const t = w * rand(0.12, 0.2)
  const c = w * rand(0.35, 0.6)
  B.box(L / 2, 0, 0, L, t, t)
  B.box(0, 0, 0, c * 0.6, c, c * 1.3)
  B.box(L, 0, 0, c, c * 0.5, c * 1.5)
  if (chance(0.5)) B.box(L * rand(0.3, 0.7), 0, 0, t * 2.5, c * 0.8, t * 2.5)
}

// 3D jack whose tangential arms reach its neighbours: becomes a chain.
function chain(B: Builder, w: number) {
  const c = w * rand(0.22, 0.36)
  const a = c * 0.4
  const zo = chance(0.5) ? c * 0.6 : 0
  B.box(0, 0, 0, c, c, c)
  B.box(0, 0, zo, a, w * 1.002, a)
  const r = c * rand(1.2, 2.5)
  B.box(r / 2, 0, 0, r, a, a)
  B.box(r, 0, 0, c * 0.8, c * 0.8, c * 0.8)
  if (chance(0.6)) {
    const h = c * rand(1, 2.2)
    B.box(0, 0, h / 2, a, a, h)
    B.box(0, 0, h, c * 0.7, c * 1.1, c * 0.5)
  }
  if (chance(0.4)) B.box(-r / 2, 0, 0, r, a, a)
}

// Hollow square window frame, sometimes nested.
function frame(B: Builder, w: number) {
  const s = w * rand(0.6, 0.95)
  const t = s * rand(0.1, 0.2)
  const depth = t * rand(1, 3)
  const nest = chance(0.5) ? 2 : 1
  const inXY = chance(0.5)
  for (let n = 0; n < nest; n++) {
    const q = s * (1 - n * 0.45)
    const h = q / 2
    if (inXY) {
      B.box(h, -h, 0, q + t, t, depth)
      B.box(h, h, 0, q + t, t, depth)
      B.box(0, 0, 0, t, q, depth)
      B.box(q, 0, 0, t, q, depth)
    } else {
      B.box(h, 0, -h, q + t, depth, t)
      B.box(h, 0, h, q + t, depth, t)
      B.box(0, 0, 0, t, depth, q)
      B.box(q, 0, 0, t, depth, q)
    }
  }
}

// Comb: radial spine with teeth of alternating height.
function comb(B: Builder, w: number) {
  const L = rand(4, 10) * w * 0.5
  const t = w * rand(0.1, 0.18)
  const k = randInt(3, 7)
  B.box(L / 2, 0, 0, L, t * 1.5, t * 1.5)
  for (let j = 0; j <= k; j++) {
    const h = w * (j % 2 ? 0.35 : 0.7) * rand(0.8, 1.2)
    B.box((j / k) * L, 0, h / 2, t, t, h)
  }
  if (chance(0.5)) B.box(L, 0, 0, t, w * 0.6, t)
}

// Random orthogonal 3D polyline: tetris-like hooks.
function hook(B: Builder, w: number) {
  const t = w * rand(0.14, 0.24)
  const segs = randInt(3, 5)
  let p: V3 = [0, 0, 0]
  let lastAxis = -1
  B.box(0, 0, 0, t * 1.6, t * 1.6, t * 1.6)
  for (let j = 0; j < segs; j++) {
    let axis: number
    do axis = randInt(0, 2)
    while (axis === lastAxis)
    lastAxis = axis
    // bias outward on x so it reads as radiating
    const sign = axis === 0 ? 1 : pick([-1, 1])
    const len = w * rand(0.4, axis === 1 ? 0.5 : 1.4) * sign
    const q: V3 = [...p]
    q[axis] += len
    B.span(
      Math.min(p[0], q[0]) - t / 2,
      Math.min(p[1], q[1]) - t / 2,
      Math.min(p[2], q[2]) - t / 2,
      Math.max(p[0], q[0]) + t / 2,
      Math.max(p[1], q[1]) + t / 2,
      Math.max(p[2], q[2]) + t / 2
    )
    p = q
  }
  B.box(...p, t * 2, t * 2, t * 2)
}

// Stacked pagoda / ziggurat along the binormal.
function tower(B: Builder, w: number) {
  const k = randInt(3, 6)
  const lh = w * rand(0.2, 0.35)
  for (let j = 0; j < k; j++) {
    const big = j % 2 === 0
    const s = w * (big ? 0.8 : 0.45) * (1 - (j / k) * 0.45)
    B.box(0, 0, j * lh, s * rand(0.9, 1.3), s, big ? lh * 0.6 : lh * 1.01)
  }
}

// Toothed beam spanning the slot: forms a continuous gear rim.
function gear(B: Builder, w: number) {
  const t = w * rand(0.12, 0.22)
  const d = t * rand(1.5, 3)
  B.box(0, 0, 0, t * 2, w * 1.002, d)
  B.box(t * 2, 0, 0, t * 2, w * rand(0.3, 0.55), d)
  if (chance(0.6)) B.box(-t * 2, 0, 0, t * 2, w * 0.25, d * 0.7)
  if (chance(0.5)) B.box(0, w / 2, d * 0.75, t, t, d * 0.8)
}

// Π arch, legs on either side of the slot.
function arch(B: Builder, w: number) {
  const s = w * rand(0.4, 0.8)
  const h = w * rand(0.6, 1.5)
  const t = w * rand(0.1, 0.18)
  const dx = t * rand(1, 2.5)
  B.box(0, -s / 2, h / 2, dx, t, h)
  B.box(0, s / 2, h / 2, dx, t, h)
  B.box(0, 0, h, dx, s + t, t * 1.5)
  B.box(0, 0, 0, dx * 1.4, s + t * 3, t)
}

// Little 2x2x2 lattice of cubes joined by rods.
function lattice(B: Builder, w: number) {
  const g = w * rand(0.3, 0.45)
  const c = g * rand(0.35, 0.55)
  const r = c * 0.35
  for (let x = 0; x < 2; x++)
    for (let y = 0; y < 2; y++)
      for (let z = 0; z < 2; z++) {
        const p: V3 = [x * g, (y - 0.5) * g, z * g]
        B.box(...p, c, c, c)
        if (x === 0) B.box(p[0] + g / 2, p[1], p[2], g, r, r)
        if (y === 0) B.box(p[0], 0, p[2], r, g, r)
        if (z === 0) B.box(p[0], p[1], p[2] + g / 2, r, r, g)
      }
}

export interface Shape {
  build: (B: Builder, w: number) => void
  tilt: number
  accent: boolean
}

export const SHAPES: Record<string, Shape> = {
  fin: { build: fin, tilt: 1.0, accent: false },
  staple: { build: staple, tilt: 0.8, accent: false },
  barbell: { build: barbell, tilt: 1.0, accent: false },
  chain: { build: chain, tilt: 0.2, accent: true },
  frame: { build: frame, tilt: 0.6, accent: false },
  comb: { build: comb, tilt: 1.0, accent: false },
  hook: { build: hook, tilt: 0.7, accent: false },
  tower: { build: tower, tilt: 0.5, accent: false },
  gear: { build: gear, tilt: 0.15, accent: true },
  arch: { build: arch, tilt: 0.4, accent: false },
  lattice: { build: lattice, tilt: 0.5, accent: true }
}

// Build a module: one shape, optionally echoed in shrinking layers along z/x.
export function buildModule(name: string, w: number) {
  const B = new Builder()
  const layers = chance(0.35) ? randInt(2, 3) : 1
  const dz = w * rand(0.6, 1.4) * pick([-1, 1])
  const dx = w * rand(-0.6, 0.6)
  for (let j = 0; j < layers; j++) {
    // each echo re-rolls its proportions, so layers read as siblings
    B.o = [dx * j, 0, dz * j]
    B.s = Math.pow(0.78, j)
    SHAPES[name].build(B, w)
  }
  return B
}

// The axis "line": a beam spanning the slot with a collar every module, so a
// chain of them reads as one segmented rod.
export function buildAxisModule(w: number) {
  const B = new Builder()
  const t = w * 0.22
  B.box(0, 0, 0, t, w * 1.002, t)
  B.box(0, 0, 0, t * 1.8, t * 0.7, t * 1.8)
  return B
}
