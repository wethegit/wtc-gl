import { WTCGLRenderingContext } from './types'
import { Mat3, Mat4 } from 'wtc-math'
import { Drawable } from './Drawable'
import { Geometry } from './Geometry'
import { Program } from './Program'

class Mesh extends Drawable {
  geometry: Geometry

  mode: GLenum

  modelViewMatrix: Mat4
  normalMatrix: Mat3
  beforeRenderCallbacks: { ({ mesh: Mesh, camera: number }): void }[]
  afterRenderCallbacks: { ({ mesh: Mesh, camera: number }): void }[]

  constructor(
    gl: WTCGLRenderingContext,
    {
      geometry,
      program,
      mode = gl.TRIANGLES,
      frustumCulled = true,
      renderOrder = 0
    }: {
      geometry?: Geometry
      program?: Program
      mode?: GLenum
      frustumCulled?: boolean
      renderOrder?: number
    } = {}
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

  onBeforeRender(f) {
    this.beforeRenderCallbacks.push(f)
    return this
  }

  onAfterRender(f) {
    this.afterRenderCallbacks.push(f)
    return this
  }

  draw({ camera }: { camera?: any } = {}): void {
    this.beforeRenderCallbacks.forEach((f) => f && f({ mesh: this, camera }))
    if (camera) {
      // Add empty matrix uniforms to program if unset
      if (!this.program.uniforms.modelMatrix) {
        Object.assign(this.program.uniforms, {
          modelMatrix: { value: null },
          viewMatrix: { value: null },
          modelViewMatrix: { value: null },
          normalMatrix: { value: null },
          projectionMatrix: { value: null },
          cameraPosition: { value: null }
        })
      }

      // Set the matrix uniforms
      this.program.uniforms.projectionMatrix.value = camera.projectionMatrix
      this.program.uniforms.cameraPosition.value = camera.worldPosition
      this.program.uniforms.viewMatrix.value = camera.viewMatrix
      this.modelViewMatrix = camera.viewMatrix.multiplyNew(this.worldMatrix)
      this.normalMatrix = Mat3.fromMat4(this.modelViewMatrix)
      this.program.uniforms.modelMatrix.value = this.worldMatrix.array
      this.program.uniforms.modelViewMatrix.value = this.modelViewMatrix.array
      this.program.uniforms.normalMatrix.value = this.normalMatrix.array
    }

    // determine if faces need to be flipped - when mesh scaled negatively
    let flipFaces = this.program.cullFace && this.worldMatrix.determinant < 0
    this.program.use({ flipFaces })
    this.geometry.draw({ mode: this.mode, program: this.program })
    this.afterRenderCallbacks.forEach((f) => f && f({ mesh: this, camera }))
  }
}

export { Mesh }
