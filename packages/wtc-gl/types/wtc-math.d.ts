declare module 'wtc-math' {
  export class Vec2 {
    x: number
    y: number
    array: number[]
    constructor(x?: number, y?: number)
    [key: string]: any
  }

  export class Vec3 {
    x: number
    y: number
    z: number
    array: number[]
    constructor(x?: number, y?: number, z?: number)
    [key: string]: any
    static fromRotationMatrix(m: Mat4): Vec3 | null
  }

  export class Vec4 {
    x: number
    y: number
    z: number
    w: number
    array: number[]
    constructor(x?: number, y?: number, z?: number, w?: number)
    [key: string]: any
  }

  export class Mat3 {
    array: number[]
    [key: string]: any
    static fromMat4(m: Mat4): Mat3
  }

  export class Mat4 {
    array: number[]
    rotation: Quat
    [key: string]: any
    static fromQuat(q: Quat): Mat4
    static fromRotationTranslationScale(q: Quat, t: Vec3, s: Vec3): Mat4
    static perspective(fov: number, aspect: number, near: number, far: number): Mat4
    static ortho(left: number, right: number, bottom: number, top: number, near: number, far: number): Mat4
    static targetTo(eye: Vec3, target: Vec3, up: Vec3): Mat4
  }

  export class Quat {
    x: number
    y: number
    z: number
    w: number
    array: number[]
    [key: string]: any
    static fromEuler(v: Vec3): Quat | null
    static fromAxisAngle(axis: Vec3, angle: number): Quat
  }
}
