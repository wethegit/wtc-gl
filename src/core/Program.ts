import {
  WTCGLRenderingContext,
  WTCGLBlendFunction,
  WTCGLBlendEquation,
  WTCGLUniformMap,
  WTCGLAttributeMap,
  WTCGLActiveInfo
} from './types'
import { Texture } from './Texture'
import { Uniform } from './Uniform'

// TODO: upload empty texture if null ? maybe not
// TODO: upload identity matrix if null ?
// TODO: sampler Cube

interface WTCGLUniformArray {
  [index: string]: Uniform
}

let ID = 1

export class Program {
  id: number
  gl: WTCGLRenderingContext

  uniforms: WTCGLUniformArray

  transparent: boolean
  depthTest: boolean
  depthWrite: boolean
  cullFace: GLenum
  frontFace: GLenum
  depthFunc: GLenum

  blendFunc: WTCGLBlendFunction
  blendEquation: WTCGLBlendEquation

  program: WebGLProgram

  uniformLocations: WTCGLUniformMap
  attributeLocations: WTCGLAttributeMap
  attributeOrder: string

  constructor(
    gl: WTCGLRenderingContext,
    {
      vertex,
      fragment,
      uniforms = {},

      transparent = false,
      cullFace = gl.BACK,
      frontFace = gl.CCW,
      depthTest = true,
      depthWrite = true,
      depthFunc = gl.LESS
    }: {
      vertex?: string
      fragment?: string
      uniforms?: WTCGLUniformArray
      transparent?: boolean
      cullFace?: GLenum
      frontFace?: GLenum
      depthTest?: boolean
      depthWrite?: boolean
      depthFunc?: GLenum
    } = {}
  ) {
    if (!gl.canvas) console.error('gl not passed as first argument to Program')
    this.gl = gl
    this.uniforms = uniforms
    this.id = ID++

    if (!vertex) console.warn('vertex shader not supplied')
    if (!fragment) console.warn('fragment shader not supplied')

    // Store program state
    this.transparent = transparent
    this.cullFace = cullFace
    this.frontFace = frontFace
    this.depthTest = depthTest
    this.depthWrite = depthWrite
    this.depthFunc = depthFunc
    this.blendFunc = {}
    this.blendEquation = {}

    // set default blendFunc if transparent flagged
    if (this.transparent && !this.blendFunc.src) {
      if (this.gl.renderer.premultipliedAlpha)
        this.setBlendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA)
      else this.setBlendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA)
    }

    // compile vertex shader and log errors
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)
    gl.shaderSource(vertexShader, vertex)
    gl.compileShader(vertexShader)
    if (gl.getShaderInfoLog(vertexShader) !== '') {
      console.warn(
        `${gl.getShaderInfoLog(vertexShader)}\nVertex Shader\n${addLineNumbers(
          vertex
        )}`
      )
    }

    // compile fragment shader and log errors
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
    gl.shaderSource(fragmentShader, fragment)
    gl.compileShader(fragmentShader)
    if (gl.getShaderInfoLog(fragmentShader) !== '') {
      console.warn(
        `${gl.getShaderInfoLog(
          fragmentShader
        )}\nFragment Shader\n${addLineNumbers(fragment)}`
      )
    }

    // compile program and log errors
    this.program = gl.createProgram()
    gl.attachShader(this.program, vertexShader)
    gl.attachShader(this.program, fragmentShader)
    gl.linkProgram(this.program)
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.warn(gl.getProgramInfoLog(this.program))
      return this
    }

    // Remove shader once linked
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)

    // Get active uniform locations
    this.uniformLocations = new Map()
    let numUniforms = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS)
    for (let uIndex = 0; uIndex < numUniforms; uIndex++) {
      let uniform: WTCGLActiveInfo = gl.getActiveUniform(this.program, uIndex)
      this.uniformLocations.set(
        uniform,
        gl.getUniformLocation(this.program, uniform.name)
      )

      // split uniforms' names to separate array and struct declarations
      const split = uniform.name.match(/(\w+)/g)

      uniform.uniformName = split[0]

      // If a uniform location points to a structure, this is how we parse that.
      if (split.length === 3) {
        uniform.isStructArray = true
        uniform.structIndex = Number(split[1])
        uniform.structProperty = split[2]
      } else if (split.length === 2 && isNaN(Number(split[1]))) {
        uniform.isStruct = true
        uniform.structProperty = split[1]
      }
    }

    // Get active attribute locations
    this.attributeLocations = new Map()
    const locations = []
    const numAttribs = gl.getProgramParameter(
      this.program,
      gl.ACTIVE_ATTRIBUTES
    )
    for (let aIndex = 0; aIndex < numAttribs; aIndex++) {
      const attribute = gl.getActiveAttrib(this.program, aIndex)
      const location = gl.getAttribLocation(this.program, attribute.name)
      locations[location] = attribute.name
      this.attributeLocations.set(attribute, location)
    }
    this.attributeOrder = locations.join('')
  }

  setBlendFunc(
    src: GLenum,
    dst: GLenum,
    srcAlpha?: GLenum,
    dstAlpha?: GLenum
  ): void {
    this.blendFunc.src = src
    this.blendFunc.dst = dst
    this.blendFunc.srcAlpha = srcAlpha
    this.blendFunc.dstAlpha = dstAlpha
    if (src) this.transparent = true
  }

  setBlendEquation(modeRGB: GLenum, modeAlpha: GLenum): void {
    this.blendEquation.modeRGB = modeRGB
    this.blendEquation.modeAlpha = modeAlpha
  }

  applyState(): void {
    if (this.depthTest) this.gl.renderer.enable(this.gl.DEPTH_TEST)
    else this.gl.renderer.disable(this.gl.DEPTH_TEST)

    if (this.cullFace) this.gl.renderer.enable(this.gl.CULL_FACE)
    else this.gl.renderer.disable(this.gl.CULL_FACE)

    if (this.blendFunc.src) this.gl.renderer.enable(this.gl.BLEND)
    else this.gl.renderer.disable(this.gl.BLEND)

    if (this.cullFace) this.gl.renderer.cullFace = this.cullFace
    this.gl.renderer.frontFace = this.frontFace
    this.gl.renderer.depthMask = this.depthWrite
    this.gl.renderer.depthFunc = this.depthFunc
    if (this.blendFunc.src)
      this.gl.renderer.setBlendFunc(
        this.blendFunc.src,
        this.blendFunc.dst,
        this.blendFunc.srcAlpha,
        this.blendFunc.dstAlpha
      )
    this.gl.renderer.setBlendEquation(
      this.blendEquation.modeRGB,
      this.blendEquation.modeAlpha
    )
  }

  use({ flipFaces = false }: { flipFaces?: boolean } = {}): void {
    let textureUnit = -1
    const programActive = this.gl.renderer.currentProgram === this.id

    // Avoid gl call if program already in use
    if (!programActive) {
      this.gl.useProgram(this.program)
      this.gl.renderer.currentProgram = this.id
    }

    // Set only the active uniforms found in the shader
    this.uniformLocations.forEach((location, activeUniform) => {
      let name = activeUniform.uniformName

      // get supplied uniform
      let uniform = this.uniforms[name]

      // For structs, get the specific property instead of the entire object
      if (activeUniform.isStruct) {
        uniform = uniform[activeUniform.structProperty]
        name += `.${activeUniform.structProperty}`
      }
      if (activeUniform.isStructArray) {
        uniform =
          uniform[activeUniform.structIndex][activeUniform.structProperty]
        name += `[${activeUniform.structIndex}].${activeUniform.structProperty}`
      }

      if (!uniform) {
        return warn(`Active uniform ${name} has not been supplied`)
      }

      if (uniform && uniform.value === undefined) {
        return warn(`${name} uniform is missing a value parameter`)
      }

      if (uniform.kind === 'texture' && uniform.value instanceof Texture) {
        textureUnit = textureUnit + 1

        // Check if texture needs to be updated
        uniform.value.update(textureUnit)
        return uniform.setUniform(
          this.gl,
          activeUniform.type,
          location,
          textureUnit
        )
      }

      // For texture arrays, set uniform as an array of texture units instead of just one
      if (uniform.kind === 'texture_array') {
        if (
          uniform.value instanceof Array &&
          uniform.value[0] instanceof Texture
        ) {
          const textureUnits = []
          uniform.value.forEach((value) => {
            textureUnit = textureUnit + 1
            value.update(textureUnit)
            textureUnits.push(textureUnit)
          })

          return uniform.setUniform(
            this.gl,
            activeUniform.type,
            location,
            textureUnits
          )
        }
      }

      uniform.setUniform(this.gl, activeUniform.type, location, uniform.value)
    })

    this.applyState()
    if (flipFaces)
      this.gl.renderer.frontFace =
        this.frontFace === this.gl.CCW ? this.gl.CW : this.gl.CCW
  }

  remove() {
    this.gl.deleteProgram(this.program)
  }
}

function addLineNumbers(string) {
  let lines = string.split('\n')
  for (let i = 0; i < lines.length; i++) {
    lines[i] = i + 1 + ': ' + lines[i]
  }
  return lines.join('\n')
}

let warnCount = 0
function warn(message) {
  if (warnCount > 100) return
  console.warn(message)
  warnCount++
  if (warnCount > 100)
    console.warn('More than 100 program warnings - stopping logs.')
}