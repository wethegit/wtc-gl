// Based on OGL (https://github.com/oframe/ogl), MIT © 2019 Nathan Gordon, and
// three.js MeshLine (https://github.com/spite/THREE.MeshLine), MIT © 2016
// Jaume Sanchez

import type { WTCGLGeometryAttribute, WTCGLRenderingContext } from '../types'
import { Mesh } from '../core/Mesh'
import { Program } from '../core/Program'
import { Uniform } from '../core/Uniform'
import { Texture } from '../core/Texture'
import { Geometry } from '../geometry/Geometry'
import { GeometryAttribute } from '../geometry/GeometryAttribute'
import { Path } from '../path/Path'
import { toXYZ } from '../path/segments'
import type { PathPoint, XYZ } from '../path/segments'
import { rotationMinimisingFrames } from '../path/frames'

import extrudeSource from './polyline-extrude.glsl'
import polylineVertex from './polyline.vert'
import polylineFragment from './polyline.frag'

/**
 * The billboard extrusion as GLSL, for custom vertex shaders: a function
 * `vec4 polylineExtrude(projection, modelView, position, prev, next, side,
 * width, resolution, sizeAttenuation, miterLimit)` returning the clip-space
 * position.
 */
export const polylineExtrude: string = extrudeSource

/**
 * A width multiplier along the line, for tapers: a function of `u` (0 to 1 by
 * distance along the line) and `i`, the point's index.
 */
export type PolylineTaper = (u: number, i: number) => number
/** A tilt in radians, or a function of `u` (0 to 1 by distance). */
export type PolylineTilt = number | ((u: number) => number)

export interface PolylineOptions {
  points: Path | PathPoint[]
  closed: boolean
  curveDivisions: number
  width: number
  taper: PolylineTaper | null
  sizeAttenuation: boolean
  billboard: boolean
  facing: PathPoint
  tilt: PolylineTilt
  bank: number
  miterLimit: number
  colour: [number, number, number]
  opacity: number
  map: Texture | null
  repeat: number | [number, number]
  alphaTest: number
  dashArray: number
  dashRatio: number
  dashOffset: number
  visibility: number
  vertex: string
  fragment: string
  uniforms: Record<string, Uniform>
  attributes: Record<string, WTCGLGeometryAttribute>
  transparent: boolean
  depthTest: boolean
  depthWrite: boolean
  frustumCulled: boolean
  renderOrder: number
}

type Vec = [number, number, number]

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: Vec) => Math.sqrt(dot(a, a))
const normalise = (a: Vec): Vec => {
  const l = len(a)
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]
}
const toVec3 = (a: Vec) => ({ x: a[0], y: a[1], z: a[2] })

const identity4 = () =>
  new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
const identity3 = () => new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])

// The attributes a Polyline builds, re-uploaded when its points change
const OWN = new Set([
  'position',
  'prev',
  'next',
  'side',
  'width',
  'lineDistance',
  'lineU',
  'across',
  'normal'
])

// A white pixel per context, bound in place of a missing map: a sampler
// always needs a texture
const blanks = new WeakMap<WTCGLRenderingContext, Texture>()
const blank = (gl: WTCGLRenderingContext) => {
  let texture = blanks.get(gl)
  if (!texture) {
    texture = new Texture(gl, {
      data: new Uint8Array([255, 255, 255, 255]),
      width: 1,
      height: 1,
      generateMipmaps: false
    })
    blanks.set(gl, texture)
  }
  return texture
}

// The normal of the plane a point set lies in (Newell's method), or undefined
// when the points aren't flat or don't span a plane
const planeNormal = (points: Vec[]): Vec | undefined => {
  const n: Vec = [0, 0, 0]
  const c: Vec = [0, 0, 0]
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    n[0] += (a[1] - b[1]) * (a[2] + b[2])
    n[1] += (a[2] - b[2]) * (a[0] + b[0])
    n[2] += (a[0] - b[0]) * (a[1] + b[1])
    c[0] += a[0] / points.length
    c[1] += a[1] / points.length
    c[2] += a[2] / points.length
  }
  let extent = 0
  for (const p of points) extent = Math.max(extent, len(sub(p, c)))
  if (len(n) < 1e-9 * Math.max(extent * extent, 1e-12)) return undefined
  const unit = normalise(n)
  for (const p of points) {
    if (Math.abs(dot(sub(p, c), unit)) > 1e-6 * extent) return undefined
  }
  return unit
}

