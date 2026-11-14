import type {
  WTCGLRenderingContext,
  WTCGLUniformValue,
  WTCGLUniformStruct,
  WTCGLActiveInfo
} from '../types'

import { Texture } from './Texture'
import { Program } from './Program'

/**
 * The GLSL type of a {@link Uniform}. Textures and texture arrays are
 * detected from the value, so `kind` is only used to warn about mismatches.
 * @category Core
 */
export type UniformKind =
  | 'int'
  | 'float'
  | 'boolean'
  | 'texture'
  | 'texture_array'
  | 'float_vec2'
  | 'float_vec3'
  | 'float_vec4'
  | 'int_vec2'
  | 'int_vec3'
  | 'int_vec4'
  | 'uint'
  | 'uint_vec2'
  | 'uint_vec3'
  | 'uint_vec4'
  | 'mat2'
  | 'mat3'
  | 'mat4'
  | 'mat2x3'
  | 'mat2x4'
  | 'mat3x2'
  | 'mat3x4'
  | 'mat4x2'
  | 'mat4x3'

/**
 * Options for creating a {@link Uniform}.
 * @category Core
 */
export interface UniformOptions {
  /** The name of the uniform, used in warnings. The key in the program's `uniforms` is what matches it to the shader. @default 'uniform' */
  name: string
  /** The value to upload. @default [1, 1] */
  value: WTCGLUniformValue
  /** The GLSL type of the uniform, e.g. `'float'`, `'float_vec3'` or `'texture'`. @default 'float_vec2' */
  kind: UniformKind
}

/**
 * A uniform is just a basic container for simple uniform information.
 * @category Core
 */
