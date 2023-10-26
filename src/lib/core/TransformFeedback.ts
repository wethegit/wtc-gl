import { WTCGLRenderingContext } from '../types'
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
  program?: Program
  transformFeedbacks: {
    [key: string]: TransformFeedbackAttribute
  }
}

/**
 * To-Do
 * Update this class to take care of its own internal state (like render targets) rather than relying on geo to control state
 */
export class TransformFeedback {
  VAOs: [WebGLVertexArrayObject, WebGLVertexArrayObject]
  TFBs: [WebGLTransformFeedback, WebGLTransformFeedback]
  BufferRefs: { [key: string]: { i: number; buffer: WebGLBuffer } }[]

  constructor(
    gl: WTCGLRenderingContext,
    { program, transformFeedbacks }: TransformFeedbackOptions
  ) {
    this.VAOs = [gl.createVertexArray(), gl.createVertexArray()]
    this.TFBs = [gl.createTransformFeedback(), gl.createTransformFeedback()]
    this.BufferRefs = []
    const names = Object.keys(transformFeedbacks)

    this.VAOs.forEach((vao: WebGLVertexArrayObject, i: number) => {
      gl.bindVertexArray(vao)

      const buffers = []
      const bufferRef = {}

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
          buffer: defaultBuffer
        } = tf

        const buffer =
          data && !defaultBuffer
            ? createBuffer(gl, data, usage, buffertype)
            : defaultBuffer

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
}
