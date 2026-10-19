// The module catalogue. Each shape builds one module from boxes and spheres,
// in module space: x points out from the centre, y up, and z along the ring.
// `w` is the module's slot width along z; parts that span `w * 1.002` touch
// their neighbours, so a ring of them joins up into one band.
//
// `b.box(centre, size, colour, rotation)` and
// `b.sphere(centre, radius, colour, scale)` add a part. Colours are keys into
// the ring's palette: 'base' or 'accent'.

const rand = (min, max) => min + Math.random() * (max - min)
const pick = (list) => list[Math.floor(Math.random() * list.length)]

export const SHAPES = {
  // Stepped blades getting shorter outwards, on a base
  fin: {
    build(b, w) {
      b.box([0, 0.06, 0], [0.9, 0.12, w * 1.002])
      const blades = pick([2, 3, 4])
      const height = rand(0.7, 2.2)
      for (let j = 0; j < blades; j++) {
        const h = height * (1 - j * 0.22)
        b.box([-0.3 + j * 0.2, 0.12 + h / 2, w * 0.12], [0.08, h, w * 0.55])
      }
    }
  },

  // A radial rod with spheres of different sizes at each end
  barbell: {
    build(b, w) {
      const length = rand(0.8, 2)
      const y = rand(0.25, 0.9)
      b.box([0, y, 0], [length, 0.08, 0.08])
      b.box([0, y / 2, 0], [0.08, y, 0.08])
      b.sphere([-length / 2, y, 0], rand(0.1, 0.18), 'accent')
      b.sphere([length / 2, y, 0], Math.min(rand(0.18, 0.4), w * 0.45))
    }
  },

  // A beam spanning the slot with teeth, so the ring becomes a gear rim
  gear: {
    accent: true,
    build(b, w) {
      b.box([0, 0.1, 0], [0.22, 0.2, w * 1.002])
      const teeth = pick([1, 2, 3])
      const tall = rand(0.25, 1.1)
      for (let j = 0; j < teeth; j++) {
        const z = teeth === 1 ? 0 : (j / (teeth - 1) - 0.5) * w * 0.6
        b.box([0.12, 0.2 + tall / 2, z], [0.12, tall, w * 0.18], 'accent')
      }
    }
  },

  // Two prongs joined by a bar, on a strip of floor
  staple: {
    build(b, w) {
      const h = rand(0.5, 1.6)
      b.box([0, 0.03, 0], [0.3, 0.06, w * 1.002])
      b.box([0, 0.06 + h / 2, -w * 0.3], [0.08, h, 0.08])
      b.box([0, 0.06 + h / 2, w * 0.3], [0.08, h, 0.08])
      b.box([0, 0.06 + h, 0], [0.08, 0.08, w * 0.68], 'accent')
    }
  },

  // A Π across the slot on a base plate
  arch: {
    build(b, w) {
      const h = rand(0.5, 1.4)
      b.box([0, 0.03, 0], [0.46, 0.06, w * 1.002])
      b.box([0, 0.06 + h / 2, -w * 0.34], [0.14, h, 0.12])
      b.box([0, 0.06 + h / 2, w * 0.34], [0.14, h, 0.12])
      b.box([0, 0.12 + h, 0], [0.18, 0.12, w * 0.84], 'accent')
    }
  },

  // Stacked blocks narrowing upwards, with a sphere on top
  tower: {
    build(b, w) {
      let size = Math.min(0.7, w * 0.8)
      let y = 0
      const levels = pick([3, 4, 5, 6])
      for (let j = 0; j < levels; j++) {
        const h = j % 2 ? 0.08 : 0.18
        b.box([0, y + h / 2, 0], [size, h, size], j % 2 ? 'accent' : 'base', [
          0,
          j * 0.3,
          0
        ])
        y += h
        size *= 0.78
      }
      b.sphere([0, y + size * 0.4, 0], size * 0.5, 'accent')
    }
  },

  // Three spheres stacked on a plate
  orbs: {
    accent: true,
    build(b, w) {
      b.box([0, 0.03, 0], [0.4, 0.06, w * 1.002])
      let y = 0.06
      const grow = rand(1, 1.7)
      for (const r of [0.17, 0.12, 0.08]) {
        const radius = Math.min(r * grow, w * 0.45)
        b.sphere([0, y + radius, 0], radius, r < 0.1 ? 'base' : 'accent')
        y += radius * 1.8
      }
    }
  },

  // A hollow square standing up, leaning along the ring
  frame: {
    build(b, w) {
      const s = Math.min(rand(0.6, 1.3), w * 0.95)
      const t = 0.07
      b.box([0, 0.025, 0], [0.3, 0.05, w * 1.002])
      const y = 0.05 + s / 2
      b.box([0, y - s / 2 + t / 2, 0], [t, t, s], 'accent')
      b.box([0, y + s / 2 - t / 2, 0], [t, t, s], 'accent')
      b.box([0, y, -s / 2 + t / 2], [t, s, t], 'accent')
      b.box([0, y, s / 2 - t / 2], [t, s, t], 'accent')
    }
  }
}
