import { Vec3, Quat, Mat4 } from 'wtc-math'

/**
 * Class representing an object. This provides basic transformations for sub-objects and shouldn't be instanciated directly.
 **/
class Obj {
  /**
   * The parent of this object.
   */
  parent: Obj | null
  /**
   * The children of this object
   */
  children: Obj[]
  /**
   * Whether this objec is visible or not. This will stop the renderer from trying to render this object
   */
  visible: Boolean

  /**
   * A matrix representing the translation, rotation and scale of this object.
   */
  matrix: Mat4
  /**
   * The world matrix represents the function of all ancestor matrices and the matrix of this object
   */
  worldMatrix: Mat4
  /**
   * Whether to automatically calculate the object matrix each time updateWorldMatrix is called. Convenient, but potentially costly.
   */
  matrixAutoUpdate: Boolean
  /**
   * A boolean indicating whether the world matrix requires updating.
   */
  worldMatrixNeedsUpdate: Boolean = false

  /**
   * Object position
   */
  position: Vec3
  /**
   * Object rotation, expressed as a quaternion
   */
  quaternion: Quat
  /**
   * Object scale
   */
  scale: Vec3
  /**
   * Object rotation, expressed as a 3D Euler rotation
   */
  rotation: Vec3
  /**
   * The up unit vector
   */
  up: Vec3

  /**
   * Create an object. Normally only called from an extending class.
   */
  constructor() {
    this.parent = null
    this.children = []
    this.visible = true

    this.matrix = new Mat4()
    this.worldMatrix = new Mat4()
    this.matrixAutoUpdate = true

    this.position = new Vec3()
    this.quaternion = new Quat()
    this.scale = new Vec3(1, 1, 1)
    this.rotation = new Vec3()
    this.up = new Vec3(0, 1, 0)
  }

  /**
   * UpdateRotation should be called whenever a change to the rotation variable is made. This will update the quaternion in response to the change in the rotation.
   * For example:
   * ```js
   * const Box = new Mesh(gl, { geometry: BoxGeo, program });
   * Box.rotation.x = Math.PI*.25;
   * Box.updateRotation();
   * console.log(Box.quaternion) // {_x: 0.3826834323650898, _y: 0, _z: 0, _w: 0.9238795325112867}
   * ```
   */
  updateRotation(): void {
    this.quaternion = Quat.fromEuler(this.rotation) || new Quat()
  }

  /**
   * UpdateRotation should be called whenever a change to the quaternion variable is made. This will update the rotation in response to the change in the quaternion.
   * For example:
   * ```js
   * const Box = new Mesh(gl, { geometry: BoxGeo, program });
   * Box.quaternion = Quat.fromAxisAngle(new Vec3(1,0,0), Math.PI*-.25);
   * Box.updateQuaternion();
   * console.log(Box.rotation) // {_x: 0.7853981633974483, _y: 0, _z: 0}
   * ```
   */
  updateQuaternion(): void {
    const rotMat = Mat4.fromQuat(this.quaternion)
    this.rotation = Vec3.fromRotationMatrix(rotMat) || new Vec3()
  }

  /**
   * Sets the parent of this object and indicates whether to set a child relationship on the parent.
   * @param parent - The parent object to use
   * @param notifyParent - Whether to set the full parent-child relationsjip
   */
  setParent(parent: Obj, notifyParent: boolean = true): void {
    if (this.parent && parent !== this.parent)
      this.parent.removeChild(this, false)
    this.parent = parent
    if (notifyParent && parent) parent.addChild(this, false)
  }

  /**
   * Adds a child object to this and indicates whether to notify the child
   * @param child - The object to add as a child of this one
   * @param notifyChild - Whether to set the parent of the indicated child to this
   */
  addChild(child: Obj, notifyChild: boolean = true): void {
    if (!~this.children.indexOf(child)) this.children.push(child)
    if (notifyChild) child.setParent(this, false)
  }

  /**
   * Remove a child from this object.
   * @param child - The child to remove
   * @param notifyChild - Whether to notify the child of the removal
   */
  removeChild(child: Obj, notifyChild: boolean = true): void {
    if (!!~this.children.indexOf(child))
      this.children.splice(this.children.indexOf(child), 1)
    if (notifyChild) child.setParent(null, false)
  }

  /**
   * Update the fill world matrix of this object basically used for recursively looping down the hierarchy when a change in the RTS matrix is changed on this.
   * @param force Even is this is not set to world matrix update, force it. Used when looping down past the first iteration.
   */
  updateMatrixWorld(force?: boolean): void {
    if (this.matrixAutoUpdate) this.updateMatrix()
    if (this.worldMatrixNeedsUpdate || force) {
      if (this.parent === null) this.worldMatrix = this.matrix.clone()
      else this.worldMatrix = this.parent.worldMatrix.multiplyNew(this.matrix)
      this.worldMatrixNeedsUpdate = false
      force = true
    }

    for (let i = 0, l = this.children.length; i < l; i++) {
      this.children[i].updateMatrixWorld(force)
    }
  }

  /**
   * Updates the object matrix based on the rotation, translation and scale , then runs an update.
   */
  updateMatrix(): void {
    this.matrix = Mat4.fromRotationTranslationScale(
      this.quaternion,
      this.position,
      this.scale
    )
    this.worldMatrixNeedsUpdate = true
  }

  /**
   * Traverses the object tree and runs a given function against the object. If true is returned, the traversal is stopped.
   * This is useful for testing things like visibility etc.
   * @param callback - The function to call, it should return true or null based on some condition
   */
  traverse(callback: (node: Obj) => boolean | null): void {
    // Return true in callback to stop traversing children
    if (callback(this)) return
    for (let i = 0, l = this.children.length; i < l; i++) {
      this.children[i].traverse(callback)
    }
  }

  /**
   * Decomposes the object matrix into the various components necessary to populate this object.
   */
  decompose(): void {
    this.position = this.matrix.translation
    this.quaternion = this.matrix.rotation
    this.scale = this.matrix.scaling
    const rotMat = Mat4.fromQuat(this.quaternion)
    this.rotation = Vec3.fromRotationMatrix(rotMat) || new Vec3()
  }

  /**
   * Makes the object look at a particular target, useful for cameras
   * @param target - The point to look at
   * @param invert - Look away from, if true
   */
  lookAt(target: Vec3, invert: boolean = false): void {
    if (invert) this.matrix = Mat4.lookAt(this.position, target, this.up)
    else this.matrix = Mat4.lookAt(target, this.position, this.up)
    this.quaternion = this.matrix.rotation
    const rotMat = Mat4.fromQuat(this.quaternion)
    this.rotation = Vec3.fromRotationMatrix(rotMat) || new Vec3()
    this.updateRotation()
  }
}

export { Obj }
