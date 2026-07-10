import type { WTCGLRenderingContext } from '../types'

import { Program } from './Program'

const createBuffer = (
  gl: WTCGLRenderingContext,
  data: Float32Array,
  usage: GLenum = gl.STATIC_DRAW,
  type: GLenum = gl.ARRAY_BUFFER
): WebGLBuffer => {
  const buffer: WebGLBuffer = gl.createBuffer()!

  gl.bindBuffer(type, buffer)
  gl.bufferData(type, data, usage)

  return buffer
}

export interface TransformFeedbackAttribute {
  size: number
  type?: GLenum
  normalize?: boolean
  stride?: number
  offset?: number
  buffer?: WebGLBuffer
  data: Float32Array
  varying: string
  usage?: GLenum
  buffertype?: GLenum
}

export interface TransformFeedbackOptions {
  program: Program
  transformFeedbacks: {
    [key: string]: TransformFeedbackAttribute
  }
}

export type BufferRef = { i: number; buffer: WebGLBuffer | null }

export type BufferRecord = Record<string, BufferRef>

/**
 * To-Do
 * Update this class to take care of its own internal state (like render targets) rather than relying on geo to control state
 */
export class TransformFeedback {
  gl: WTCGLRenderingContext
  VAOs: [WebGLVertexArrayObject, WebGLVertexArrayObject]
  TFBs: [WebGLTransformFeedback, WebGLTransformFeedback]
  BufferRefs: BufferRecord[]

  // Buffers created by this instance (as opposed to caller-supplied ones),
  // so remove() only deletes what it owns.
  #ownedBuffers: WebGLBuffer[] = []

  constructor(
    gl: WTCGLRenderingContext,
    { program, transformFeedbacks }: TransformFeedbackOptions
  ) {
    this.gl = gl
    this.VAOs = [gl.createVertexArray(), gl.createVertexArray()]
    this.TFBs = [gl.createTransformFeedback()!, gl.createTransformFeedback()!]
    this.BufferRefs = []
    const names = Object.keys(transformFeedbacks)

    this.VAOs.forEach((vao: WebGLVertexArrayObject, i: number) => {
      gl.bindVertexArray(vao)

      const buffers: (WebGLBuffer | null)[] = []
      const bufferRef: BufferRecord = {}

      for (let i = 0; i < names.length; i++) {
        const tf = transformFeedbacks[names[i]]

        const {
          size = 1,
          type = gl.FLOAT,
          normalize = false,
          stride = 0,
          offset = 0,
          data,
          usage = gl.STATIC_DRAW,
          buffertype = gl.ARRAY_BUFFER,
          buffer: defaultBuffer = null
        } = tf

        let buffer = defaultBuffer
        if (data && !defaultBuffer) {
          buffer = createBuffer(gl, data, usage, buffertype)
          this.#ownedBuffers.push(buffer)
        }

        bufferRef[names[i]] = { i, buffer }

        gl.bindAttribLocation(program, i, names[i])
        gl.enableVertexAttribArray(i)
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.vertexAttribPointer(i, size, type, normalize, stride, offset)

        buffers.push(buffer)
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, null)

      // TO DO Try putting these inside the loop
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.TFBs[i])

      buffers.forEach((b, i) => {
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, i, b)
      })

      gl.bindVertexArray(null)

      this.BufferRefs.push(bufferRef)
    })
  }

  /**
   * Deletes the GL resources this instance created: both vertex array
   * objects, both transform feedback objects, and any buffers it allocated
   * from attribute data. Buffers supplied by the caller via the `buffer`
   * option are left alone.
   */
  remove(): void {
    const { gl } = this
    this.VAOs.forEach((vao) => gl.renderer.deleteVertexArray(vao))
    this.TFBs.forEach((tfb) => gl.deleteTransformFeedback(tfb))
    this.#ownedBuffers.forEach((buffer) => gl.deleteBuffer(buffer))
    this.#ownedBuffers = []
    this.BufferRefs = []
  }
}
