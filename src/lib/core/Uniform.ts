import {
  WTCGLRenderingContext,
  WTCGLUniformValue,
  WTCGLActiveInfo
} from '../types'
import { Texture } from './Texture'
import { Program } from './Program'

type Kind =
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
  | 'mat2'
  | 'mat3'
  | 'mat4'

// cache of typed arrays used to flatten uniform arrays
const arrayCacheF32 = {}

/**
 * A uniform is just a basic container for simple uniform information.
 */
class Uniform {
  /**
   * The uniform name. Currently unused, but for future use in auto-parsing name
   */
  name: string
  /**
   * The uniform value.
   */
  value: WTCGLUniformValue
  /**
   * The uniform kind. Currently unused but useful in future for testing against supplied bind type.
   */
  kind: Kind
  /**
   * Create a unform object
   * @param __namedParameters
   * @param name - The name of the uniform.
   * @param value - The value for the uniform.
   * @param kind - The type of uniform.
   */
  constructor({
    name = 'uniform',
    value = [1, 1],
    kind = 'float_vec2'
  }: {
    name?: string
    value?: WTCGLUniformValue
    kind?: Kind
  } = {}) {
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
    if (value instanceof Array) {
      value = flatten(value)
    }

    const setValue = gl.renderer.state.uniformLocations.get(location)

    if (value instanceof Array) {
      if (
        setValue === undefined ||
        (setValue instanceof Array && setValue.length !== value.length)
      ) {
        // clone array to store as cache
        gl.renderer.state.uniformLocations.set(location, value.slice(0))
      } else if (setValue instanceof Array) {
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
    const val = value

    switch (type) {
      case 5126:
        // FLOAT
        if (val instanceof Array) {
          return gl.uniform1fv(location, val)
        } else if (typeof val === 'number') {
          gl.uniform1f(location, val)
        }
        return null
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
      case 35680:
        // SAMPLER_CUBE
        return val.length
          ? gl.uniform1iv(location, val)
          : gl.uniform1i(location, val)
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

    if (this.kind === 'texture' && this.value instanceof Texture) {
      const textureUnit = ++program.textureUnit

      // Check if texture needs to be updated
      this.value.update(textureUnit)

      return this.setUniform(
        program.gl,
        activeUniform.type,
        location,
        textureUnit
      )
    }

    // For texture arrays, set uniform as an array of texture units instead of just one
    if (this.kind === 'texture_array') {
      if (this.value instanceof Array && this.value[0] instanceof Texture) {
        const textureUnits = []

        this.value.forEach((value) => {
          const textureUnit = ++program.textureUnit
          value.update(textureUnit)
          textureUnits.push(textureUnit)
        })

        return this.setUniform(
          program.gl,
          activeUniform.type,
          location,
          textureUnits
        )
      }
    }

    this.setUniform(program.gl, activeUniform.type, location)
  }
}

function flatten(a: Texture[] | number[]): Float32Array | number[] | Texture[] {
  const arrayLen = a.length
  if (a[0] instanceof Array) {
    const valueLen = a[0].length
    const length = arrayLen * valueLen
    let value = arrayCacheF32[length]
    if (!value) arrayCacheF32[length] = value = new Float32Array(length)
    for (let i = 0; i < arrayLen; i++) value.set(a[i], i * valueLen)
    return value
  } else {
    return a
  }
}

function arraysEqual(
  a: Texture[] | number[],
  b: Texture[] | number[]
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0, l = a.length; i < l; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function setArray(a: Texture[] | number[], b: Texture[] | number[]): void {
  for (let i = 0, l = a.length; i < l; i++) {
    a[i] = b[i]
  }
}

export { Uniform }