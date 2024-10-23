import { Mat3, Mat4 } from 'wtc-math'

import type { WTCGLRenderingContext } from '../types'
import { Geometry } from '../geometry/Geometry'

import { Drawable } from './Drawable'
import { Program } from './Program'
import { Camera } from './Camera'
import { Uniform } from './Uniform'

type BaseMeshOptions = { mesh: Mesh; camera: Camera }

type MeshCallback = (props: BaseMeshOptions) => void

export interface MeshOptions {
  geometry: Geometry
  program: Program
  mode?: GLenum
  frustumCulled?: boolean
  renderOrder?: number
}

/**
 * Class representing a mesh. A mesh is a binding point between geometry and a program.
 * @extends Drawable
 **/
export class Mesh extends Drawable {
  /**
   * The geometry to render.
   */
  geometry: Geometry

  /**
   * The mode to use to draw this mesh. Can be one of:
   * - gl.POINTS: Draws a single dot for each vertex
   * - gl.LINE_STRIP: Draws a straight line between the vertices
   * - gl.LINE_LOOP: As above, but loops back.
   * - gl.LINES: Draws many lines between each vertex pair
   * - gl.TRIANGLE_STRIP: Draws a series of triangles between each vertice trio
   * - gl.TRIANGLE_FAN: Draws a series of triangles between each vertice trio, treating the first vertex as the origin of each triangle
   * - gl.TRIANGLES: Draws a triangle for a group of three vertices
   */
  mode: GLenum

  /**
   * The world matrix projected by the camera's view matrix
   */
  modelViewMatrix: Mat4
  /**
   * The model-view normal matrix
   */
  normalMatrix: Mat3
  /**
   * Any callbacks to run before render
   */
  beforeRenderCallbacks: { (props: BaseMeshOptions): void }[]
  /**
   * Any callbacks to run after render
   */
  afterRenderCallbacks: { (props: BaseMeshOptions): void }[]

  /**
   * Create a mesh
   * @param {WTCGLRenderingContext} gl - The WTCGL Rendering context
   * @param {Object} __namedParameters - The parameters for the attribute
   * @param {Geometry} geometry - The geometry for the mesh to render
   * @param {Program} program - The program - shaders and uniforms - used to render the geometry
   * @param {GLenum} mode - The mode to render using
   * @param {boolean} frustumCulled - Whether to apply culling to this object
   * @param {number} renderOrder - The explicit render order of the object. If this is zero, then it will be instead calculated at render time.
   */
  constructor(
    gl: WTCGLRenderingContext,
    {
      geometry,
      program,
      mode = gl.TRIANGLES,
      frustumCulled = true,
      renderOrder = 0
    }: MeshOptions
  ) {
    super(gl, { frustumCulled, renderOrder })

    if (!gl.canvas) console.error('gl not passed as first argument to Mesh')

    this.geometry = geometry
    this.program = program
    this.mode = mode

    // Override sorting to force an order
    this.modelViewMatrix = new Mat4()
    this.normalMatrix = new Mat3()
    this.beforeRenderCallbacks = []
    this.afterRenderCallbacks = []
  }

  /**
   * Add a before render callback.
   * @param {function} f - The function to call before render. Expected shape ({ mesh: this, camera })=>void.
   **/
  addBeforeRender(f: MeshCallback) {
    this.beforeRenderCallbacks.push(f)
    return this
  }

  /**
   * Remove a before render callback.
   * @param {function} f - The function to call before render. Expected shape ({ mesh: this, camera })=>void.
   **/
  removeBeforeRender(f: MeshCallback) {
    this.beforeRenderCallbacks.forEach((_f, i) => {
      if (_f == f) this.beforeRenderCallbacks.splice(i, 1)
    })
  }

  /**
   * Remove all before render callbacks
   */
  removeAllBeforeRender() {
    this.beforeRenderCallbacks = []
  }

  /**
   * Add an after render callback.
   * @param {function} f - The function to call before render. Expected shape ({ mesh: this, camera })=>void.
   **/
  addAfterRender(f: MeshCallback) {
    this.afterRenderCallbacks.push(f)
    return this
  }

  /**
   * Remove an after render callback.
   * @param {function} f - The function to call before render. Expected shape ({ mesh: this, camera })=>void.
   **/
  removeAfterRender(f: MeshCallback) {
    this.afterRenderCallbacks.forEach((_f, i) => {
      if (_f == f) this.afterRenderCallbacks.splice(i, 1)
    })
  }

  /**
   * Remove all after render callbacks
   */
  removeAllAfterRender() {
    this.afterRenderCallbacks = []
  }

  /**
   * Drw the mesh. If a camera is supplied to the draw call, its various matrices will be added to the program uniforms
   * @param {Camera} camera - The camera to use to supply transformation matrices
   */
  draw({ camera }: { camera: Camera }): void {
    this.beforeRenderCallbacks.forEach((f) => f && f({ mesh: this, camera }))

    if (camera) {
      // Add empty matrix uniforms to program if unset
      if (!this.program.uniforms.modelMatrix) {
        Object.assign(this.program.uniforms, {
          u_modelMatrix: new Uniform({
            name: 'modelMatrix',
            value: undefined,
            kind: 'mat4'
          }),
          u_viewMatrix: new Uniform({
            name: 'viewMatrix',
            value: undefined,
            kind: 'mat4'
          }),
          u_modelViewMatrix: new Uniform({
            name: 'modelViewMatrix',
            value: undefined,
            kind: 'mat4'
          }),
          u_normalMatrix: new Uniform({
            name: 'normalMatrix',
            value: undefined,
            kind: 'mat3'
          }),
          u_projectionMatrix: new Uniform({
            name: 'projectionMatrix',
            value: undefined,
            kind: 'mat4'
          }),
          u_cameraPosition: new Uniform({
            name: 'cameraPosition',
            value: undefined,
            kind: 'float_vec3'
          }),
          u_objectPosition: new Uniform({
            name: 'objectPosition',
            value: undefined,
            kind: 'float_vec3'
          })
        })
      }

      // Set the matrix uniforms
      this.program.uniforms.u_projectionMatrix.value =
        camera.projectionMatrix.array
      this.program.uniforms.u_cameraPosition.value = camera.worldPosition.array
      this.program.uniforms.u_objectPosition.value = this.position.array
      this.program.uniforms.u_viewMatrix.value = camera.viewMatrix.array
      this.modelViewMatrix = camera.viewMatrix.multiplyNew(this.worldMatrix)
      this.normalMatrix = Mat3.fromMat4(this.modelViewMatrix)
      this.program.uniforms.u_modelMatrix.value = this.worldMatrix.array
      this.program.uniforms.u_modelViewMatrix.value = this.modelViewMatrix.array
      this.program.uniforms.u_normalMatrix.value = this.normalMatrix.array
    } else {
      // Add empty matrix uniforms to program if unset
      if (!this.program.uniforms.modelMatrix) {
        Object.assign(this.program.uniforms, {
          u_objectPosition: new Uniform({
            name: 'objectPosition',
            value: undefined,
            kind: 'float_vec3'
          })
        })
      }

      this.program.uniforms.u_objectPosition.value = this.position.array
    }

    // determine if faces need to be flipped - when mesh scaled negatively
    const flipFaces = !!(
      this.program.cullFace && this.worldMatrix.determinant < 0
    )

    this.program.use({ flipFaces })
    this.geometry.draw({ mode: this.mode, program: this.program })
    this.afterRenderCallbacks.forEach((f) => f && f({ mesh: this, camera }))
  }
}
