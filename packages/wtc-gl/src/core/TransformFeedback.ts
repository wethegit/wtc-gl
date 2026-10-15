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
  /**
   * The program whose varyings are captured. Pass the `Program` rather than
   * its `WebGLProgram` so the feedback can be rebuilt after context loss.
   */
  program: Program | WebGLProgram
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

  #options: TransformFeedbackOptions
  // The context generation this feedback was created for
  #contextVersion: number

  constructor(gl: WTCGLRenderingContext, options: TransformFeedbackOptions) {
    this.gl = gl
    this.#options = options
    this.#contextVersion = gl.renderer.contextVersion
    ;[this.VAOs, this.TFBs, this.BufferRefs] = this.#create()

    gl.renderer.track(this)
  }

  /**
   * Create the vertex arrays, transform feedback objects and buffers. Buffers
   * are filled from each attribute's `data`, so after a context restore the
   * simulation starts again from its initial state.
   */
  #create(
    restoring = false
  ): [TransformFeedback['VAOs'], TransformFeedback['TFBs'], BufferRecord[]] {
    const { gl } = this
    const { program, transformFeedbacks } = this.#options
    // A raw WebGLProgram from before a context loss can't be used any more
    const glProgram =
      program instanceof Program ? program.program : restoring ? null : program
    const VAOs: TransformFeedback['VAOs'] = [
      gl.createVertexArray(),
      gl.createVertexArray()
    ]
    const TFBs: TransformFeedback['TFBs'] = [
      gl.createTransformFeedback()!,
      gl.createTransformFeedback()!
    ]
    const BufferRefs: BufferRecord[] = []
    const names = Object.keys(transformFeedbacks)

    VAOs.forEach((vao: WebGLVertexArrayObject, i: number) => {
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

        if (glProgram) gl.bindAttribLocation(glProgram, i, names[i])
        gl.enableVertexAttribArray(i)
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.vertexAttribPointer(i, size, type, normalize, stride, offset)

        buffers.push(buffer)
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, null)

      // TO DO Try putting these inside the loop
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, TFBs[i])

      buffers.forEach((b, i) => {
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, i, b)
      })

      gl.bindVertexArray(null)

      BufferRefs.push(bufferRef)
    })

    return [VAOs, TFBs, BufferRefs]
  }

  /**
   * Rebuild after the WebGL context has been restored. Called by the
   * renderer.
   */
  restoreContext(): void {
    if (this.#contextVersion === this.gl.renderer.contextVersion) return
    this.#contextVersion = this.gl.renderer.contextVersion

    const { program, transformFeedbacks } = this.#options
    // The varyings are bound to the program, so it has to be relinked first
    if (program instanceof Program) program.restoreContext()
    if (Object.values(transformFeedbacks).some((tf) => tf.buffer)) {
      console.warn(
        'TransformFeedback buffers passed in with the `buffer` option are lost with the context and must be recreated by the caller.'
      )
    }

    // Everything from the old context is already gone, so nothing to delete
    this.#ownedBuffers = []
    ;[this.VAOs, this.TFBs, this.BufferRefs] = this.#create(true)
  }

  /**
   * Deletes the GL resources this instance created: both vertex array
   * objects, both transform feedback objects, and any buffers it allocated
   * from attribute data. Buffers supplied by the caller via the `buffer`
   * option are left alone.
   */
  remove(): void {
    const { gl } = this
    this.VAOs.forEach((vao) => gl.deleteVertexArray(vao))
    this.TFBs.forEach((tfb) => gl.deleteTransformFeedback(tfb))
    this.#ownedBuffers.forEach((buffer) => gl.deleteBuffer(buffer))
    this.#ownedBuffers = []
    this.BufferRefs = []
    gl.renderer.untrack(this)
  }
}
