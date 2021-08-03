import { Obj } from './Object'
import { Vec3, Mat4 } from 'wtc-math'
import { Mesh } from './Mesh'
import { Drawable } from './Drawable'

/**
 * Class representing some Geometry.
 * @extends Obj
 **/
class Camera extends Obj {
  /**
   * The near point of the perspective matrix
   * @default .1
   */
  near: number
  /**
   * The far point of the perspective matrix
   * @default 100
   */
  far: number
  /**
   * The field of view of the perspective matrix, in degrees
   * @default 45
   */
  fov: number
  /**
   * The aspect ratio of the perspective matric - normally defined as width / height
   * @default 1
   */
  aspect: number
  /**
   * The left plane of the orthagraphic view
   */
  left: number
  /**
   * The right plane of the orthagraphic view
   */
  right: number
  /**
   * The top plane of the orthagraphic view
   */
  top: number
  /**
   * The bottom plane of the orthagraphic view
   */
  bottom: number
  /**
   * The zoom level of the orthagraphic view
   * @default 1
   */
  zoom: number

  /**
   * The camera projection matrix gives a vector space projection to a subspace.
   */
  projectionMatrix: Mat4
  /**
   * The camera view matrix transforms vertices from world-space to view-space.
   */
  viewMatrix: Mat4
  /**
   * The combined projection and view matrix.
   */
  projectionViewMatrix: Mat4
  /**
   * The position in world space
   */
  worldPosition: Vec3

  /**
   * The camera type - perspective or orthographic. If left / right are provided this will default to orthographic, otherwise it will default to perspective
   */
  type: 'orthographic' | 'perspective'

  frustum: { [key: string]: { pos: Vec3; constant: number } }

  /**
   * Create a camera object
   * @param {Object} __namedParameters - The parameters to be used for the camera
   * @param {number} near - The near point of the perspective matrix
   * @param {number} far - The far point of the perspective matrix
   * @param {number} fov - The fov of the camera, in degrees
   * @param {number} aspect - The camera aspect ratio
   * @param {number} left - The left point of the orthographic camera
   * @param {number} right - The right point of the orthographic camera
   * @param {number} top - The top point of the orthographic camera
   * @param {number} bottom - The bottom point of the orthographic camera
   * @param {number} zoom - The zoom level of the orthographic camera
   */
  constructor({
    near = 0.1,
    far = 100,
    fov = 45,
    aspect = 1,
    left,
    right,
    top,
    bottom,
    zoom = 1
  }: {
    near?: number
    far?: number
    fov?: number
    aspect?: number
    left?: number
    right?: number
    top?: number
    bottom?: number
    zoom?: number
  } = {}) {
    super()

    this.near = near
    this.far = far
    this.fov = fov
    this.aspect = aspect
    this.left = left
    this.right = right
    this.top = top
    this.bottom = bottom

    this.projectionMatrix = new Mat4()
    this.viewMatrix = new Mat4()
    this.projectionViewMatrix = new Mat4()
    this.worldPosition = new Vec3()

    // Use orthographic if left/right set, else default to perspective camera
    this.type = left || right ? 'orthographic' : 'perspective'

    if (this.type === 'orthographic') this.orthographic()
    else this.perspective()
  }

  /**
   * Calculate the parameters necessary for a perspective camera
   * @param {Object} __namedParameters - The parameters to be used for the camera
   * @param {number} near - The near point of the perspective matrix
   * @param {number} far - The far point of the perspective matrix
   * @param {number} fov - The fov of the camera, in degrees
   * @param {number} aspect - The camera aspect ratio
   */
  perspective({
    near = this.near,
    far = this.far,
    fov = this.fov,
    aspect = this.aspect
  }: {
    near?: number
    far?: number
    fov?: number
    aspect?: number
  } = {}): Camera {
    Object.assign(this, { near, far, fov, aspect })
    this.projectionMatrix = Mat4.perspective(fov, aspect, near, far)
    this.type = 'perspective'
    return this
  }

  /**
   * Calculate the parameters necessary for an orthographic camera
   * @param {Object} __namedParameters - The parameters to be used for the camera
   * @param {number} near - The near point of the perspective matrix
   * @param {number} far - The far point of the perspective matrix
   * @param {number} left - The left point of the orthographic camera
   * @param {number} right - The right point of the orthographic camera
   * @param {number} top - The top point of the orthographic camera
   * @param {number} bottom - The bottom point of the orthographic camera
   * @param {number} zoom - The zoom level of the orthographic camera
   */
  orthographic({
    near = this.near,
    far = this.far,
    left = this.left,
    right = this.right,
    bottom = this.bottom,
    top = this.top,
    zoom = this.zoom
  }: {
    near?: number
    far?: number
    left?: number
    right?: number
    bottom?: number
    top?: number
    zoom?: number
  } = {}): Camera {
    Object.assign(this, { near, far, left, right, bottom, top, zoom })
    left /= zoom
    right /= zoom
    bottom /= zoom
    top /= zoom
    this.projectionMatrix = Mat4.ortho(left, right, bottom, top, near, far)
    this.type = 'orthographic'
    return this
  }

