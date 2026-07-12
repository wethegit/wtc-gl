/**
 * Minimal ambient types for wtc-math, which ships no declaration files (its
 * `types` field points at a file missing from the published package). That
 * gap also blanks wtc-gl's `export * from 'wtc-math'` at the type level, so
 * without this shim names like `Vec3` can't be imported from `wtc-gl`.
 *
 * Only the surface this package relies on is typed; the index signatures keep
 * the rest of the runtime API usable, just untyped. Delete this file when
 * wtc-math publishes its own types.
 */
declare module 'wtc-math' {
  export class Vec2 {
    constructor(x?: number, y?: number)
    x: number
    y: number
    reset(x: number, y: number): Vec2
    [key: string]: unknown
  }

  export class Vec3 {
    constructor(x?: number, y?: number, z?: number)
    x: number
    y: number
    z: number
    reset(x: number, y: number, z: number): Vec3
    [key: string]: unknown
  }

  export class Vec4 {
    constructor(x?: number, y?: number, z?: number, w?: number)
    x: number
    y: number
    z: number
    w: number
    reset(x: number, y: number, z: number, w: number): Vec4
    [key: string]: unknown
  }

  export class Quat {
    constructor(...args: unknown[])
    [key: string]: unknown
  }

  export class Mat3 {
    constructor(...args: unknown[])
    [key: string]: unknown
  }

  export class Mat4 {
    constructor(...args: unknown[])
    [key: string]: unknown
  }
}
