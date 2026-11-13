import { describe, expect, it, vi, type Mock } from 'vitest'

import { Program } from '../src/core/Program'
import { Uniform } from '../src/core/Uniform'
import { createMockRenderer } from './mockGL'

/**
 * A renderer whose programs each have one active uniform, `u_x`, with a new
 * location per link. Set `link.fails` to make the next link fail.
 */
function setup() {
  const link = { fails: false }
  const { gl, renderer } = createMockRenderer({
    getProgramParameter: (_program: unknown, pname: number) =>
      pname === gl.LINK_STATUS
        ? !link.fails
        : pname === gl.ACTIVE_UNIFORMS
          ? 1
          : 0,
    getActiveUniform: () => ({ name: 'u_x', type: gl.FLOAT, size: 1 }),
    getUniformLocation: () => ({})
  })
  const uniforms = {
    u_x: new Uniform({ name: 'x', value: 1, kind: 'float' })
  }
  const program = new Program(gl, {
    vertex: 'gl_Position v1',
    fragment: 'f1',
    uniforms,
    depthTest: false
  })
  return { gl, renderer, link, uniforms, program }
}

const sources = (shaderSource: unknown) =>
  (shaderSource as Mock).mock.calls.map((c) => c[1] as string)

describe('Program.setShaders', () => {
  it('swaps in new shaders, keeping its uniforms and state', () => {
    const { gl, renderer, uniforms, program } = setup()
    const old = program.program
    renderer.currentProgram = program.id

    expect(program.setShaders({ fragment: 'f2' })).toBe(true)
    expect(gl.deleteProgram).toHaveBeenCalledWith(old)
    expect(program.program).not.toBe(old)
    expect(program.linked).toBe(true)
    expect(program.uniforms).toBe(uniforms)
    expect(program.depthTest).toBe(false)
    expect(program.vertex).toBe('gl_Position v1')
    expect(program.fragment).toBe('f2')
    // So the next use binds the new program
    expect(renderer.currentProgram).toBe(-1)
    expect(sources(gl.shaderSource).slice(-2)).toEqual(['gl_Position v1', 'f2'])
  })

  it('drops the old uniform locations from the renderer’s cache', () => {
    const { renderer, program } = setup()
    const [oldLocation] = [...program.uniformLocations.values()]
    renderer.state.uniformLocations.set(oldLocation, 1)

    program.setShaders({ fragment: 'f2' })
    expect(renderer.state.uniformLocations.has(oldLocation)).toBe(false)
    const [newLocation] = [...program.uniformLocations.values()]
    expect(newLocation).not.toBe(oldLocation)
  })

  it('keeps the working program when the new one fails to link', () => {
    const { gl, link, program } = setup()
    const old = program.program
    const locations = program.uniformLocations
    const order = program.attributeOrder
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(gl.deleteProgram).mockClear()

    link.fails = true
    expect(program.setShaders({ fragment: 'broken' })).toBe(false)
    expect(program.program).toBe(old)
    expect(program.linked).toBe(true)
    expect(program.uniformLocations).toBe(locations)
    expect(program.attributeOrder).toBe(order)
    expect(program.fragment).toBe('f1')
    // The failed program is thrown away, not the working one
    // (By identity: the mock's programs are all equal empty objects)
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1)
    expect(vi.mocked(gl.deleteProgram).mock.calls[0][0]).not.toBe(old)
    warn.mockRestore()
  })

  it('recompiles the new shaders after a lost context', () => {
    const { gl, program } = setup()
    program.setShaders({ vertex: 'gl_Position v2' })
    vi.mocked(gl.shaderSource).mockClear()

    const canvas = gl.canvas as unknown as EventTarget
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(sources(gl.shaderSource)).toEqual(['gl_Position v2', 'f1'])
  })
})
