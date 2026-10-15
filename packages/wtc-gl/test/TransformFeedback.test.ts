import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Program, type ProgramOptions } from '../src/core/Program'
import { TransformFeedback } from '../src/core/TransformFeedback'
import { Geometry } from '../src/geometry/Geometry'
import { GeometryAttribute } from '../src/geometry/GeometryAttribute'
import type { Renderer } from '../src/core/Renderer'
import { createMockRenderer, type MockGL } from './mockGL'

const LINK_STATUS = 35714

describe('TransformFeedback', () => {
  let gl: MockGL
  let renderer: Renderer
  // The attributes the next program reports as active, in location order
  let activeAttributes: string[]

  // A program whose active attributes are `attributes`
  const program = (attributes: string[], options: Partial<ProgramOptions>) => {
    activeAttributes = attributes
    return new Program(gl, { vertex: 'v', fragment: 'f', ...options })
  }

  const simProgram = (options: Partial<ProgramOptions> = {}) =>
    program(['a_position', 'a_velocity'], {
      transformFeedbackVaryings: ['v_position', 'v_velocity'],
      ...options
    })

  // Two vertices with 2D positions and velocities
  const attributes = () => ({
    a_velocity: {
      size: 2,
      data: new Float32Array([5, 6, 7, 8]),
      varying: 'v_velocity'
    },
    a_position: {
      size: 2,
      data: new Float32Array([1, 2, 3, 4]),
      varying: 'v_position'
    }
  })

  beforeEach(() => {
    activeAttributes = []
    ;({ gl, renderer } = createMockRenderer({
      getProgramParameter: vi.fn((_program: unknown, pname: number) =>
        pname === LINK_STATUS
          ? true
          : pname === gl.ACTIVE_ATTRIBUTES
            ? activeAttributes.length
            : 0
      ),
      getActiveAttrib: vi.fn((_program: unknown, i: number) => ({
        name: activeAttributes[i],
        type: 35664, // FLOAT_VEC2
        size: 1
      })),
      getAttribLocation: vi.fn((_program: unknown, name: string) =>
        activeAttributes.indexOf(name)
      )
    }))
  })

  it("orders the buffers by the program's varyings", () => {
    const tf = new TransformFeedback(gl, {
      program: simProgram(),
      attributes: attributes()
    })

    expect(tf.count).toBe(2)
    expect(gl.transformFeedbackVaryings).toHaveBeenCalledWith(
      tf.program.program,
      ['v_position', 'v_velocity'],
      gl.SEPARATE_ATTRIBS
    )
    // Position is captured at index 0 even though it was listed second
    const bases = vi.mocked(gl.bindBufferBase).mock.calls
    expect(bases.map(([, index]) => index)).toEqual([0, 1, 0, 1])
    expect(bases[0][2]).toBe(tf.attribute('a_position').buffer)
  })

  it("throws when the attributes don't match the varyings", () => {
    expect(
      () =>
        new TransformFeedback(gl, {
          program: simProgram(),
          attributes: { a_position: attributes().a_position }
        })
    ).toThrow(/No attribute captures v_velocity/)

    expect(
      () =>
        new TransformFeedback(gl, {
          program: simProgram({ transformFeedbackVaryings: ['v_position'] }),
          attributes: attributes()
        })
    ).toThrow(/a_velocity \(v_velocity\) not in the program's varyings/)
  })

  it('throws when an attribute has too little data', () => {
    const short = attributes()
    short.a_velocity.data = new Float32Array(2)
    expect(
      () =>
        new TransformFeedback(gl, { program: simProgram(), attributes: short })
    ).toThrow(/a_velocity has 2 values/)
  })

  it('steps without drawing, then swaps the buffers', () => {
    const tf = new TransformFeedback(gl, {
      program: simProgram(),
      attributes: attributes()
    })
    const position = tf.attribute('a_position')
    const first = position.buffer
    vi.mocked(gl.enable).mockClear()

    tf.step()

    expect(gl.enable).toHaveBeenCalledWith(gl.RASTERIZER_DISCARD)
    expect(gl.beginTransformFeedback).toHaveBeenCalledWith(gl.POINTS)
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.POINTS, 0, 2)
    expect(gl.endTransformFeedback).toHaveBeenCalled()
    expect(gl.disable).toHaveBeenLastCalledWith(gl.RASTERIZER_DISCARD)
    expect(gl.bindTransformFeedback).toHaveBeenLastCalledWith(
      gl.TRANSFORM_FEEDBACK,
      null
    )

    // The output follows the results, and the same object is reused
    expect(position.buffer).not.toBe(first)
    expect(tf.attribute('a_position')).toBe(position)
    tf.step()
    expect(position.buffer).toBe(first)
  })

  it('reads from one side while writing the other', () => {
    const tf = new TransformFeedback(gl, {
      program: simProgram(),
      attributes: attributes()
    })
    const read = tf.attribute('a_position').buffer
    vi.mocked(gl.bindBuffer).mockClear()
    vi.mocked(gl.bindTransformFeedback).mockClear()

    tf.step()

    // The read side's vertex array was built pointing at the latest results
    const pointed = vi
      .mocked(gl.bindBuffer)
      .mock.calls.filter(([target]) => target === gl.ARRAY_BUFFER)
      .map(([, buffer]) => buffer)
    expect(pointed).toContain(read)
    const [, feedback] = vi.mocked(gl.bindTransformFeedback).mock.calls[0]
    expect(feedback).not.toBe(null)
    // After the step, the written side holds the latest results
    expect(tf.attribute('a_position').buffer).not.toBe(read)
  })

  it('unbinds the array buffer before capturing', () => {
    const tf = new TransformFeedback(gl, {
      program: simProgram(),
      attributes: attributes()
    })
    // As if a geometry had just pointed a vertex array at the side the next
    // step writes to
    tf.step()
    const writeSide = tf.attribute('a_position').buffer
    tf.step()
    renderer.state.boundBuffer = writeSide
    vi.mocked(gl.bindBuffer).mockClear()
    vi.mocked(gl.beginTransformFeedback).mockClear()

    tf.step()

    expect(gl.bindBuffer).toHaveBeenCalledWith(gl.ARRAY_BUFFER, null)
    const unbound = vi.mocked(gl.bindBuffer).mock.invocationCallOrder[0]
    const began = vi.mocked(gl.beginTransformFeedback).mock
      .invocationCallOrder[0]
    expect(unbound).toBeLessThan(began)
    expect(renderer.state.boundBuffer).toBe(null)
  })

  it('does nothing while the context is lost', () => {
    const tf = new TransformFeedback(gl, {
      program: simProgram(),
      attributes: attributes()
    })
    renderer.contextLost = true
    tf.step()
    expect(gl.beginTransformFeedback).not.toHaveBeenCalled()
  })

  it('interleaves the attributes into one buffer per side', () => {
    const tf = new TransformFeedback(gl, {
      program: simProgram({ transformFeedbackBufferMode: 'interleaved' }),
      attributes: attributes()
    })

    expect(gl.transformFeedbackVaryings).toHaveBeenCalledWith(
      tf.program.program,
      ['v_position', 'v_velocity'],
      gl.INTERLEAVED_ATTRIBS
    )
    const position = tf.attribute('a_position')
    const velocity = tf.attribute('a_velocity')
    expect(position.buffer).toBe(velocity.buffer)
    expect([position.stride, position.offset]).toEqual([16, 0])
    expect([velocity.stride, velocity.offset]).toEqual([16, 8])

    const uploads = vi.mocked(gl.bufferData).mock.calls
    expect(uploads).toHaveLength(2)
    expect([...(uploads[0][1] as Float32Array)]).toEqual([
      1, 2, 5, 6, 3, 4, 7, 8
    ])
    const bases = vi.mocked(gl.bindBufferBase).mock.calls
    expect(bases.map(([, index]) => index)).toEqual([0, 0])
  })

  it('binds static attributes for the simulation, uploading them once', () => {
    const restPosition = new GeometryAttribute({
      size: 2,
      data: new Float32Array([0, 0, 1, 1])
    })
    vi.mocked(gl.createBuffer).mockClear()

    const tf = new TransformFeedback(gl, {
      program: program(['a_position', 'a_velocity', 'a_rest'], {
        transformFeedbackVaryings: ['v_position', 'v_velocity']
      }),
      attributes: attributes(),
      staticAttributes: { a_rest: restPosition }
    })
    tf.step()
    tf.step()

    // 2 sides × 2 feedback buffers, plus the static buffer once
    expect(gl.createBuffer).toHaveBeenCalledTimes(5)
    expect(restPosition.buffer).not.toBe(null)
    expect(
      vi
        .mocked(gl.bufferData)
        .mock.calls.filter(([, data]) => data === restPosition.data)
    ).toHaveLength(1)
  })

  it('lets any geometry draw the latest results', () => {
    const tf = new TransformFeedback(gl, {
      program: simProgram(),
      attributes: attributes()
    })
    const draw = program(['position'], {})
    const position = tf.attribute('a_position')
    vi.mocked(gl.bufferData).mockClear()
    const geometry = new Geometry(gl, { position })
    const pointedAt = () =>
      vi
        .mocked(gl.bindBuffer)
        .mock.calls.filter(([target]) => target === gl.ARRAY_BUFFER)
        .map(([, buffer]) => buffer)

    // The feedback owns the buffer, so the geometry doesn't upload to it
    expect(gl.bufferData).not.toHaveBeenCalled()
    expect(geometry.drawRange.count).toBe(2)

    geometry.draw({ program: draw, mode: gl.POINTS })
    vi.mocked(gl.bindBuffer).mockClear()
    geometry.draw({ program: draw, mode: gl.POINTS })
    expect(pointedAt()).toEqual([])

    tf.step()
    vi.mocked(gl.bindBuffer).mockClear()
    vi.mocked(gl.vertexAttribPointer).mockClear()
    geometry.draw({ program: draw, mode: gl.POINTS })
    expect(pointedAt()).toEqual([position.buffer])
    expect(gl.vertexAttribPointer).toHaveBeenCalledTimes(1)

    // Removing the geometry leaves the feedback's buffers alone
    vi.mocked(gl.deleteBuffer).mockClear()
    geometry.remove()
    expect(gl.deleteBuffer).not.toHaveBeenCalled()
  })

  it('hands out instanced attributes that follow the results too', () => {
    const tf = new TransformFeedback(gl, {
      program: simProgram(),
      attributes: attributes()
    })
    const perVertex = tf.attribute('a_position')
    const perInstance = tf.attribute('a_position', { instanced: 1 })

    expect(perInstance).not.toBe(perVertex)
    expect(tf.attribute('a_position', { instanced: 1 })).toBe(perInstance)
    expect([perVertex.divisor, perInstance.divisor]).toEqual([0, 1])
    expect(perInstance.buffer).toBe(perVertex.buffer)

    tf.step()
    expect(perInstance.buffer).toBe(perVertex.buffer)

    // One shape per simulated vertex
    const shape = new GeometryAttribute({
      size: 2,
      data: new Float32Array([0, 1, -1, -1, 1, -1])
    })
    const geometry = new Geometry(gl, {
      position: shape,
      a_offset: perInstance
    })
    expect(geometry.isInstanced).toBe(true)
    expect(geometry.instancedCount).toBe(2)
    expect(geometry.drawRange.count).toBe(3)
  })

  it('throws for an unknown attribute', () => {
    const tf = new TransformFeedback(gl, {
      program: simProgram(),
      attributes: attributes()
    })
    expect(() => tf.attribute('a_colour')).toThrow(
      /no attribute called a_colour/
    )
  })

  it('starts again from the data on reset', () => {
    const options = attributes()
    const tf = new TransformFeedback(gl, {
      program: simProgram(),
      attributes: options
    })
    const first = tf.attribute('a_position').buffer
    tf.step()
    vi.mocked(gl.bufferData).mockClear()

    options.a_position.data.set([9, 9, 9, 9])
    tf.reset()

    expect(tf.attribute('a_position').buffer).toBe(first)
    expect(gl.bufferData).toHaveBeenCalledTimes(4)
    expect([
      ...(vi.mocked(gl.bufferData).mock.calls[0][1] as Float32Array)
    ]).toEqual([9, 9, 9, 9])
  })

  it('rebuilds after the context is restored', () => {
    const tf = new TransformFeedback(gl, {
      program: simProgram(),
      attributes: attributes()
    })
    tf.step()
    const before = tf.attribute('a_position').buffer
    vi.mocked(gl.linkProgram).mockClear()
    vi.mocked(gl.createTransformFeedback).mockClear()
    vi.mocked(gl.transformFeedbackVaryings).mockClear()

    const canvas = gl.canvas as unknown as EventTarget
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    canvas.dispatchEvent(new Event('webglcontextrestored'))

    expect(gl.linkProgram).toHaveBeenCalled()
    expect(gl.transformFeedbackVaryings).toHaveBeenCalled()
    expect(gl.createTransformFeedback).toHaveBeenCalledTimes(2)
    const after = tf.attribute('a_position').buffer
    expect(after).not.toBe(before)

    // The next step reads the restored buffers
    tf.step()
    expect(tf.attribute('a_position').buffer).not.toBe(after)
    tf.step()
    expect(tf.attribute('a_position').buffer).toBe(after)
  })

  it('deletes what it created on remove', () => {
    const tf = new TransformFeedback(gl, {
      program: simProgram(),
      attributes: attributes()
    })
    tf.step()

    tf.remove()

    expect(gl.deleteBuffer).toHaveBeenCalledTimes(4)
    expect(gl.deleteTransformFeedback).toHaveBeenCalledTimes(2)
    expect(gl.deleteVertexArray).toHaveBeenCalled()
    expect(gl.deleteProgram).not.toHaveBeenCalled()
  })
})
