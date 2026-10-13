import { Mat3, Mat4 } from 'wtc-math'

import type { WTCGLRenderingContext } from '../types'
import { Geometry } from '../geometry/Geometry'

import { Drawable } from './Drawable'
import { Program } from './Program'
import { Camera } from './Camera'
import { Uniform } from './Uniform'
import {
  determinantMat4,
  multiplyMat4,
  normalMatrix,
  writeMat3,
  writeMat4
} from './matrix'

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
   * The program that renders the geometry.
   */
  declare program: Program

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

  // Uniform values, reused every frame rather than allocated
  #modelArray = new Float32Array(16)
  #viewArray = new Float32Array(16)
  #modelViewArray = new Float32Array(16)
  #normalArray = new Float32Array(9)
  #projectionArray = new Float32Array(16)
  #cameraPosition = new Float32Array(3)
  #objectPosition = new Float32Array(3)
  #useOptions = { flipFaces: false }
  #drawOptions: { mode: GLenum; program: Program } = {
    mode: 0,
    program: undefined as unknown as Program
  }

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
    this.beforeRenderCallbacks = this.beforeRenderCallbacks.filter(
      (_f) => _f !== f
    )
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
    this.afterRenderCallbacks = this.afterRenderCallbacks.filter(
      (_f) => _f !== f
    )
  }

  /**
   * Remove all afyer render callbacks
   */
  removeAllAfterRender() {
    this.afterRenderCallbacks = []
  }

  /**
   * Drw the mesh. If a camera is supplied to the draw call, its various matrices will be added to the program uniforms
   * @param {Camera} camera - The camera to use to supply transformation matrices
   */
  draw({ camera }: { camera: Camera }): void {
    const before = this.beforeRenderCallbacks
    if (before.length) {
      const props = { mesh: this, camera }
      for (let i = 0; i < before.length; i++) before[i]?.(props)
    }

    const uniforms = this.program.uniforms
    const world = this.worldMatrix
    const objectPosition = this.#objectPosition
    objectPosition[0] = world.a41
    objectPosition[1] = world.a42
    objectPosition[2] = world.a43

    if (camera) {
      // Add empty matrix uniforms to program if unset
      if (!uniforms.u_modelMatrix) {
        Object.assign(uniforms, {
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

      // Matrices are updated in place and written into this mesh's typed
      // arrays, so drawing doesn't allocate. The uniform cache compares
      // contents, so unchanged values still skip the upload.
      multiplyMat4(this.modelViewMatrix, camera.viewMatrix, world)
      // A non-invertible matrix (e.g. a mesh scaled to zero) isn't visible,
      // so keep the previous normal matrix
      normalMatrix(this.normalMatrix, this.modelViewMatrix)

      const cameraPosition = this.#cameraPosition
      cameraPosition[0] = camera.worldPosition.x
      cameraPosition[1] = camera.worldPosition.y
      cameraPosition[2] = camera.worldPosition.z

      uniforms.u_projectionMatrix.value = writeMat4(
        camera.projectionMatrix,
        this.#projectionArray
      )
      uniforms.u_cameraPosition.value = cameraPosition
      uniforms.u_objectPosition.value = objectPosition
      uniforms.u_viewMatrix.value = writeMat4(
        camera.viewMatrix,
        this.#viewArray
      )
      uniforms.u_modelMatrix.value = writeMat4(world, this.#modelArray)
      uniforms.u_modelViewMatrix.value = writeMat4(
        this.modelViewMatrix,
        this.#modelViewArray
      )
      uniforms.u_normalMatrix.value = writeMat3(
        this.normalMatrix,
        this.#normalArray
      )
    } else {
      // Add empty matrix uniforms to program if unset
      if (!uniforms.u_objectPosition) {
        Object.assign(uniforms, {
          u_objectPosition: new Uniform({
            name: 'objectPosition',
            value: undefined,
            kind: 'float_vec3'
          })
        })
      }

      uniforms.u_objectPosition.value = objectPosition
    }

    // determine if faces need to be flipped - when mesh scaled negatively
    const flipFaces = !!(
      this.program.cullFace && determinantMat4(this.worldMatrix) < 0
    )

    // Option objects are reused rather than created for every draw
    const useOptions = this.#useOptions
    useOptions.flipFaces = flipFaces
    this.program.use(useOptions)
    // A program that failed to link has already logged why; skip the draw
    // rather than raise a GL error every frame.
    if (this.program.linked) {
      const drawOptions = this.#drawOptions
      drawOptions.mode = this.mode
      drawOptions.program = this.program
      this.geometry.draw(drawOptions)
    }
    const after = this.afterRenderCallbacks
    if (after.length) {
      const props = { mesh: this, camera }
      for (let i = 0; i < after.length; i++) after[i]?.(props)
    }
  }
}