/**
 * A line drawn as a strip of triangles, so it can be any width, taper, dash,
 * carry a texture and draw itself on. A MeshLine for wtc-gl.
 *
 * Each point is doubled, one vertex either side of the line, and the shader
 * moves them apart. By default the line is a billboard: it's extruded in
 * screen space so it always faces the camera, with `width` in CSS pixels (the
 * viewport's pixels over the renderer's `dpr`, so it also works in a render
 * target), or in world units with `sizeAttenuation`. `taper` multiplies it
 * along the line. Drawn without a camera, the points are in clip space.
 *
 * With `billboard: false` it's a flat ribbon in world space instead, `width`
 * world units wide. Its face follows rotation-minimising frames, starting
 * out facing `facing` (by default the plane the points lie in, so a flat shape lies
 * flat). `tilt` rolls it about the line, and `bank` rolls it into turns, in
 * proportion to how tightly it curves. The face normal is passed to the
 * shader as `v_normal`, for lighting in a custom fragment shader.
 *
 * `points` is a list of points, or a `Path` or `Curve`, which is sampled with
 * `toPolyline(curveDivisions)` so its corners are kept. `setPoints` replaces
 * them, reusing the buffers when the count is the same, and `push` adds a
 * point to the end and drops the first, for trails.
 *
 * Corners are mitred, up to `miterLimit` half widths. There are no round
 * joins or caps, and overlapping transparent parts double up unless depth
 * writes are off or `alphaTest` is used. A billboard line with a width in
 * pixels can't be measured in world space, so its culling bounds only cover
 * its points.
 *
 * Custom shaders get the attributes `position`, `prev`, `next`, `side`,
 * `width`, `lineDistance` and `lineU`, plus `across` and `normal` for a
 * ribbon, and can use `polylineExtrude`, the billboard extrusion as GLSL.
 * `uniforms` and `attributes` add to the line's own, for example a texture
 * the points are read from and an instanced attribute, to draw many lines
 * at once.
 */
export class Polyline extends Mesh {
  /** Whether the line faces the camera. Set when it's made. */
  readonly billboard: boolean
  /** The uniforms, for the values without a setter, like `u_map`. */
  readonly uniforms: Record<string, Uniform>

  #points = new Float32Array(0)
  #path: Path | null = null
  #closed: boolean | undefined
  #curveDivisions: number
  #taper: PolylineTaper | null
  #facing: XYZ | undefined
  #tilt: PolylineTilt | undefined
  #bank: number
  #miterLimit: number
  #maxWidth = 1
  #baseRadius = 0

