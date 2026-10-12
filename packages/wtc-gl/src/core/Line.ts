import type { Vec3 } from 'wtc-math'

import type { WTCGLRenderingContext, WTCGLUniformArray } from '../types'

import { Mesh } from './Mesh'
import { Program } from './Program'
import type { ProgramOptions } from './Program'
import { Texture } from './Texture'
import { Uniform } from './Uniform'
import { LineGeometry } from '../geometry/LineGeometry'
import type { LinePoints, LineWidthCallback } from '../geometry/LineGeometry'

import lineVertex from './line/line.vert'
import lineFragment from './line/line.frag'
import lineExtrude from './line/extrude.glsl'

/**
 * The GLSL for `Line`'s extrusion, for custom line shaders (eg lines whose
 * points come from a texture). Include it in a vertex shader and call:
 *
 * ```glsl
 * vec4 lineExtrude(mat4 projection, mat4 modelView, vec3 position,
 *   vec3 prev, vec3 next, float side, float width, vec2 resolution,
 *   float sizeAttenuation, float miterLimit)
 * ```
 *
 * It returns the clip-space position. `width` is in pixels, or world units
 * when `sizeAttenuation` is 1. It works in GLSL ES 1.0 and 3.0 shaders.
 */
export const lineExtrudeGLSL: string = lineExtrude

export interface LineOptions {
  points: LinePoints
  /**
   * Join the last point back to the first.
   */
  closed: boolean
  /**
   * Width along the line as a multiple of `lineWidth`, eg `t => 1 - t` for
   * a taper. `t` runs 0 → 1 from the first point to the last.
   */
  width: LineWidthCallback
  /**
   * Use this geometry instead of building one from `points`.
   */
  geometry: LineGeometry
  /**
   * Use this program instead of the default line shaders. It's given the
   * line's uniforms.
   */
  program: Program
  /**
   * The line's width: pixels, or world units with `sizeAttenuation`.
   */
  lineWidth: number
  /**
   * Measure `lineWidth` in world units, so the line gets thinner with
   * distance like any other geometry.
   */
  sizeAttenuation: boolean
  colour: [number, number, number]
  opacity: number
  /**
   * How far a sharp corner may stick out, as a multiple of the width.
   * Sharper corners are cut off.
   */
  miterLimit: number
  /**
   * The length of a dash plus its gap, in world units along the line.
   * 0 draws a solid line.
   */
  dashArray: number
  dashOffset: number
  /**
   * The fraction of each `dashArray` that's gap.
   */
  dashRatio: number
  /**
   * A texture drawn along the line: u runs along it, v across it.
   */
  map: Texture | null
  /**
   * How many times `map` repeats along and across the line.
   */
  repeat: [number, number]
  /**
   * Discard fragments with less alpha than this.
   */
  alphaTest: number
  /**
   * How much of the line is drawn, from 0 to 1 along it. Animate it to draw
   * the line on.
   */
  visibility: number
  /**
   * Extra uniforms for a custom program.
   */
  uniforms: WTCGLUniformArray
  /**
   * Options for the default program, eg `depthTest` or `transparent`.
   */
  programOptions: Partial<ProgramOptions>
  frustumCulled: boolean
  renderOrder: number
}

const IDENTITY = () =>
  new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

/**
 * A thick line, extruded in screen space in the vertex shader (the same
 * technique as OGL's Polyline and three.js's MeshLine). Lines join with
 * mitres, can taper, dash, carry a texture and draw themselves on.
 *
 * ```js
 * const line = new Line(gl, {
 *   points: [0, 0, 0, 1, 1, 0, 2, 0, 0],
 *   lineWidth: 8,
 *   width: (t) => 1 - t
 * })
 * line.setParent(scene)
 * ```
 *
 * Without a camera the points are in clip space (-1 to 1).
 *
 * Known limits, as with MeshLine: joins are mitred only (no round joins or
 * caps), and a transparent line that crosses itself doubles up unless depth
 * writes are off or `alphaTest` is used. Frustum culling uses the points'
 * bounds without the width, so a very thick line can be culled just before
 * it leaves the screen; turn `frustumCulled` off if that shows.
 */
export class Line extends Mesh {
  declare geometry: LineGeometry

  #resolution = new Float32Array(2)
  #map: Texture | null
  #blank?: Texture