  /**
   * Update the world view matrices
   * @chainable
   * @returns The camera operated on to make function chainable
   */
  updateMatrixWorld(): Camera {
    super.updateMatrixWorld()
    this.viewMatrix = this.worldMatrix.invertNew()
    this.worldPosition = this.worldMatrix.translation

    // used for sorting
    this.projectionViewMatrix = this.projectionMatrix.multiplyNew(
      this.viewMatrix
    )
    return this
  }

  /**
   * Look at a position
   * @param {Vec3} target - The position to look at
   * @chainable
   * @returns The camera operated on to make function chainable
   */
  lookAt(target: Vec3): Camera {
    super.lookAt(target, true)
    return this
  }

  /**
   * Update the frustum parameters based on the prejection view matrix
   */
  updateFrustum(): void {
    if (!this.frustum) {
      this.frustum = {
        xNeg: { pos: new Vec3(), constant: 0 },
        xPos: { pos: new Vec3(), constant: 0 },
        yNeg: { pos: new Vec3(), constant: 0 },
        yPos: { pos: new Vec3(), constant: 0 },
        zNeg: { pos: new Vec3(), constant: 0 },
        zPos: { pos: new Vec3(), constant: 0 }
      }
    }

    /*
    a11 a12 a13 a14
    0   1   2   3
    a21 a22 a23 a24
    4   5   6   7
    a31 a32 a33 a34
    8   9   10  11
    a41 a42 a43 a44
    12  13  14  15
    */

    const m = this.projectionViewMatrix
    this.frustum.xNeg.pos = new Vec3(
      m.a14 - m.a11,
      m.a24 - m.a21,
      m.a34 - m.a31
    )
    this.frustum.xNeg.constant = m.a44 - m.a41

    this.frustum.xPos.pos = new Vec3(
      m.a14 + m.a11,
      m.a24 + m.a21,
      m.a34 + m.a31
    )
    this.frustum.xPos.constant = m.a44 + m.a41

    this.frustum.yPos.pos = new Vec3(
      m.a14 + m.a12,
      m.a24 + m.a22,
      m.a34 + m.a32
    )
    this.frustum.yPos.constant = m.a44 + m.a42

    this.frustum.yNeg.pos = new Vec3(
      m.a14 - m.a12,
      m.a24 - m.a22,
      m.a34 - m.a32
    )
    this.frustum.yNeg.constant = m.a44 - m.a42

    this.frustum.zPos.pos = new Vec3(
      m.a14 - m.a13,
      m.a24 - m.a23,
      m.a34 - m.a33
    )
    this.frustum.zPos.constant = m.a44 - m.a43

    this.frustum.zNeg.pos = new Vec3(
      m.a14 + m.a13,
      m.a24 + m.a23,
      m.a34 + m.a33
    )
    this.frustum.zNeg.constant = m.a44 + m.a43

    for (let i in this.frustum) {
      const invLen = 1.0 / this.frustum[i].pos.length
      this.frustum[i].pos.scale(invLen)
      this.frustum[i].constant *= invLen
    }
  }

  /**
   * Determines whether the camera frustum intersects the supplied drawable object. Used mainly for frustum culling.
   * @param {Drawable} node - The node to test intersection against
   * @returns Boolean indicating intersection
   */
  frustumIntersects(node: Drawable): boolean {
    if (node instanceof Mesh) {
      // If no position attribute, treat as frustumCulled false
      if (!node.geometry.attributes.position) return true

      if (!node.geometry.bounds || node.geometry.bounds.radius === Infinity)
        node.geometry.computeBoundingSphere()

      if (!node.geometry.bounds) return true

      const center = node.geometry.bounds.center.clone()
      center.transformByMat4(node.worldMatrix)

      const radius =
        node.geometry.bounds.radius * this.maxAxisScale(node.worldMatrix)

      return this.frustumIntersectsSphere(center, radius)
    }
    return false
  }

  /**
   * Determines the largist axis scale of a matrix
   * @param {Mat4} m - The matrix to find the max axis of
   * @returns The max axis scale
   */
  maxAxisScale(m: Mat4): number {
    const x = m.a11 * m.a11 + m.a12 * m.a12 + m.a13 * m.a13
    const y = m.a21 * m.a21 + m.a22 * m.a22 + m.a23 * m.a23
    const z = m.a31 * m.a31 + m.a32 * m.a32 + m.a33 * m.a33
    return Math.sqrt(Math.max(x, y, z))
  }

  /**
   * Determines whether the frustum intersects a sphere
   * @param {Vec3} center - The center of the sphere to test.
   * @param {number} radius - The radius of the sphere to test.
   * @returns Boolean indicating intersection
   */
  frustumIntersectsSphere(center: Vec3, radius: number): boolean {
    for (let i in this.frustum) {
      const plane = this.frustum[i]
      const dist = plane.pos.clone().dot(center) + plane.constant
      if (dist < -radius) return false
    }
    return true
  }
}

export { Camera }
