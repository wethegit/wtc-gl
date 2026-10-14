import { useRef } from 'react'
import {
  Camera,
  Geometry,
  GeometryAttribute,
  Mesh,
  Obj,
  Plane,
  Program,
  RenderTarget,
  Uniform,
  Vec3
} from 'wtc-gl'
import { useScrollScene } from '@wethegit/react-wtc-gl'

import helixVert from './helix.vert'
import moduleFrag from './module.frag'
import postFrag from './post.frag'
import postVert from './post.vert'
import {
  SHAPES,
  buildAxisModule,
  buildModule,
  chance,
  mulberry32,
  pick,
  rand,
  setRng
} from './shapes'
import type { Builder } from './shapes'

type RGB = [number, number, number]

export interface Palette {
  inner: RGB
  outer: RGB
  accent: RGB
  accent2: RGB
}

// Palettes from the manifold mandala.
export const PALETTES: Record<string, Palette> = {
  meadow: {
    inner: [0.98, 0.9, 0.32],
    outer: [0.6, 0.78, 0.32],
    accent: [0.93, 0.4, 0.47],
    accent2: [0.86, 0.6, 0.2]
  },
  lagoon: {
    inner: [0.4, 0.88, 0.86],
    outer: [0.22, 0.46, 0.78],
    accent: [1.0, 0.55, 0.28],
    accent2: [0.96, 0.86, 0.52]
  },
  lilac: {
    inner: [0.8, 0.64, 0.96],
    outer: [0.46, 0.36, 0.76],
    accent: [0.45, 0.9, 0.7],
    accent2: [0.98, 0.76, 0.86]
  },
  ember: {
    inner: [0.99, 0.6, 0.32],
    outer: [0.82, 0.22, 0.28],
    accent: [0.32, 0.34, 0.5],
    accent2: [0.99, 0.86, 0.56]
  }
}

export interface ManifoldDividerProps {
  palette?: Palette
  /** Number of helical strands coiling around the line, evenly phased. */
  strands?: number
  /** Helix radius as a fraction of the band's half-height. */
  radius?: number
  /** Helix turns across the width of the band. */
  turns?: number
  /** Flow along the line, in band-heights per second. Negative flows left. */
  speed?: number
  /** Draw the line itself, as a segmented rod. */
  axis?: boolean
  /** Seed for the module shapes; the same seed always builds the same band. */
  seed?: number
  /** Re-roll a strand's module every few seconds. */
  regrow?: boolean
  /**
   * How far the camera orbits over the line as the divider scrolls through
   * the viewport, in degrees either side of its resting angle: from below the
   * band at the top of the viewport to above it at the bottom. 0 holds it
   * still.
   */
  scrollTilt?: number
  /**
   * How far the strands stray from a clean helix, 0-1: an additive sine wave
   * bends their angle and radius and makes the whole curve wander. Strands
   * are drawn in toward the line as needed to stay within the band (or its
   * overflow), so high values also make them smaller.
   */
  chaos?: number
  /**
   * Chance, 0-1, that a strand rolls as a hero each time it's built or
   * regrown: much bigger modules hugging the line, with a big slow
   * undulation. At most about half the strands are heroes at once.
   */
  heroes?: number
  /**
   * Clip the band to the element. When false it may spill `overflow` past the
   * top and bottom, over whatever is there. Live, but the off-screen culling
   * margin is set when the scene is created.
   */
  clip?: boolean
  /** How far an unclipped band may spill, as a fraction of the element's height on each side. */
  overflow?: number
  playing?: boolean
  className?: string
}

const TAU = Math.PI * 2
// World units: the band is 2 * H tall at the axis, however many pixels that is.
const H = 10
const FOV = 20
const DEG = Math.PI / 180
// resting camera angle above the line
const ELEVATION = 12 * DEG
// far enough back that the band is 2H tall at the axis
const DIST = H / Math.tan((FOV * DEG) / 2)
// Largest distance from the axis that stays inside a half-height of `edge`
// from any camera angle: a point that far out, turned toward the camera, is
// magnified by DIST / (DIST - band) and must still land within `edge`.
const bandFor = (edge: number) => (edge * DIST) / (DIST + edge)
// chaos: sideways wander of the curve per unit of chaos, in world units
const WANDER = H * 0.22
// helix.vert: chaos stretches the radius by up to 45% per unit
const CHAOS_RADIUS = 0.45
// radial undulation: amp, freq (per unit x), speed - a small quick pulse, or
// a big slow swell for heroes
const PULSE = [0.08, 0.35, 0.8, 0]
// overflow culling margin, in CSS px
const OVERFLOW_MARGIN = 400