  constructor(
    gl: WTCGLRenderingContext,
    {
      points,
      closed,
      curveDivisions = 12,
      width = 1,
      taper = null,
      sizeAttenuation = false,
      billboard = true,
      facing,
      tilt,
      bank = 0,
      miterLimit = 4,
      colour = [1, 1, 1],
      opacity = 1,
      map = null,
      repeat = 1,
      alphaTest = 0,
      dashArray = 0,
      dashRatio = 0.5,
      dashOffset = 0,
      visibility = 1,
      vertex,
      fragment,
      uniforms: extraUniforms = {},
      attributes = {},
      transparent = opacity < 1 || !!map,
      depthTest = true,
      depthWrite = true,
      frustumCulled = true,
      renderOrder = 0
    }: Partial<PolylineOptions> = {}
  ) {
    if (!points) throw new Error('Polyline: points are required')

    const uniforms: Record<string, Uniform> = {
      u_width: new Uniform({
        name: 'width',
        value: width,
        kind: 'float'
      }),
      u_resolution: new Uniform({
        name: 'resolution',
        value: [1, 1],
        kind: 'float_vec2'
      }),
      u_sizeAttenuation: new Uniform({
        name: 'sizeAttenuation',
        value: sizeAttenuation ? 1 : 0,
        kind: 'float'
      }),
      u_miterLimit: new Uniform({
        name: 'miterLimit',
        value: miterLimit,
        kind: 'float'
      }),
      u_colour: new Uniform({
        name: 'colour',
        value: [...colour],
        kind: 'float_vec3'
      }),
      u_opacity: new Uniform({
        name: 'opacity',
        value: opacity,
        kind: 'float'
      }),
      u_alphaTest: new Uniform({
        name: 'alphaTest',
        value: alphaTest,
        kind: 'float'
      }),
      u_dashArray: new Uniform({
        name: 'dashArray',
        value: dashArray,
        kind: 'float'
      }),
      u_dashRatio: new Uniform({
        name: 'dashRatio',
        value: dashRatio,
        kind: 'float'
      }),
      u_dashOffset: new Uniform({
        name: 'dashOffset',
        value: dashOffset,
        kind: 'float'
      }),
      u_visibility: new Uniform({
        name: 'visibility',
        value: visibility,
        kind: 'float'
      }),
      u_repeat: new Uniform({
        name: 'repeat',
        value: typeof repeat === 'number' ? [repeat, 1] : [...repeat],
        kind: 'float_vec2'
      }),
      u_map: new Uniform({
        name: 'map',
        value: map ?? blank(gl),
        kind: 'texture'
      }),
      u_useMap: new Uniform({
        name: 'useMap',
        value: map ? 1 : 0,
        kind: 'float'
      }),
      u_premultiplied: new Uniform({
        name: 'premultiplied',
        value: gl.renderer?.premultipliedAlpha ? 1 : 0,
        kind: 'float'
      }),
      // Mesh sets these when there's a camera. Without one, they stay the
      // identity, so the points are in clip space.
      u_projectionMatrix: new Uniform({
        name: 'projectionMatrix',
        value: identity4(),
        kind: 'mat4'
      }),
      u_modelViewMatrix: new Uniform({
        name: 'modelViewMatrix',
        value: identity4(),
        kind: 'mat4'
      }),
      u_normalMatrix: new Uniform({
        name: 'normalMatrix',
        value: identity3(),
        kind: 'mat3'
      }),
      ...extraUniforms
    }

    const defines = billboard ? '#define BILLBOARD\n' : ''
    const program = new Program(gl, {
      vertex:
        vertex ??
        `#version 300 es\n${defines}${billboard ? polylineExtrude : ''}\n${polylineVertex}`,
      fragment: fragment ?? `#version 300 es\n${defines}${polylineFragment}`,
      uniforms,
      transparent,
      depthTest,
      depthWrite,
      // Seen from both sides
      cullFace: 0
    })

    super(gl, {
      geometry: new Geometry(gl, { ...attributes }),
      program,
      frustumCulled,
      renderOrder
    })

    this.billboard = billboard
    this.uniforms = uniforms
    this.#closed = closed
    this.#curveDivisions = curveDivisions
    this.#taper = taper
    this.#facing = facing === undefined ? undefined : toXYZ(facing)
    this.#tilt = tilt
    this.#bank = bank
    this.#miterLimit = miterLimit

    const resolution = uniforms.u_resolution.value as number[]
    const clip = {
      projection: uniforms.u_projectionMatrix.value,
      modelView: uniforms.u_modelViewMatrix.value,
      normal: uniforms.u_normalMatrix.value
    }
    this.addBeforeRender(({ camera }) => {
      // The size of whatever is being drawn to, the canvas or a render
      // target, in CSS pixels
      const renderer = gl.renderer
      const viewport = renderer?.state.viewport
      const dpr = renderer?.dpr || 1
      resolution[0] = (viewport?.width || gl.drawingBufferWidth || 1) / dpr
      resolution[1] = (viewport?.height || gl.drawingBufferHeight || 1) / dpr

      // Back to clip space after drawing with a camera
      if (!camera) {
        uniforms.u_projectionMatrix.value = clip.projection
        uniforms.u_modelViewMatrix.value = clip.modelView
        uniforms.u_normalMatrix.value = clip.normal
      }
    })

    this.setPoints(points)
  }