export class Uniform {
  /**
   * The uniform name. Currently unused, but for future use in auto-parsing name
   */
  name: string
  /**
   * The uniform value.
   */
  value: WTCGLUniformValue
  /**
   * The uniform kind. Textures are detected from the value, so this is only
   * used to warn when it doesn't match.
   */
  kind: UniformKind
  /**
   * Whether a mismatch warning has already been shown for this uniform.
   */
  private warned = false
  /**
   * Create a uniform object
   * @param options - The uniform's name, value and kind; see {@link UniformOptions}.
   */
  constructor({
    name = 'uniform',
    value = [1, 1],
    kind = 'float_vec2'
  }: Partial<UniformOptions> = {}) {
    this.name = name
    this.value = value
    this.kind = kind
  }
  /**
   * Set the uniform in the stated program.
   * @param gl - The WTCGL rendering context object.
   * @param type - A GLEnum representing the passed uniform type.
   * @param location - The uniform location (just an address to a uniform in program space)
   * @param value - The value of the uniform
   */
  setUniform(
    gl: WTCGLRenderingContext,
    type: GLenum,
    location: WebGLUniformLocation,
    value: WTCGLUniformValue = this.value
  ): void {
    const setValue = gl.renderer.state.uniformLocations.get(location)

    // Typed arrays are cached by copy too, so changes made in place are seen
    if (isArrayLike(value)) {
      if (
        setValue === undefined ||
        !isArrayLike(setValue) ||
        setValue.length !== value.length
      ) {
        // clone array to store as cache
        gl.renderer.state.uniformLocations.set(location, value.slice(0))
      } else {
        if (arraysEqual(setValue, value)) return

        // Update cached array values
        setArray(setValue, value)
        gl.renderer.state.uniformLocations.set(location, setValue)
      }
    } else {
      if (setValue === value) return
      gl.renderer.state.uniformLocations.set(location, value)
    }

    // Doing this to get around typescript's nonsense
    const val = value as Float32List

    switch (type) {
      case 5126: {
        // FLOAT
        if (typeof val === 'number') return gl.uniform1f(location, val)
        return gl.uniform1fv(location, val)
      }
      case 35664:
        // FLOAT_VEC2
        return gl.uniform2fv(location, val)
      case 35665:
        // FLOAT_VEC3
        return gl.uniform3fv(location, val)
      case 35666:
        // FLOAT_VEC4
        return gl.uniform4fv(location, val)
      case 35670: // BOOL
      case 5124: // INT
      case 35678: // SAMPLER_2D
      case 35679: // SAMPLER_3D
      case 35680: // SAMPLER_CUBE
      case 35682: // SAMPLER_2D_SHADOW
      case 36289: // SAMPLER_2D_ARRAY
      case 36292: // SAMPLER_2D_ARRAY_SHADOW
      case 36293: // SAMPLER_CUBE_SHADOW
      case 36298: // INT_SAMPLER_2D
      case 36299: // INT_SAMPLER_3D
      case 36300: // INT_SAMPLER_CUBE
      case 36303: // INT_SAMPLER_2D_ARRAY
      case 36306: // UNSIGNED_INT_SAMPLER_2D
      case 36307: // UNSIGNED_INT_SAMPLER_3D
      case 36308: // UNSIGNED_INT_SAMPLER_CUBE
      case 36311:
        // UNSIGNED_INT_SAMPLER_2D_ARRAY
        return val?.length
          ? gl.uniform1iv(location, val)
          : gl.uniform1i(location, val as unknown as number)
      case 35671: // BOOL_VEC2
      case 35667:
        // INT_VEC2
        return gl.uniform2iv(location, val)
      case 35672: // BOOL_VEC3
      case 35668:
        // INT_VEC3
        return gl.uniform3iv(location, val)
      case 35673: // BOOL_VEC4
      case 35669:
        // INT_VEC4
        return gl.uniform4iv(location, val)
      case 5125:
        // UNSIGNED_INT
        return val?.length
          ? gl.uniform1uiv(location, val)
          : gl.uniform1ui(location, val as unknown as number)
      case 36294:
        // UNSIGNED_INT_VEC2
        return gl.uniform2uiv(location, val)
      case 36295:
        // UNSIGNED_INT_VEC3
        return gl.uniform3uiv(location, val)
      case 36296:
        // UNSIGNED_INT_VEC4
        return gl.uniform4uiv(location, val)
      case 35674:
        // FLOAT_MAT2
        return gl.uniformMatrix2fv(location, false, val)
      case 35675:
        // FLOAT_MAT3
        return gl.uniformMatrix3fv(location, false, val)
      case 35676:
        if (val === null) return
        // FLOAT_MAT4
        return gl.uniformMatrix4fv(location, false, val)
      case 35685:
        // FLOAT_MAT2x3
        return gl.uniformMatrix2x3fv(location, false, val)
      case 35686:
        // FLOAT_MAT2x4
        return gl.uniformMatrix2x4fv(location, false, val)
      case 35687:
        // FLOAT_MAT3x2
        return gl.uniformMatrix3x2fv(location, false, val)
      case 35688:
        // FLOAT_MAT3x4
        return gl.uniformMatrix3x4fv(location, false, val)
      case 35689:
        // FLOAT_MAT4x2
        return gl.uniformMatrix4x2fv(location, false, val)
      case 35690:
        // FLOAT_MAT4x3
        return gl.uniformMatrix4x3fv(location, false, val)
    }
  }
  /**
   * Binds the uniform to the program.
   * @param program - The program to which to bind the uniform.
   * @param location - A flag representing the uniform's location in memory.
   * @param activeUniform - Representes an extention of the standard Web GL active info for uniform.
   */
  bind(
    program: Program,
    location: WebGLUniformLocation,
    activeUniform: WTCGLActiveInfo
  ) {
    if (this.value === undefined) {
      console.warn(`${this.name} uniform is missing a value`)
      return
    }

    // A struct's members each have their own location: pick this one's value
    const value = structMember(this.value, activeUniform)
    if (value === undefined) {
      return this.warnOnce(
        `${this.name} has no value for ${activeUniform.name}; give a struct uniform an object of member values, or an array of them for an array of structs`
      )
    }

    // Decide how to bind from the value rather than `kind`, so a texture
    // passed with the wrong (or default) kind still binds as a texture
    const isTexture = value instanceof Texture
    const isTextureArray = Array.isArray(value) && value[0] instanceof Texture
    const samplerTarget = getSamplerTarget(program.gl, activeUniform.type)
    const isSampler = samplerTarget !== undefined

    if (isTexture || isTextureArray) {
      if (!isSampler) {
        return this.warnOnce(
          `${this.name} is a texture but the shader declares it as a non-sampler type; skipping`
        )
      }
      // WebGL refuses to draw when a texture's target doesn't match its sampler
      const textures = (isTexture ? [value] : value) as Texture[]
      if (textures.some((texture) => texture.target !== samplerTarget)) {
        return this.warnOnce(
          `${this.name} has a texture whose target doesn't match the shader's sampler type (e.g. a cube map on a sampler2D); skipping`
        )
      }
      // A struct's kind can't describe all its members, so it isn't checked
      if (
        value === this.value &&
        this.kind !== (isTexture ? 'texture' : 'texture_array')
      ) {
        this.warnOnce(
          `${this.name} is a texture but has kind '${this.kind}'; binding it as a texture`
        )
      }
    } else if (isSampler && !isTextureUnitValue(value)) {
      // A null texture binds to unit 0, which is common while a target is being set up
      return this.warnOnce(
        `${this.name} is a sampler in the shader but its value isn't a texture; skipping`
      )
    }

    if (isTexture) {
      const texture = value as Texture
      const textureUnit = ++program.textureUnit

      // Check if texture needs to be updated
      texture.update(textureUnit)

      return this.setUniform(
        program.gl,
        activeUniform.type,
        location,
        textureUnit
      )
    }

    // For texture arrays, set uniform as an array of texture units instead of just one
    if (isTextureArray) {
      const textureUnits: number[] = []

      ;(value as Texture[]).forEach((value) => {
        const textureUnit = ++program.textureUnit
        if (value instanceof Texture) value.update(textureUnit)
        textureUnits.push(textureUnit)
      })

      return this.setUniform(
        program.gl,
        activeUniform.type,
        location,
        textureUnits
      )
    }

    this.setUniform(program.gl, activeUniform.type, location, value)
  }
  /**
   * Warn about a mismatch once per uniform, since `bind` runs every frame.
   */
  private warnOnce(message: string): void {
    if (this.warned) return
    this.warned = true
    console.warn(message)
  }
}

