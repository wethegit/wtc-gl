import { Vec2, Vec3 } from 'wtc-math'

import type { WTCGLRenderingContext } from '../types'
import { Camera } from '../core/Camera'
import { InstancedMesh } from '../core/InstancedMesh'
import { Mesh } from '../core/Mesh'
import type { Obj } from '../core/Object'
import { Program } from '../core/Program'
import { RenderTarget } from '../core/RenderTarget'
import { Texture } from '../core/Texture'
import { Uniform } from '../core/Uniform'
import { writeMat4 } from '../core/matrix'
import type { Lights } from './Lights'

import shadowSource from './shadow-shading.glsl'

/**
 * The shadow lookup `LitProgram` uses, as GLSL for custom shaders: the
 * `Shadow` uniforms the fragment shader needs and
 *
 * `float shadowFactor(vec4 coord)`
 *
 * which is 0 in shadow and 1 in the light, for a point in shadow map space.
 * Add it after the precision statement and spread `shadow.uniforms` into the
 * program's uniforms. The vertex shader works out the coordinate, from the
 * world position pushed out along the world normal:
 *
 * ```glsl
 * uniform mat4 u_shadowMatrix;
 * uniform float u_shadowNormalBias;
 * out vec4 v_shadowCoord;
 * // in main()
 * v_shadowCoord = u_shadowMatrix * vec4(world + worldNormal * u_shadowNormalBias, 1.0);
 * ```
 *
 * Then pass `shadowFactor(v_shadowCoord)` as the last argument of
 * `litShade`.
 */
export const shadowShading: string = shadowSource

export interface ShadowOptions {
  /** The lights whose directional light casts the shadow. */
  lights: Lights
  /** The centre of the area that gets shadows. @default (0, 0, 0) */
  target: Vec3
  /**
   * The radius of the area around `target` that gets shadows, in world
   * units. Smaller is sharper. @default 5
   */
  size: number
  /** The width and height of the shadow map, in pixels. @default 1024 */
  mapSize: number
  /** Subtracted from the depth before comparing it, against acne. @default 0.001 */
  bias: number
  /**
   * How far receivers are pushed out along their normals before looking up
   * the shadow, in shadow map texels, against acne. Too much and shadows
   * come away from their casters. @default 1
   */
  normalBias: number
  /**
   * How far apart the filter's taps are, in texels: 0 is one hardware
   * filtered tap, with hard edges. @default 1
   */
  softness: number
}

export interface ShadowCasterOptions {
  /**
   * The program to draw this node's meshes into the shadow map with, for
   * shaders that move vertices. It only needs to write depth, with the same
   * `position` (and any other attributes) the mesh's own program reads.
   */
  program?: Program
}

const depthVertex = (instanced: boolean) => `#version 300 es
${instanced ? '#define INSTANCED\n' : ''}in vec3 position;
#ifdef INSTANCED
in mat4 instanceMatrix;
#endif
uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
void main() {
  vec4 p = vec4(position, 1.0);
#ifdef INSTANCED
  p = instanceMatrix * p;
#endif
  gl_Position = u_projectionMatrix * u_modelViewMatrix * p;
}
`
const depthFragment = `#version 300 es
precision highp float;
void main() {}
`

/**
 * A shadow map for the directional light in `Lights`. Casters are drawn into
 * a depth texture from an orthographic light camera, and `LitProgram`s given
 * the shadow look it up to darken the directional light. The hemisphere,
 * ambient and emissive light aren't shadowed.
 *
 * ```ts
 * const shadow = new Shadow(gl, { lights, size: 6 })
 * shadow.add(model) // every mesh under it casts
 * const ground = new Mesh(gl, {
 *   geometry: new Plane(gl),
 *   program: new LitProgram(gl, { lights, shadow })
 * })
 *
 * // each frame, before rendering the scene
 * shadow.render({ scene })
 * renderer.render({ scene, camera })
 * ```
 *
 * The light camera covers a sphere of radius `size` around `target`, and
 * follows `lights.direction` on every render. `fit(node)` sets both from a
 * model's bounds. Keep `size` as small as the scene allows: the map's texels
 * are spread across it.
 *
 * Casters are drawn with a depth program that only reads `position` (and
 * `instanceMatrix` for an `InstancedMesh`), from both sides so open meshes
 * such as planes cast too. A shader that moves vertices needs its own depth
 * program, passed to `add`. Only triangle meshes cast.
 *
 * Limits: one directional light with one map, so no cascades and no point or
 * spot lights. Alpha-masked surfaces cast solid shadows, unless they're given
 * their own depth program. An `InstancedMesh` that culls its instances
 * differently against the light and the view camera re-uploads them for each.
 */