  /**
   * Replace the points. The buffers are reused when the number of points is
   * unchanged, so this is cheap enough to call every frame.
   * @param {Path | PathPoint[]} points - The new points, or a `Path` to sample
   */
  setPoints(points: Path | PathPoint[]): void {
    const path = points instanceof Path ? points : null
    const list =
      points instanceof Path
        ? points.toPolyline(this.#curveDivisions).map(toXYZ)
        : points.map(toXYZ)
    this.#path = path

    // A closed line joins up by itself, so drop a repeated start
    const first = list[0]
    const last = list[list.length - 1]
    if (
      this.closed &&
      list.length > 2 &&
      first[0] === last[0] &&
      first[1] === last[1] &&
      first[2] === last[2]
    ) {
      list.pop()
    }
    if (list.length < 2)
      throw new Error('Polyline: at least 2 points are needed')

    if (this.#points.length !== list.length * 3) {
      this.#points = new Float32Array(list.length * 3)
    }
    list.forEach((p, i) => this.#points.set(p, i * 3))
    this.#build()
  }

  /**
   * Add a point to the end of the line and drop the first, keeping the count
   * the same: a trail that follows its newest point.
   * @param {PathPoint} point - The new end point
   */
  push(point: PathPoint): void {
    const p = toXYZ(point)
    const points = this.#points
    points.copyWithin(0, 3)
    points.set(p, points.length - 3)
    // The points no longer follow the path, nor its tilt
    this.#path = null
    this.#build()
  }

  /** Whether the line joins its last point to its first. */
  get closed(): boolean {
    return this.#closed ?? this.#path?.closed ?? false
  }
  set closed(value: boolean) {
    this.#closed = value
    this.#build()
  }

  /** The number of points, not counting the join of a closed line. */
  get count(): number {
    return this.#points.length / 3
  }

  /**
   * The width: CSS pixels, or world units with `sizeAttenuation` or for a
   * ribbon. It's a uniform, so changing it is free.
   */
  get width(): number {
    return this.uniforms.u_width.value as number
  }
  set width(value: number) {
    this.uniforms.u_width.value = value
    this.#pad()
  }

  /** Multiplies the width along the line, for tapers. */
  get taper(): PolylineTaper | null {
    return this.#taper
  }
  set taper(value: PolylineTaper | null) {
    this.#taper = value
    this.#build()
  }

  /** Ribbons only: the direction the face starts out facing. */
  get facing(): XYZ | undefined {
    return this.#facing
  }
  set facing(value: PathPoint | undefined) {
    this.#facing = value === undefined ? undefined : toXYZ(value)
    this.#build()
  }

  /** Ribbons only: the roll about the line, in radians. */
  get tilt(): PolylineTilt | undefined {
    return this.#tilt
  }
  set tilt(value: PolylineTilt | undefined) {
    this.#tilt = value
    this.#build()
  }

  /** Ribbons only: how far the ribbon rolls into turns. 0 is level. */
  get bank(): number {
    return this.#bank
  }
  set bank(value: number) {
    this.#bank = value
    this.#build()
  }

  /** How far a sharp corner can reach, in half widths. */
  get miterLimit(): number {
    return this.#miterLimit
  }
  set miterLimit(value: number) {
    this.#miterLimit = value
    this.uniforms.u_miterLimit.value = value
    if (this.billboard) this.#pad()
    else this.#build()
  }

  /** Billboards only: whether `width` is in world units rather than pixels. */
  get sizeAttenuation(): boolean {
    return this.uniforms.u_sizeAttenuation.value === 1
  }
  set sizeAttenuation(value: boolean) {
    this.uniforms.u_sizeAttenuation.value = value ? 1 : 0
    this.#pad()
  }

  get colour(): [number, number, number] {
    return this.uniforms.u_colour.value as [number, number, number]
  }
  set colour(value: [number, number, number]) {
    const colour = this.uniforms.u_colour.value as number[]
    colour[0] = value[0]
    colour[1] = value[1]
    colour[2] = value[2]
  }

  get opacity(): number {
    return this.uniforms.u_opacity.value as number
  }
  set opacity(value: number) {
    this.uniforms.u_opacity.value = value
  }

  /** The length of a dash and its gap, in world units. 0 is solid. */
  get dashArray(): number {
    return this.uniforms.u_dashArray.value as number
  }
  set dashArray(value: number) {
    this.uniforms.u_dashArray.value = value
  }

  /** The fraction of each dash length that's a gap. */
  get dashRatio(): number {
    return this.uniforms.u_dashRatio.value as number
  }
  set dashRatio(value: number) {
    this.uniforms.u_dashRatio.value = value
  }

  /** Moves the dashes along the line, in world units. */
  get dashOffset(): number {
    return this.uniforms.u_dashOffset.value as number
  }
  set dashOffset(value: number) {
    this.uniforms.u_dashOffset.value = value
  }

  /** How much of the line is drawn, from its start: 0 to 1. */
  get visibility(): number {
    return this.uniforms.u_visibility.value as number
  }
  set visibility(value: number) {
    this.uniforms.u_visibility.value = value
  }

  /** A texture drawn along the line: u runs along it and v across it. */
  get map(): Texture | null {
    return this.uniforms.u_useMap.value
      ? (this.uniforms.u_map.value as Texture)
      : null
  }
  set map(value: Texture | null) {
    this.uniforms.u_map.value = value ?? blank(this.gl)
    this.uniforms.u_useMap.value = value ? 1 : 0
  }

  /** How many times the map repeats along and across the line. */
  get repeat(): [number, number] {
    return this.uniforms.u_repeat.value as [number, number]
  }
  set repeat(value: number | [number, number]) {
    const repeat = this.uniforms.u_repeat.value as number[]
    repeat[0] = typeof value === 'number' ? value : value[0]
    repeat[1] = typeof value === 'number' ? 1 : value[1]
  }

  // Fill the attributes from the points
  #build(): void {
    const points = this.#points
    const n = points.length / 3
    if (n < 2) return
    const closed = this.closed
    // A closed line repeats its first point at the end
    const m = closed ? n + 1 : n
    const at = (i: number): Vec => {
      const k = (i % n) * 3
      return [points[k], points[k + 1], points[k + 2]]
    }

    const num = m * 2
    const position = this.#array('position', 3, num)
    const prev = this.#array('prev', 3, num)
    const next = this.#array('next', 3, num)
    const side = this.#array('side', 1, num)
    const width = this.#array('width', 1, num)
    const lineDistance = this.#array('lineDistance', 1, num)
    const lineU = this.#array('lineU', 1, num)

    // Distance along the line, and segment directions and lengths
    const distances = new Float64Array(m)
    const dirs: Vec[] = []
    const lengths: number[] = []
    for (let i = 1; i < m; i++) {
      const d = sub(at(i), at(i - 1))
      const l = len(d)
      lengths.push(l)
      dirs.push(l > 1e-12 ? [d[0] / l, d[1] / l, d[2] / l] : [0, 0, 0])
      distances[i] = distances[i - 1] + l
    }
    const total = distances[m - 1]
    const uAt = (i: number) => (total > 0 ? distances[i] / total : i / (m - 1))

    const widthAt = this.#taper ?? (() => 1)
    this.#maxWidth = 0

    for (let i = 0; i < m; i++) {
      const p = at(i)
      // The ends of an open line repeat their own point
      const before = i > 0 ? at(i - 1) : closed ? at(n - 1) : p
      const after = i < m - 1 ? at(i + 1) : closed ? at(1) : p
      const u = uAt(i)
      // A closed line's last point is its first again
      const w = widthAt(u, i % n)
      this.#maxWidth = Math.max(this.#maxWidth, Math.abs(w))

      for (let s = 0; s < 2; s++) {
        const v = i * 2 + s
        position.set(p, v * 3)
        prev.set(before, v * 3)
        next.set(after, v * 3)
        side[v] = s === 0 ? 1 : -1
        width[v] = w
        lineDistance[v] = distances[i]
        lineU[v] = u
      }
    }

    // Two triangles per segment, facing the ribbon's normal
    const numIndices = (m - 1) * 6
    const IndexArray = num > 65536 ? Uint32Array : Uint16Array
    const existing = this.geometry.attributes.index
    let index = existing?.data as Uint16Array | Uint32Array | undefined
    if (
      !index ||
      index.length !== numIndices ||
      !(index instanceof IndexArray)
    ) {
      index = new IndexArray(numIndices)
      if (existing?.buffer) this.gl.deleteBuffer(existing.buffer)
      this.#fillIndex(index, m)
      this.geometry.setIndex(index)
    }

    if (!this.billboard) this.#ribbon(m, closed, at, dirs, lengths, uAt)

    for (const key in this.geometry.attributes) {
      if (OWN.has(key)) this.geometry.attributes[key].needsUpdate = true
    }

    this.geometry.computeBoundingBox()
    this.geometry.computeBoundingSphere()
    this.#baseRadius = this.geometry.bounds?.radius ?? 0
    this.#pad()
  }

  #fillIndex(index: Uint16Array | Uint32Array, m: number): void {
    for (let i = 0; i < m - 1; i++) {
      const a = i * 2
      const b = a + 1
      const c = a + 2
      const d = a + 3
      index.set([a, c, b, c, d, b], i * 6)
    }
  }

