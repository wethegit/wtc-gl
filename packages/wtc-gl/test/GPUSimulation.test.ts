import { describe, expect, it, vi, type Mock } from 'vitest'

import { GPUSimulation } from '../src/recipes/GPUSimulation'
import { createMockRenderer } from './mockGL'

const step = '#version 300 es\nvoid main() {}'

function setup(
  options: Partial<ConstructorParameters<typeof GPUSimulation>[1]> = {}
) {
  const { gl, renderer } = createMockRenderer()
  const sim = new GPUSimulation(gl, { fragment: step, ...options })
  return { gl, renderer, sim }
}

describe('GPUSimulation', () => {
  it('keeps one float texture per state, unfiltered and without depth', () => {
    const { gl, sim } = setup({ size: [4, 2], state: ['position', 'velocity'] })
    expect(sim.size).toEqual([4, 2])
    expect(sim.count).toBe(8)
    const { position, velocity } = sim.textures
    expect(position).toBeDefined()
    expect(velocity).not.toBe(position)
    for (const texture of [position, velocity]) {
      expect(texture.width).toBe(4)
      expect(texture.height).toBe(2)
      expect(texture.internalFormat).toBe(gl.RGBA32F)
      expect(texture.minFilter).toBe(gl.NEAREST)
    }
    expect(sim.uniforms.b_position.value).toBe(position)
    expect(sim.uniforms.b_velocity.value).toBe(velocity)
    expect(sim.uniforms.u_resolution.value).toEqual([4, 2])
  })

  it('writes the starting state into each texture', () => {
    const { sim } = setup({
      size: 2,
      state: ['position', 'velocity'],
      initial: (i, x, y) => ({ position: [x, y, i, 1], velocity: [i] })
    })
    const position = sim.textures.position.data as Float32Array
    const velocity = sim.textures.velocity.data as Float32Array
    // Item 3 is at texel (1, 1)
    expect(Array.from(position.subarray(12, 16))).toEqual([1, 1, 3, 1])
    expect(Array.from(velocity.subarray(12, 16))).toEqual([3, 0, 0, 0])
  })

  it('takes a plain vec4 for a single state, or arrays by name', () => {
    const one = setup({ size: 1, initial: () => [1, 2, 3, 4] }).sim
    expect(Array.from(one.textures.state.data as Float32Array)).toEqual([
      1, 2, 3, 4
    ])
    const data = new Float32Array([5, 6, 7, 8])
    const named = setup({ size: 1, initial: { state: data } }).sim
    expect(Array.from(named.textures.state.data as Float32Array)).toEqual([
      5, 6, 7, 8
    ])
  })

  it('steps into the other target, then reads from it', () => {
    const { renderer, sim } = setup({ size: 2 })
    const render = vi.spyOn(renderer, 'render')
    const before = sim.textures.state
    sim.step(0.5)
    expect(render).toHaveBeenCalledTimes(1)
    const { target, clear } = render.mock.calls[0][0]
    expect(clear).toBe(false)
    expect(target?.textures[0]).not.toBe(before)
    // The written state is now the one read
    expect(sim.textures.state).toBe(target?.textures[0])
    expect(sim.uniforms.b_state.value).toBe(sim.textures.state)
    expect(sim.uniforms.u_delta.value).toBe(0.5)
    sim.step(0.25)
    expect(sim.uniforms.u_time.value).toBe(0.75)
    expect(sim.textures.state).toBe(before)
  })

  it('gives each item a reference to its texel centre', () => {
    const { sim } = setup({ size: [4, 2] })
    expect(Array.from(sim.references.subarray(0, 2))).toEqual([0.125, 0.25])
    // Item 5 is at column 1, row 1
    expect(Array.from(sim.references.subarray(10, 12))).toEqual([0.375, 0.75])
  })

  it('makes a points mesh that reads the state', () => {
    const { gl, sim } = setup({ size: 3, state: ['position'] })
    const points = sim.points({ vertex: 'v', fragment: 'f' })
    expect(points.mode).toBe(gl.POINTS)
    expect(points.frustumCulled).toBe(false)
    expect(points.geometry.attributes.reference.data).toBe(sim.references)
    expect(points.geometry.attributes.position.count).toBe(9)
    expect(points.program.uniforms.b_position).toBe(sim.uniforms.b_position)
  })

  it('has between 1 and 4 states', () => {
    expect(() => setup({ state: ['a', 'b', 'c', 'd', 'e'] })).toThrow()
    expect(() => setup({ state: [] })).toThrow()
  })

  it('makes new state when resized, and frees it all on remove', () => {
    const { gl, sim } = setup({ size: 2 })
    const old = sim.textures.state
    sim.resize(3)
    expect(sim.count).toBe(9)
    expect(sim.textures.state).not.toBe(old)
    expect(gl.deleteTexture).toHaveBeenCalledWith(old.texture)

    sim.points({ vertex: 'v', fragment: 'f' })
    ;(gl.deleteProgram as Mock).mockClear()
    sim.remove()
    // The step program and the points program
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2)
  })
})
