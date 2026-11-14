import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ParticleSimulation } from '../src/recipes/ParticleSimulation'
import { createMockGL } from './mockGL'

let frames: number

beforeEach(() => {
  frames = 0
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => ++frames)
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Under Node there's no window, so the simulation gets its canvas passed in
function create(options: ConstructorParameters<typeof ParticleSimulation>[0]) {
  const gl = createMockGL()
  const canvas = gl.canvas as unknown as Record<string, unknown>
  canvas.getContext = () => gl
  return new ParticleSimulation({
    ...options,
    rendererProps: { canvas: canvas as unknown as HTMLCanvasElement, dpr: 2 }
  })
}

describe('ParticleSimulation', () => {
  it('gives every particle a reference to the centre of its texel', () => {
    for (const simDimensions of [1, 2, 3]) {
      const sim = create({ textureSize: 4, simDimensions })
      const refs = sim.references
      expect(refs.length).toBe(16 * 2)
      expect([refs[0], refs[1]]).toEqual([0.125, 0.125])
      // Particle 6 is at column 2, row 1
      expect([refs[12], refs[13]]).toEqual([0.625, 0.375])
      expect([refs[30], refs[31]]).toEqual([0.875, 0.875])
      sim.destroy()
    }
  })

  it('starts its clock on the first frame and caps long gaps', () => {
    const sim = create({ textureSize: 2 })
    sim.render(5000)
    expect(sim.u_time.value).toBe(0)
    sim.render(5016)
    expect(sim.u_time.value).toBeCloseTo(16 * 0.00005)
    sim.render(9000)
    expect(sim.u_time.value).toBeCloseTo(66 * 0.00005)
    sim.destroy()
  })

  it('cancels the requested frame when stopped', () => {
    const sim = create({ textureSize: 2 })
    expect(sim.playing).toBe(true)
    sim.playing = false
    expect(cancelAnimationFrame).toHaveBeenCalledWith(frames)
    // Starting again runs one loop
    sim.playing = true
    sim.playing = false
    sim.playing = true
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(2)
    sim.destroy()
  })

  it('gives u_resolution in device pixels without autoResize', () => {
    const sim = create({ textureSize: 2, autoResize: false })
    expect(sim.u_resolution.value).toEqual([1000, 1000])
    sim.destroy()
  })

  it('frees its geometry, program and renderer, keeping a canvas passed in', () => {
    const sim = create({ textureSize: 2 })
    const geometry = vi.spyOn(sim.mesh.geometry, 'remove')
    const program = vi.spyOn(sim.program, 'remove')
    const renderer = vi.spyOn(sim.renderer, 'dispose')
    const canvas = sim.destroy()
    expect(sim.playing).toBe(false)
    expect(geometry).toHaveBeenCalled()
    expect(program).toHaveBeenCalled()
    expect(renderer).toHaveBeenCalled()
    expect(canvas).toBe(sim.gl.canvas)
  })
})