export class Shadow {
  readonly gl: WTCGLRenderingContext
  /** The lights whose directional light casts the shadow. */
  readonly lights: Lights
  /** The orthographic light camera, placed on each render. */
  readonly camera: Camera
  /** Where the depth is drawn. It has no colour attachments. */
  readonly renderTarget: RenderTarget
  /** The shadow map: a depth texture that compares as it's sampled. */
  readonly depthTexture: Texture
  /** The shadow uniforms, shared by every program that receives the shadow. */
  readonly uniforms: {
    u_shadowMap: Uniform
    u_shadowMatrix: Uniform
    u_shadowBias: Uniform
    u_shadowNormalBias: Uniform
    u_shadowSoftness: Uniform
    u_shadowTexel: Uniform
  }

  /** The centre of the area that gets shadows. */
  target: Vec3
  /** The radius of the area around `target` that gets shadows. */
  size: number
  /** Subtracted from the depth before comparing it, against acne. */
  bias: number
  /** How far receivers are pushed out along their normals, in texels. */
  normalBias: number
  /** How far apart the filter's taps are, in texels. 0 is hard. */
  softness: number

  // The roots added with add(), and the depth program for each (or null)
  #roots: Obj[] = []
  #programs: (Program | null)[] = []
  #depthProgram: Program | null = null
  #instancedDepthProgram: Program | null = null
  // The size the projection was built for
  #projectedSize = NaN
  // Scratch, so rendering doesn't allocate
  #projectionView = new Float32Array(16)
  #matrix = new Float32Array(16)
  #viewportSize = new Vec2()
  #viewportPosition = new Vec2()
  #drawProps: { camera: Camera }

  constructor(
    gl: WTCGLRenderingContext,
    {
      lights,
      target = new Vec3(0, 0, 0),
      size = 5,
      mapSize = 1024,
      bias = 0.001,
      normalBias = 1,
      softness = 1
    }: Partial<ShadowOptions> & { lights: Lights }
  ) {
    this.gl = gl
    this.lights = lights
    this.target = target
    this.size = size
    this.bias = bias
    this.normalBias = normalBias
    this.softness = softness

    this.depthTexture = new Texture(gl, {
      width: mapSize,
      height: mapSize,
      format: gl.DEPTH_COMPONENT,
      internalFormat: gl.DEPTH_COMPONENT24,
      type: gl.UNSIGNED_INT,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      generateMipmaps: false,
      flipY: false,
      compareFunc: gl.LEQUAL
    })
    this.renderTarget = new RenderTarget(gl, {
      width: mapSize,
      height: mapSize,
      colour: 0,
      depthTexture: this.depthTexture
    })

    this.camera = new Camera({ left: -size, right: size })
    // Placed by update() from the light, rather than from position/rotation
    this.camera.matrixAutoUpdate = false
    this.#drawProps = { camera: this.camera }

    this.uniforms = {
      u_shadowMap: new Uniform({
        name: 'shadowMap',
        value: this.depthTexture,
        kind: 'texture'
      }),
      u_shadowMatrix: new Uniform({
        name: 'shadowMatrix',
        value: this.#matrix,
        kind: 'mat4'
      }),
      u_shadowBias: new Uniform({
        name: 'shadowBias',
        value: bias,
        kind: 'float'
      }),
      u_shadowNormalBias: new Uniform({
        name: 'shadowNormalBias',
        value: 0,
        kind: 'float'
      }),
      u_shadowSoftness: new Uniform({
        name: 'shadowSoftness',
        value: softness,
        kind: 'float'
      }),
      u_shadowTexel: new Uniform({
        name: 'shadowTexel',
        value: 1 / mapSize,
        kind: 'float'
      })
    }
    this.update()
  }

  /** The width and height of the shadow map, in pixels. */
  get mapSize(): number {
    return this.renderTarget.width
  }
  set mapSize(value: number) {
    this.renderTarget.resize(value, value)
  }