/**
 * The value for one active uniform. For a struct (`u_light.colour`) it's the
 * member of the uniform's object value, and for an array of structs
 * (`u_lights[1].colour`) the member of that element; otherwise the value
 * itself.
 */
function structMember(
  value: WTCGLUniformValue,
  activeUniform: WTCGLActiveInfo
): WTCGLUniformValue | undefined {
  const { isStruct, isStructArray, structIndex, structProperty } = activeUniform
  if (!structProperty || (!isStruct && !isStructArray)) return value
  const struct = isStructArray
    ? Array.isArray(value)
      ? (value as WTCGLUniformStruct[])[structIndex ?? 0]
      : undefined
    : value
  if (!isStructValue(struct)) return undefined
  return struct[structProperty]
}

/** Whether a value is a plain object of struct member values. */
function isStructValue(value: unknown): value is WTCGLUniformStruct {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !ArrayBuffer.isView(value) &&
    !(value instanceof Texture)
  )
}

/**
 * The texture target a sampler type reads from, or undefined if the type
 * isn't a sampler.
 */
function getSamplerTarget(
  gl: WTCGLRenderingContext,
  type: GLenum
): GLenum | undefined {
  switch (type) {
    case 35678: // SAMPLER_2D
    case 35682: // SAMPLER_2D_SHADOW
    case 36298: // INT_SAMPLER_2D
    case 36306: // UNSIGNED_INT_SAMPLER_2D
      return gl.TEXTURE_2D
    case 35680: // SAMPLER_CUBE
    case 36293: // SAMPLER_CUBE_SHADOW
    case 36300: // INT_SAMPLER_CUBE
    case 36308: // UNSIGNED_INT_SAMPLER_CUBE
      return gl.TEXTURE_CUBE_MAP
    case 35679: // SAMPLER_3D
    case 36299: // INT_SAMPLER_3D
    case 36307: // UNSIGNED_INT_SAMPLER_3D
      return gl.TEXTURE_3D
    case 36289: // SAMPLER_2D_ARRAY
    case 36292: // SAMPLER_2D_ARRAY_SHADOW
    case 36303: // INT_SAMPLER_2D_ARRAY
    case 36311: // UNSIGNED_INT_SAMPLER_2D_ARRAY
      return gl.TEXTURE_2D_ARRAY
  }
}

/**
 * Whether a value can be sent to a sampler as-is: a texture unit, an array of
 * them, or null for unit 0.
 */
function isTextureUnitValue(value: WTCGLUniformValue | null): boolean {
  if (value === null || typeof value === 'number') return true
  return Array.isArray(value) && value.every((v) => typeof v === 'number')
}

type ArrayValue = Texture[] | number[] | Float32Array

function isArrayLike(
  value: WTCGLUniformValue | undefined
): value is ArrayValue {
  return Array.isArray(value) || value instanceof Float32Array
}

function arraysEqual(a: ArrayValue, b: ArrayValue): boolean {
  if (a.length !== b.length) return false
  for (let i = 0, l = a.length; i < l; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function setArray(a: ArrayValue, b: ArrayValue): void {
  for (let i = 0, l = a.length; i < l; i++) {
    a[i] = b[i]
  }
}
