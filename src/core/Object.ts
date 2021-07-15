import { Vec3, Quat, Mat4 } from 'wtc-math'

class Obj {
  parent: Obj | null
  children: Obj[]
  visible: Boolean

  matrix: Mat4
  worldMatrix: Mat4
  matrixAutoUpdate: Boolean
  worldMatrixNeedsUpdate: Boolean = false

  position: Vec3
  quaternion: Quat
  scale: Vec3
  rotation: Vec3
  up: Vec3

  constructor() {
    this.parent = null
    this.children = []
    this.visible = true

    this.matrix = new Mat4()
    this.worldMatrix = new Mat4()
    this.matrixAutoUpdate = true

    this.position = new Vec3()
    this.quaternion = new Quat()
    this.scale = new Vec3(1)
    this.rotation = new Vec3()
    this.up = new Vec3(0, 1, 0)
  }

  updateRotation() {
    this.quaternion = Quat.fromEuler(this.rotation) || new Quat()
  }

  updateQuaternion() {
    const rotMat = Mat4.fromQuat(this.quaternion)
    this.rotation = Vec3.fromRotationMatrix(rotMat) || new Vec3()
  }

  setParent(parent, notifyParent = true) {
    if (this.parent && parent !== this.parent)
      this.parent.removeChild(this, false)
    this.parent = parent
    if (notifyParent && parent) parent.addChild(this, false)
  }

  addChild(child, notifyChild = true) {
    if (!~this.children.indexOf(child)) this.children.push(child)
    if (notifyChild) child.setParent(this, false)
  }

  removeChild(child, notifyChild = true) {
    if (!!~this.children.indexOf(child))
      this.children.splice(this.children.indexOf(child), 1)
    if (notifyChild) child.setParent(null, false)
  }

  updateMatrixWorld(force?: boolean) {
    if (this.matrixAutoUpdate) this.updateMatrix()
    if (this.worldMatrixNeedsUpdate || force) {
      if (this.parent === null) this.matrix = this.worldMatrix.clone()
      else this.worldMatrix = this.parent.worldMatrix.multiplyNew(this.matrix)
      this.worldMatrixNeedsUpdate = false
      force = true
    }

    for (let i = 0, l = this.children.length; i < l; i++) {
      this.children[i].updateMatrixWorld(force)
    }
  }

  updateMatrix() {
    this.matrix = Mat4.fromRotationTranslationScale(
      this.quaternion,
      this.position,
      this.scale
    )
    this.worldMatrixNeedsUpdate = true
  }

  traverse(callback) {
    // Return true in callback to stop traversing children
    if (callback(this)) return
    for (let i = 0, l = this.children.length; i < l; i++) {
      this.children[i].traverse(callback)
    }
  }

  decompose() {
    this.position = this.matrix.translation
    this.quaternion = this.matrix.rotation
    this.scale = this.matrix.scaling
    const rotMat = Mat4.fromQuat(this.quaternion)
    this.rotation = Vec3.fromRotationMatrix(rotMat) || new Vec3()
  }

  lookAt(target: Vec3, invert: boolean = false) {
    if (invert) this.matrix = Mat4.lookAt(this.position, target, this.up)
    else this.matrix = Mat4.lookAt(target, this.position, this.up)
    this.quaternion = this.matrix.rotation
    const rotMat = Mat4.fromQuat(this.quaternion)
    this.rotation = Vec3.fromRotationMatrix(rotMat) || new Vec3()
  }
}

export { Obj }