  /**
   * Cast shadows from `node` and every mesh under it. Hidden subtrees are
   * skipped when rendering, so the casters can change without calling this
   * again.
   */
  add(node: Obj, { program }: ShadowCasterOptions = {}): this {
    const i = this.#roots.indexOf(node)
    if (i === -1) {
      this.#roots.push(node)
      this.#programs.push(program ?? null)
    } else {
      this.#programs[i] = program ?? null
    }
    return this
  }

  /** Stop casting shadows from a node passed to `add`. */
  delete(node: Obj): boolean {
    const i = this.#roots.indexOf(node)
    if (i === -1) return false
    this.#roots.splice(i, 1)
    this.#programs.splice(i, 1)
    return true
  }

  /**
   * Set `target` and `size` to cover every mesh under `node`, from their
   * bounds and world matrices, which should be up to date. For a model that
   * stays put or spins in place.
   */
  fit(node: Obj): this {
    const spheres: [number, number, number, number][] = []
    node.traverse((child) => {
      if (!(child instanceof Mesh)) return null
      const geometry = child.geometry
      if (!geometry.attributes.position) return null
      if (!geometry.bounds || geometry.bounds.radius === Infinity) {
        if (geometry.attributes.position.external) return null
        geometry.computeBoundingSphere()
      }
      const bounds = geometry.bounds
      if (!bounds) return null
      const m = child.worldMatrix
      const { x, y, z } = bounds.center
      const scale = Math.sqrt(
        Math.max(
          m.a11 * m.a11 + m.a12 * m.a12 + m.a13 * m.a13,
          m.a21 * m.a21 + m.a22 * m.a22 + m.a23 * m.a23,
          m.a31 * m.a31 + m.a32 * m.a32 + m.a33 * m.a33
        )
      )
      spheres.push([
        m.a11 * x + m.a21 * y + m.a31 * z + m.a41,
        m.a12 * x + m.a22 * y + m.a32 * z + m.a42,
        m.a13 * x + m.a23 * y + m.a33 * z + m.a43,
        bounds.radius * scale
      ])
      return null
    })
    if (!spheres.length) return this

    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    for (const s of spheres) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], s[k] - s[3])
        max[k] = Math.max(max[k], s[k] + s[3])
      }
    }
    const centre = [0, 1, 2].map((k) => (min[k] + max[k]) / 2)
    let size = 0
    for (const s of spheres) {
      const d = Math.hypot(s[0] - centre[0], s[1] - centre[1], s[2] - centre[2])
      size = Math.max(size, d + s[3])
    }
    this.target.x = centre[0]
    this.target.y = centre[1]
    this.target.z = centre[2]
    this.size = size
    this.update()
    return this
  }

  /**
   * Place the light camera from the light direction, `target` and `size`,
   * and update the uniforms. `render` calls it.
   */
  update(): void {
    const camera = this.camera
    const size = this.size
    if (size !== this.#projectedSize) {
      camera.orthographic({
        left: -size,
        right: size,
        bottom: -size,
        top: size,
        near: 0,
        far: size * 4
      })
      this.#projectedSize = size
    }

    // Looking at the target from along the light direction, without
    // allocating a lookAt matrix
    const d = this.lights.uniforms.u_lightDirection.value as number[]
    const dx = d[0]
    const dy = d[1]
    const dz = d[2]
    // Up is +Y, unless the light is straight above or below
    const vertical = Math.abs(dy) > 0.999
    const ux = 0
    const uy = vertical ? 0 : 1
    const uz = vertical ? 1 : 0
    // x = up × z
    let xx = uy * dz - uz * dy
    let xy = uz * dx - ux * dz
    let xz = ux * dy - uy * dx
    const xl = Math.hypot(xx, xy, xz) || 1
    xx /= xl
    xy /= xl
    xz /= xl
    // y = z × x
    const yx = dy * xz - dz * xy
    const yy = dz * xx - dx * xz
    const yz = dx * xy - dy * xx

    const t = this.target
    const m = camera.matrix
    m.a11 = xx
    m.a12 = xy
    m.a13 = xz
    m.a14 = 0
    m.a21 = yx
    m.a22 = yy
    m.a23 = yz
    m.a24 = 0
    m.a31 = dx
    m.a32 = dy
    m.a33 = dz
    m.a34 = 0
    m.a41 = t.x + dx * size * 2
    m.a42 = t.y + dy * size * 2
    m.a43 = t.z + dz * size * 2
    m.a44 = 1
    camera.position.x = m.a41
    camera.position.y = m.a42
    camera.position.z = m.a43
    camera.worldMatrixNeedsUpdate = true
    camera.updateMatrixWorld()
    camera.updateFrustum()

    // Clip space to 0..1: scale and offset each row by half the w row
    const pv = writeMat4(camera.projectionViewMatrix, this.#projectionView)
    const out = this.#matrix
    for (let c = 0; c < 16; c += 4) {
      const w = pv[c + 3]
      out[c] = 0.5 * (pv[c] + w)
      out[c + 1] = 0.5 * (pv[c + 1] + w)
      out[c + 2] = 0.5 * (pv[c + 2] + w)
      out[c + 3] = w
    }

    const u = this.uniforms
    const texel = 1 / this.mapSize
    u.u_shadowBias.value = this.bias
    u.u_shadowSoftness.value = this.softness
    u.u_shadowTexel.value = texel
    // Texels to world units: the map is 2 × size across
    u.u_shadowNormalBias.value = this.normalBias * size * 2 * texel
  }

  /**
   * Draw the casters into the shadow map. Call it each frame before
   * rendering the receivers, or whenever the casters or the light move.
   * @param scene - Updated first, so the casters' world matrices are current.
   * @param update - Whether to update `scene`'s world matrices. @default true
   */
  render({ scene, update = true }: { scene?: Obj; update?: boolean } = {}) {
    const renderer = this.gl.renderer
    if (renderer.contextLost) return
    if (scene && update) scene.updateMatrixWorld()
    this.update()

    const gl = this.gl
    renderer.bindFramebuffer(this.renderTarget)
    this.#viewportSize.x = this.#viewportSize.y = this.mapSize
    renderer.setViewport(this.#viewportSize, this.#viewportPosition)
    renderer.enable(gl.DEPTH_TEST)
    renderer.depthMask = true
    gl.clear(gl.DEPTH_BUFFER_BIT)

    try {
      const roots = this.#roots
      for (let i = 0; i < roots.length; i++) {
        if (hiddenAbove(roots[i])) continue
        this.#draw(roots[i], this.#programs[i])
      }
    } finally {
      renderer.bindFramebuffer()
    }
  }

  /** Draw the casting meshes under `node` with their depth programs. */
  #draw(node: Obj, program: Program | null): void {
    if (!node.visible) return
    if (
      node instanceof Mesh &&
      this.#casts(node.mode) &&
      (!node.frustumCulled || this.camera.frustumIntersects(node))
    ) {
      const own = node.program
      node.program =
        program ??
        (node instanceof InstancedMesh
          ? (this.#instancedDepthProgram ??= this.#createDepthProgram(true))
          : (this.#depthProgram ??= this.#createDepthProgram(false)))
      try {
        node.draw(this.#drawProps)
      } finally {
        node.program = own
      }
    }
    const children = node.children
    for (let i = 0; i < children.length; i++) {
      this.#draw(children[i], program)
    }
  }

  #casts(mode: GLenum): boolean {
    const gl = this.gl
    return (
      mode === gl.TRIANGLES ||
      mode === gl.TRIANGLE_STRIP ||
      mode === gl.TRIANGLE_FAN
    )
  }

  #createDepthProgram(instanced: boolean): Program {
    return new Program(this.gl, {
      vertex: depthVertex(instanced),
      fragment: depthFragment,
      // Both sides, so open meshes cast too
      cullFace: 0
    })
  }

  /** Delete the shadow map, its target and the depth programs. */
  remove(): void {
    this.renderTarget.remove()
    this.depthTexture.remove()
    this.#depthProgram?.remove()
    this.#instancedDepthProgram?.remove()
    this.#depthProgram = this.#instancedDepthProgram = null
  }
}

/** Whether an ancestor of `node` is hidden. */
function hiddenAbove(node: Obj): boolean {
  for (let n = node.parent; n; n = n.parent) {
    if (!n.visible) return true
  }
  return false
}