  // The ribbon's width direction (mitred) and face normal at each point
  #ribbon(
    m: number,
    closed: boolean,
    at: (i: number) => Vec,
    dirs: Vec[],
    lengths: number[],
    uAt: (i: number) => number
  ): void {
    const across = this.#array('across', 3, m * 2)
    const normal = this.#array('normal', 3, m * 2)

    // Repeated points have no direction: borrow the nearest one
    const fallback = dirs.find((d) => d[0] || d[1] || d[2]) ?? [1, 0, 0]
    for (let i = 0; i < dirs.length; i++) {
      if (!dirs[i][0] && !dirs[i][1] && !dirs[i][2]) {
        dirs[i] = i > 0 ? dirs[i - 1] : fallback
      }
    }

    // The directions into and out of each point
    const segments = m - 1
    const into = (i: number): Vec | undefined =>
      i > 0 ? dirs[i - 1] : closed ? dirs[segments - 1] : undefined
    const out = (i: number): Vec | undefined =>
      i < segments ? dirs[i] : closed ? dirs[0] : undefined

    const tangents: Vec[] = []
    for (let i = 0; i < m; i++) {
      const a = into(i)
      const b = out(i)
      const t =
        a && b ? normalise([a[0] + b[0], a[1] + b[1], a[2] + b[2]]) : null
      // A hairpin has no average direction: keep going the way it came
      tangents.push(t && (t[0] || t[1] || t[2]) ? t : (a ?? b ?? fallback))
    }

    const seed =
      this.#facing ??
      planeNormal(Array.from({ length: m - (closed ? 1 : 0) }, (_, i) => at(i)))

    const tiltAt = (i: number): number => {
      const u = uAt(i)
      const tilt = this.#tilt
      if (typeof tilt === 'function') return tilt(u)
      if (typeof tilt === 'number') return tilt
      const path = this.#path
      if (!path) return 0
      const t = path.getTiltAt(u)
      return path.tiltFunction ? path.tiltFunction(t, u, path) : t
    }
    const tilts = Array.from({ length: m }, (_, i) => tiltAt(i))

    const options = {
      closed,
      normal: seed ? toVec3(seed) : undefined
    }

    if (this.#bank) {
      // Roll into turns by the curvature across the level ribbon: the turn
      // between the directions in and out, over the average segment length
      const level = rotationMinimisingFrames(tangents.map(toVec3), options)
      for (let i = 0; i < m; i++) {
        const a = into(i)
        const b = out(i)
        if (!a || !b) continue
        const la = i > 0 ? lengths[i - 1] : lengths[segments - 1]
        const lb = i < segments ? lengths[i] : lengths[0]
        const span = (la + lb) / 2
        if (span < 1e-12) continue
        const k = sub(b, a)
        const bn = level.binormals[i]
        const lateral = (k[0] * bn.x + k[1] * bn.y + k[2] * bn.z) / span
        tilts[i] += Math.atan(this.#bank * lateral)
      }
    }

    const { normals, binormals } = rotationMinimisingFrames(
      tangents.map(toVec3),
      { ...options, tilts }
    )

    const limit = 1 / Math.max(this.#miterLimit, 1)
    for (let i = 0; i < m; i++) {
      const n = normals[i]
      const b = binormals[i]
      const t = tangents[i]

      // Lengthen the width at corners, by the turn within the ribbon's plane
      let scale = 1
      const a = into(i)
      if (a && out(i)) {
        const along = a[0] * n.x + a[1] * n.y + a[2] * n.z
        const flat = normalise([
          a[0] - n.x * along,
          a[1] - n.y * along,
          a[2] - n.z * along
        ])
        const cos = dot(t, flat)
        if (flat[0] || flat[1] || flat[2]) scale = 1 / Math.max(cos, limit)
      }

      for (let s = 0; s < 2; s++) {
        const v = (i * 2 + s) * 3
        across[v] = b.x * scale
        across[v + 1] = b.y * scale
        across[v + 2] = b.z * scale
        normal[v] = n.x
        normal[v + 1] = n.y
        normal[v + 2] = n.z
      }
    }
  }

  // The attribute's data, made new when the vertex count has changed
  #array(name: string, size: number, count: number): Float32Array {
    const existing = this.geometry.attributes[name] as
      WTCGLGeometryAttribute | undefined
    if (existing && existing.data.length === count * size) {
      return existing.data as Float32Array
    }
    if (existing?.buffer) this.gl.deleteBuffer(existing.buffer)
    const data = new Float32Array(count * size)
    this.geometry.addAttribute(name, new GeometryAttribute({ size, data }))
    return data
  }

  // Grow the culling bounds by the width, when it's in world units
  #pad(): void {
    const bounds = this.geometry.bounds
    if (!bounds) return
    const world = !this.billboard || this.sizeAttenuation
    const width = this.#maxWidth * (this.uniforms.u_width.value as number)
    bounds.radius = world
      ? this.#baseRadius + Math.abs(width) * 0.5 * Math.max(this.#miterLimit, 1)
      : this.#baseRadius
  }
}