const mix = (a: RGB, b: RGB, t: number) =>
  a.map((v, i) => v + (b[i] - v) * t) as RGB
const jitter = (c: RGB, j: number) =>
  c.map((v) => Math.min(1, Math.max(0, v + rand(-j, j)))) as RGB

interface Strand {
  index: number
  isAxis: boolean
  hero: boolean
  mesh: Mesh
  // regrow: the strand eases toward `target`, re-rolls its module at zero
  scale: number
  target: number
  fit: number
  // furthest any module vertex reaches from the strand curve, at full size
  reach: number
  // shrinks the strand toward the axis when chaos would push it off the band
  squeeze: number
  hA: number[]
  hB: number[]
  hC: number[]
  hD: number[]
  col: RGB
}

const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A section divider: manifold-style box modules strung on helices that coil
 * around a horizontal line and flow along it. Registers itself with the
 * nearest `ScrollRendererProvider`, so every divider on the page shares one
 * WebGL context.
 *
 * Shape props are captured when the scene is created - change `key` to
 * rebuild with new ones. `playing` is live.
 */
export function ManifoldDivider({
  palette = PALETTES.meadow,
  strands = 2,
  radius = 0.42,
  turns = 5,
  speed = 0.25,
  axis = true,
  seed = 1,
  regrow = true,
  scrollTilt = 25,
  chaos = 0,
  heroes = 0,
  clip = true,
  overflow = 0.5,
  playing = true,
  className = ''
}: ManifoldDividerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const playingRef = useRef(playing)
  playingRef.current = playing

  const config = {
    palette,
    strands,
    radius,
    turns,
    speed,
    axis,
    seed,
    regrow,
    scrollTilt,
    chaos,
    heroes,
    clip,
    overflow
  }
  const configRef = useRef(config)
  configRef.current = config

  // per-frame work, built in setup and run from onBeforeRender
  const frameRef = useRef<((delta: number, rect: DOMRect) => void) | null>(null)

  useScrollScene(
    ref,
    ({ gl, renderer, scrollScene }) => {
      const element = ref.current!
      if (!gl.getExtension('EXT_color_buffer_float')) {
        // no float G-buffer: leave the CSS fallback line showing
        element.dataset.fallback = ''
        return
      }

      const cfg = configRef.current
      const random = mulberry32(cfg.seed)
      const reducedMotion = prefersReducedMotion()
      const { dpr, premultipliedAlpha: premultiplied } = renderer.renderer

      // Scene G-buffer, resized to the element on the first frame:
      //   textures[0]: rgb lit colour, a linear view depth (0 = empty)
      //   textures[1]: xyz view-space normal
      // A depth renderbuffer (24-bit) rather than a texture, since nothing
      // samples it.
      const target = new RenderTarget(gl, {
        width: 1,
        height: 1,
        colour: 2,
        type: gl.FLOAT,
        format: gl.RGBA,
        internalFormat: gl.RGBA32F,
        minFilter: gl.NEAREST,
        magFilter: gl.NEAREST,
        depthTexture: false
      })
      let size = [1, 1, 0]

      // --- uniforms (keys are the GLSL names)
      const u = {
        u_time: new Uniform({ name: 'u_time', value: 0, kind: 'float' }),
        u_chaos: new Uniform({
          name: 'u_chaos',
          value: [0, WANDER],
          kind: 'float_vec2'
        }),
        u_squeeze: new Uniform({ name: 'u_squeeze', value: 1, kind: 'float' }),
        u_fade: new Uniform({ name: 'u_fade', value: H * 2, kind: 'float' }),
        u_hA: new Uniform({
          name: 'u_hA',
          value: [0, 0, 0, 0],
          kind: 'float_vec4'
        }),
        u_hB: new Uniform({
          name: 'u_hB',
          value: [1, 1, 0, 0],
          kind: 'float_vec4'
        }),
        u_hC: new Uniform({
          name: 'u_hC',
          value: [0, 0, 0, 0],
          kind: 'float_vec4'
        }),
        u_hD: new Uniform({
          name: 'u_hD',
          value: [...PULSE],
          kind: 'float_vec4'
        }),
        u_hCol: new Uniform({
          name: 'u_hCol',
          value: [1, 1, 1],
          kind: 'float_vec3'
        })
      }
      const post = {
        ...scrollScene.uniforms,
        b_scene: new Uniform({
          name: 'b_scene',
          value: target.textures[0],
          kind: 'texture'
        }),
        b_normal: new Uniform({
          name: 'b_normal',
          value: target.textures[1],
          kind: 'texture'
        }),
        u_tanFov: new Uniform({
          name: 'u_tanFov',
          value: Math.tan((FOV * DEG) / 2),
          kind: 'float'
        }),
        u_size: new Uniform({
          name: 'u_size',
          value: [1, 1],
          kind: 'float_vec2'
        }),
        u_offset: new Uniform({
          name: 'u_offset',
          value: [0, 0],
          kind: 'float_vec2'
        }),
        u_stretch: new Uniform({ name: 'u_stretch', value: 1, kind: 'float' }),
        u_dpr: new Uniform({ name: 'u_dpr', value: dpr, kind: 'float' }),
        u_fog: new Uniform({ name: 'u_fog', value: 1, kind: 'float' }),
        u_fogStart: new Uniform({
          name: 'u_fogStart',
          value: 0,
          kind: 'float'
        }),
        u_premultiplied: new Uniform({
          name: 'u_premultiplied',
          value: premultiplied ? 1 : 0,
          kind: 'float'
        })
      }

      const moduleProgram = new Program(gl, {
        vertex: helixVert,
        fragment: moduleFrag,
        uniforms: u,
        cullFace: 0 // mirrored modules flip winding
      })

      // The post pass draws its own quad over the element (and any overflow)
      // rather than relying on the renderer's per-element viewport, so the
      // band can spill past the element. On a premultiplied canvas it blends
      // over whatever is already there; otherwise it writes straight alpha,
      // which is exact over empty canvas but erases anything it overlaps.
      const postGeometry = new Plane(gl)
      const postProgram = new Program(gl, {
        vertex: postVert,
        fragment: postFrag,
        uniforms: post,
        depthTest: false,
        depthWrite: false
      })
      if (premultiplied)
        postProgram.setBlendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      new Mesh(gl, {
        geometry: postGeometry,
        program: postProgram,
        frustumCulled: false
      }).setParent(scrollScene.scene)

      // --- the G-buffer scene: one instanced mesh per strand
      const gScene = new Obj()
      const camera = new Camera({ fov: FOV, near: 1, far: 1000 })
      // band geometry, derived from the element's aspect
      let len = 0
      let R = 0
      let coil = 0
      // how far from the axis anything may reach (see bandFor)
      let band = 0

      const strandList: Strand[] = []

      function configure(strand: Strand) {
        setRng(random)
        const { palette, strands, heroes } = configRef.current
        const { isAxis, index } = strand

        // heroes: much bigger modules, pulled in toward the line to make room,
        // with a big slow swell instead of the quick pulse
        const heroCount = strandList.filter(
          (s) => s !== strand && s.hero
        ).length
        const hero =
          !isAxis &&
          heroCount < Math.max(1, Math.floor((strands + 1) / 2)) &&
          chance(heroes)
        strand.hero = hero
        strand.hD = isAxis
          ? [0, 0, 0, 0]
          : hero
            ? [rand(0.25, 0.5), rand(0.06, 0.12), 0.35, 0]
            : [...PULSE]

        // arc length of one unit of x along the helix
        const r = isAxis ? 0 : R * (hero ? rand(0.25, 0.55) : rand(0.88, 1.08))
        const arc = Math.hypot(1, r * coil)

        let name = 'axis'
        let B: Builder
        let N: number
        let w = isAxis ? H * 0.12 : rand(1.6, 2.6) * (hero ? rand(1.8, 2.8) : 1)
        const breathe = isAxis ? 0 : chance(0.6) ? rand(0.05, 0.25) : 0
        // modules (breathing outward included) must fit between the pulsing
        // helix and the band edge: shrink the slot (and re-roll) until they
        // do, so linking shapes still link. Chaos is handled per frame by
        // squeezing the whole strand.
        const room = band - r * (1 + strand.hD[0])
        for (let tries = 0; ; tries++) {
          N = Math.max(8, Math.round((len * arc) / w))
          w = (len * arc) / N
          if (isAxis) {
            B = buildAxisModule(w)
            break
          }
          name = pick(Object.keys(SHAPES))
          B = buildModule(name, w)
          const fit = room / (B.extent * (1 + breathe))
          if (fit >= 1 || tries === 3) break
          w *= Math.max(0.4, fit)
        }
        strand.fit = isAxis ? 1 : Math.min(1, room / (B.extent * (1 + breathe)))
        strand.reach = B.extent * strand.fit * (1 + breathe)

        const shape = SHAPES[name]
        let col: RGB
        if (isAxis) col = mix(palette.outer, [0.15, 0.12, 0.14], 0.25)
        else {
          col = mix(
            palette.inner,
            palette.outer,
            strands > 1 ? index / (strands - 1) : 0.5
          )
          if (shape.accent ? chance(0.6) : chance(0.15))
            col = chance(0.5) ? palette.accent : palette.accent2
        }
        strand.col = jitter(col, 0.04)

        strand.hA = [
          r,
          coil,
          isAxis ? 0 : (index / strands) * TAU + rand(-0.2, 0.2),
          0
        ]
        strand.hB = [
          N,
          len,
          strand.hB?.[2] ?? 0,
          isAxis ? 0 : rand(-1, 1) * shape.tilt * 0.6
        ]
        strand.hC = isAxis
          ? [0, 0, 0, 0]
          : [
              chance(0.25) ? pick([2, 3, -2, -3, 8]) : 0,
              chance(0.5) ? 1 : 0,
              breathe,
              pick([6, 10, 14, 20])
            ]

        // geometry: module verts + per-instance slot/random
        const inst = new Float32Array(N * 2)
        for (let i = 0; i < N; i++) inst.set([i, random()], i * 2)
        const geometry = new Geometry(gl, {
          position: new GeometryAttribute({
            size: 3,
            data: new Float32Array(B.positions)
          }),
          normal: new GeometryAttribute({
            size: 3,
            data: new Float32Array(B.normals)
          }),
          inst: new GeometryAttribute({ size: 2, data: inst, instanced: 1 })
        })

        if (strand.mesh) {
          strand.mesh.geometry.remove()
          strand.mesh.geometry = geometry
        } else {
          strand.mesh = new Mesh(gl, {
            geometry,
            program: moduleProgram,
            frustumCulled: false
          })
          // per-strand uniforms are pushed into the shared program before draw
          strand.mesh.addBeforeRender(() => {
            u.u_hA.value = strand.hA
            u.u_hB.value = strand.hB
            u.u_hC.value = strand.hC
            u.u_hD.value = strand.hD
            u.u_hCol.value = strand.col
            u.u_squeeze.value = strand.squeeze
          })
          strand.mesh.setParent(gScene)
        }
      }

      // Orbit the camera over the line, always DIST from its centre.
      let elevation = NaN
      function aim(e: number) {
        if (e === elevation) return
        elevation = e
        camera.position.reset(0, Math.sin(e) * DIST, Math.cos(e) * DIST)
        camera.lookAt(new Vec3(0, 0, 0))
      }

      // Fit the band to the element: the axis spans its full width and the
      // band is 2H tall at the element's height. `bleed` (physical px) grows
      // the G-buffer above and below; the field of view widens to match so
      // the band itself stays the same size.
      function layout(width: number, height: number, bleed: number) {
        size = [width, height, bleed]
        const full = height + bleed * 2
        target.resize(width, full)
        post.u_size.value = [width, full]
        post.u_stretch.value = full / height

        const stretch = full / height
        const tanFov = Math.tan((FOV * DEG) / 2) * stretch
        post.u_tanFov.value = tanFov
        camera.perspective({
          fov: (2 * Math.atan(tanFov)) / DEG,
          aspect: width / full,
          near: DIST * 0.4,
          far: DIST * 1.8
        })
        band = bandFor(H * 0.96 * stretch)

        const aspect = width / height

        post.u_fogStart.value = DIST - H * 0.2
        post.u_fog.value = H * 1.4
        u.u_fade.value = Math.min(H * 3, H * aspect * 0.35)

        // geometry depends on the band's length, so rebuild every strand
        const { radius, turns, strands, axis } = configRef.current
        len = 2 * H * aspect
        R = radius * H
        coil = (TAU * turns) / len
        if (strandList.length === 0) {
          const count = strands + (axis ? 1 : 0)
          for (let i = 0; i < count; i++)
            strandList.push({
              index: i,
              isAxis: axis && i === strands,
              hero: false,
              scale: reducedMotion ? 1 : 0,
              target: 1
            } as Strand)
        }
        strandList.forEach(configure)
      }

      let time = 0
      let flow = 0
      let nextRegrow = rand(4, 7)

      frameRef.current = (delta, rect) => {
        const [width, height] = scrollScene.u_resolution.value as number[]
        if (width < 2 || height < 2) return
        const { clip, overflow } = configRef.current
        const bleed = clip ? 0 : Math.round(height * Math.max(0, overflow))
        if (width !== size[0] || height !== size[1] || bleed !== size[2])
          layout(width, height, bleed)
        const [ox, oy] = scrollScene.u_origin.value as number[]
        post.u_offset.value = [ox, oy - bleed]

        // scroll progress: -1 with the band's centre at the top of the
        // viewport, 1 at the bottom (clamped a little past either edge)
        const centre = (rect.top + rect.height / 2) / window.innerHeight
        const progress = Math.min(1.25, Math.max(-0.25, centre)) * 2 - 1
        const tilt = reducedMotion ? 0 : configRef.current.scrollTilt * DEG
        aim(ELEVATION + progress * tilt)

        setRng(random)
        const dt = playingRef.current && !reducedMotion ? delta / 1000 : 0
        time += dt
        flow += configRef.current.speed * H * dt
        u.u_time.value = time
        const chaos = Math.max(0, configRef.current.chaos)
        u.u_chaos.value = [chaos, WANDER]

        if (configRef.current.regrow && dt > 0 && time > nextRegrow) {
          const strand = pick(strandList.filter((s) => !s.isAxis))
          if (strand) strand.target = 0
          nextRegrow = time + rand(5, 9)
        }

        // strands unfold even while paused, so a paused band isn't empty
        const ke = 1 - Math.exp((-delta / 1000) * 3)
        for (const strand of strandList) {
          strand.scale += (strand.target - strand.scale) * ke
          if (strand.target === 0 && strand.scale < 0.02) {
            configure(strand)
            strand.target = 1
          }
          strand.hA[3] = strand.scale * strand.fit

          // worst case distance from the axis with this much chaos
          const extent =
            strand.hA[0] * (1 + strand.hD[0]) * (1 + chaos * CHAOS_RADIUS) +
            chaos * WANDER * Math.SQRT2 +
            strand.reach
          strand.squeeze = Math.min(1, band / extent)
          strand.hB[2] = flow % len
        }

        // G-buffer pass. The shared renderer leaves its scissor on between
        // scenes; the offscreen target needs all of it.
        gl.disable(gl.SCISSOR_TEST)
        renderer.renderer.clearColour = [0, 0, 0, 0]
        renderer.renderer.render({
          scene: gScene,
          camera,
          target,
          clear: true
        })
        gl.enable(gl.SCISSOR_TEST)
      }

      return () => {
        frameRef.current = null
        strandList.forEach((s) => s.mesh?.geometry.remove())
        moduleProgram.remove()
        postGeometry.remove()
        postProgram.remove()
        target.remove()
      }
    },
    {
      // the post quad positions itself (see post.vert), so the renderer
      // neither locks the viewport to the element nor scissors it
      useViewport: false,
      clipToViewport: false,
      elementSpace: true,
      // keep rendering while overflow above/below may still be on screen
      margin: clip ? 0 : OVERFLOW_MARGIN,
      onBeforeRender: (delta, rect) => frameRef.current?.(delta, rect)
    }
  )

  return (
    <div
      ref={ref}
      className={`manifold-divider ${className}`}
      role="presentation"
      aria-hidden
    />
  )
}
