import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Program, type ProgramOptions } from '../src/core/Program'
import type { Renderer } from '../src/core/Renderer'
import { createMockRenderer, type MockGL } from './mockGL'

describe('Program stencil and colour-write options', () => {
  let gl: MockGL
  let renderer: Renderer

  const program = (options: Partial<ProgramOptions> = {}) =>
    new Program(gl, { vertex: 'v', fragment: 'f', ...options })

  beforeEach(() => {
    ;({ gl, renderer } = createMockRenderer())
  })

  it('leaves stencil and colour state alone when not set', () => {
    program().applyState()
    expect(gl.enable).not.toHaveBeenCalledWith(gl.STENCIL_TEST)
    expect(gl.disable).not.toHaveBeenCalledWith(gl.STENCIL_TEST)
    expect(gl.stencilFunc).not.toHaveBeenCalled()
    expect(gl.colorMask).not.toHaveBeenCalled()
  })

  it('applies a stencil test, filling in defaults', () => {
    program({ stencil: { func: gl.EQUAL, ref: 1 } }).applyState()
    expect(gl.enable).toHaveBeenCalledWith(gl.STENCIL_TEST)
    expect(gl.stencilFunc).toHaveBeenCalledWith(gl.EQUAL, 1, 0xff)
    expect(gl.stencilOp).toHaveBeenCalledWith(gl.KEEP, gl.KEEP, gl.KEEP)
    expect(gl.stencilMask).toHaveBeenCalledWith(0xff)
  })

  it('only sends stencil state that changed', () => {
    const write = program({
      stencil: { ref: 1, zpass: gl.REPLACE },
      colourWrite: false
    })
    const read = program({ stencil: { func: gl.EQUAL, ref: 1 } })
    write.applyState()
    vi.mocked(gl.stencilFunc).mockClear()
    vi.mocked(gl.stencilOp).mockClear()
    vi.mocked(gl.stencilMask).mockClear()

    read.applyState()
    expect(gl.stencilFunc).toHaveBeenCalledWith(gl.EQUAL, 1, 0xff)
    expect(gl.stencilOp).toHaveBeenCalledWith(gl.KEEP, gl.KEEP, gl.KEEP)
    expect(gl.stencilMask).not.toHaveBeenCalled()
    expect(gl.colorMask).toHaveBeenLastCalledWith(true, true, true, true)
  })

  it('turns off a stencil test it turned on', () => {
    program({ stencil: { func: gl.EQUAL, ref: 1 } }).applyState()
    program().applyState()
    expect(gl.disable).toHaveBeenCalledWith(gl.STENCIL_TEST)
  })

  it('turns colour writes off and back on', () => {
    program({ colourWrite: false }).applyState()
    expect(gl.colorMask).toHaveBeenLastCalledWith(false, false, false, false)
    expect(renderer.colourWrite).toBe(false)
    program().applyState()
    expect(gl.colorMask).toHaveBeenLastCalledWith(true, true, true, true)
  })

  it('can change the stencil after creation', () => {
    const p = program()
    p.stencil = { func: gl.NOTEQUAL, ref: 2 }
    expect(p.stencil).toMatchObject({ func: gl.NOTEQUAL, ref: 2, mask: 0xff })
    p.stencil = null
    expect(p.stencil).toBe(null)
  })
})