  constructor(
    gl: WTCGLRenderingContext,
    {
      points = [],
      closed = false,
      width,
      geometry,
      program,
      lineWidth = 4,
      sizeAttenuation = false,
      colour = [1, 1, 1],
      opacity = 1,
      miterLimit = 4,
      dashArray = 0,
      dashOffset = 0,
      dashRatio = 0.5,
      map = null,
      repeat = [1, 1],
      alphaTest = 0,
      visibility = 1,
      uniforms = {},
      programOptions = {},
      frustumCulled = true,
      renderOrder = 0
    }: Partial<LineOptions> = {}
  ) {
    geometry ??= new LineGeometry(gl, { points, closed, width })

    const resolution = new Float32Array([
      gl.canvas.width || 1,
      gl.canvas.height || 1
    ])
    const lineUniforms: WTCGLUniformArray = {
      // Without a camera, Mesh doesn't set these, so points are clip space
      u_projectionMatrix: new Uniform({
        name: 'projectionMatrix',
        value: IDENTITY(),
        kind: 'mat4'
      }),
      u_modelViewMatrix: new Uniform({
        name: 'modelViewMatrix',
        value: IDENTITY(),
        kind: 'mat4'
      }),
      u_resolution: new Uniform({
        name: 'resolution',
        value: resolution,
        kind: 'float_vec2'
      }),
      u_lineWidth: new Uniform({
        name: 'lineWidth',
        value: lineWidth,
        kind: 'float'
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
      u_dashArray: new Uniform({
        name: 'dashArray',
        value: dashArray,
        kind: 'float'
      }),
      u_dashOffset: new Uniform({
        name: 'dashOffset',
        value: dashOffset,
        kind: 'float'
      }),
      u_dashRatio: new Uniform({
        name: 'dashRatio',
        value: dashRatio,
        kind: 'float'
      }),
      // set to the map, or a white pixel, below
      u_map: new Uniform({ name: 'map', value: undefined, kind: 'texture' }),
      u_useMap: new Uniform({
        name: 'useMap',
        value: map ? 1 : 0,
        kind: 'float'
      }),
      u_repeat: new Uniform({
        name: 'repeat',
        value: [...repeat],
        kind: 'float_vec2'
      }),
      u_alphaTest: new Uniform({
        name: 'alphaTest',
        value: alphaTest,
        kind: 'float'
      }),
      u_visibility: new Uniform({
        name: 'visibility',
        value: visibility,
        kind: 'float'
      }),
      u_premultiplied: new Uniform({
        name: 'premultiplied',
        value: gl.renderer.premultipliedAlpha ? 1 : 0,
        kind: 'float'
      }),
      ...uniforms
    }

    if (program) {
      // A custom program keeps any uniforms it already has
      program.uniforms = { ...lineUniforms, ...program.uniforms }
    } else {
      program = new Program(gl, {
        vertex: lineVertex,
        fragment: lineFragment,
        uniforms: lineUniforms,
        // The ribbon's winding flips with the line's direction
        cullFace: 0,
        transparent: opacity < 1 || !!map,
        ...programOptions
      })
    }

    super(gl, { geometry, program, frustumCulled, renderOrder })

    this.#resolution = resolution
    this.#map = map
    this.#setMapUniform()

    // The extrusion works in pixels, so it needs the size of whatever is
    // being drawn to: the canvas or a render target
    this.addBeforeRender(this.#updateResolution)
  }

  #updateResolution = () => {
    const viewport = this.gl.renderer.state.viewport
    this.#resolution[0] = viewport.width || this.gl.canvas.width || 1
    this.#resolution[1] = viewport.height || this.gl.canvas.height || 1
  }

  // Samplers always need a texture, so an unmapped line gets a white pixel
  #setMapUniform(): void {
    if (!this.#map && !this.#blank) {
      this.#blank = new Texture(this.gl, {
        data: new Uint8Array([255, 255, 255, 255]),
        width: 1,
        height: 1,
        generateMipmaps: false
      })
    }
    this.program.uniforms.u_map.value = this.#map ?? this.#blank!
    this.program.uniforms.u_useMap.value = this.#map ? 1 : 0
  }

  /**
   * Replace the line's points. With the same number of points the buffers
   * are reused, so this is cheap enough to call every frame.
   */
  setPoints(points: LinePoints): void {
    this.geometry.setPoints(points)
  }

  /**
   * Add a point to the head of the line and drop the oldest from the tail.
   * For trails.
   */
  push(point: Vec3 | number[]): void {
    this.geometry.push(point)
  }

  #uniform(name: string) {
    return this.program.uniforms[name]
  }

  get lineWidth(): number {
    return this.#uniform('u_lineWidth').value as number
  }
  set lineWidth(value: number) {
    this.#uniform('u_lineWidth').value = value
  }

  get sizeAttenuation(): boolean {
    return this.#uniform('u_sizeAttenuation').value === 1
  }
  set sizeAttenuation(value: boolean) {
    this.#uniform('u_sizeAttenuation').value = value ? 1 : 0
  }

  get colour(): [number, number, number] {
    return [...(this.#uniform('u_colour').value as number[])] as [
      number,
      number,
      number
    ]
  }
  set colour(value: [number, number, number]) {
    this.#uniform('u_colour').value = [...value]
  }

  get opacity(): number {
    return this.#uniform('u_opacity').value as number
  }
  set opacity(value: number) {
    this.#uniform('u_opacity').value = value
  }

  get miterLimit(): number {
    return this.#uniform('u_miterLimit').value as number
  }
  set miterLimit(value: number) {
    this.#uniform('u_miterLimit').value = value
  }

  get dashArray(): number {
    return this.#uniform('u_dashArray').value as number
  }
  set dashArray(value: number) {
    this.#uniform('u_dashArray').value = value
  }

  get dashOffset(): number {
    return this.#uniform('u_dashOffset').value as number
  }
  set dashOffset(value: number) {
    this.#uniform('u_dashOffset').value = value
  }

  get dashRatio(): number {
    return this.#uniform('u_dashRatio').value as number
  }
  set dashRatio(value: number) {
    this.#uniform('u_dashRatio').value = value
  }

  get map(): Texture | null {
    return this.#map
  }
  set map(value: Texture | null) {
    this.#map = value
    this.#setMapUniform()
  }

  get repeat(): [number, number] {
    return [...(this.#uniform('u_repeat').value as number[])] as [
      number,
      number
    ]
  }
  set repeat(value: [number, number]) {
    this.#uniform('u_repeat').value = [...value]
  }

  get alphaTest(): number {
    return this.#uniform('u_alphaTest').value as number
  }
  set alphaTest(value: number) {
    this.#uniform('u_alphaTest').value = value
  }

  get visibility(): number {
    return this.#uniform('u_visibility').value as number
  }
  set visibility(value: number) {
    this.#uniform('u_visibility').value = value
  }
}
