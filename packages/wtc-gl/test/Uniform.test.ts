import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Uniform } from '../src/core/Uniform'
import { Program } from '../src/core/Program'
import { Texture } from '../src/core/Texture'
import type { WTCGLActiveInfo } from '../src/types'
import { createMockRenderer, type MockGL } from './mockGL'

describe('Uniform caching', () => {
  let gl: MockGL

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
  })

  it('only uploads a scalar when it changes', () => {
    const u = new Uniform({ name: 'a', value: 1, kind: 'float' })
    const loc = {}

    u.setUniform(gl, gl.FLOAT, loc)
    u.setUniform(gl, gl.FLOAT, loc)
    expect(gl.uniform1f).toHaveBeenCalledTimes(1)

    u.value = 2
    u.setUniform(gl, gl.FLOAT, loc)
    expect(gl.uniform1f).toHaveBeenCalledTimes(2)
    expect(gl.uniform1f).toHaveBeenLastCalledWith(loc, 2)
  })

  it('caches arrays by copy, so changes made in place are uploaded', () => {
    const value = [0, 0, 0]
    const u = new Uniform({ name: 'v', value, kind: 'float_vec3' })
    const loc = {}

    u.setUniform(gl, gl.FLOAT_VEC3, loc)
    u.setUniform(gl, gl.FLOAT_VEC3, loc)
    expect(gl.uniform3fv).toHaveBeenCalledTimes(1)

    value[1] = 5
    u.setUniform(gl, gl.FLOAT_VEC3, loc)
    expect(gl.uniform3fv).toHaveBeenCalledTimes(2)
    expect(gl.uniform3fv).toHaveBeenLastCalledWith(loc, [0, 5, 0])
  })

  it('uploads typed arrays changed in place', () => {
    const value = new Float32Array(16)
    const u = new Uniform({ name: 'm', value, kind: 'mat4' })
    const loc = {}

    u.setUniform(gl, gl.FLOAT_MAT4, loc)
    u.setUniform(gl, gl.FLOAT_MAT4, loc)
    expect(gl.uniformMatrix4fv).toHaveBeenCalledTimes(1)

    value[0] = 1
    u.setUniform(gl, gl.FLOAT_MAT4, loc)
    expect(gl.uniformMatrix4fv).toHaveBeenCalledTimes(2)
  })

  it('uploads again when an array changes length', () => {
    const u = new Uniform({ name: 'v', value: [1, 2], kind: 'float_vec2' })
    const loc = {}

    u.setUniform(gl, gl.FLOAT_VEC2, loc)
    u.value = [1, 2, 3]
    u.setUniform(gl, gl.FLOAT_VEC3, loc)
    expect(gl.uniform2fv).toHaveBeenCalledTimes(1)
    expect(gl.uniform3fv).toHaveBeenCalledTimes(1)
  })

  it('caches each location separately', () => {
    const u = new Uniform({ name: 'a', value: 1, kind: 'float' })

    u.setUniform(gl, gl.FLOAT, {})
    u.setUniform(gl, gl.FLOAT, {})
    expect(gl.uniform1f).toHaveBeenCalledTimes(2)
  })

  it('sends floats and float arrays to the right setter', () => {
    const loc = {}
    new Uniform({ value: 0.5, kind: 'float' }).setUniform(gl, gl.FLOAT, loc)
    expect(gl.uniform1f).toHaveBeenCalledWith(loc, 0.5)

    const arr = [0.1, 0.2]
    new Uniform({ value: arr, kind: 'float' }).setUniform(gl, gl.FLOAT, {})
    expect(gl.uniform1fv).toHaveBeenCalledTimes(1)
  })

  it('sends ints, bools and samplers through uniform1i', () => {
    for (const type of [gl.INT, gl.BOOL, gl.SAMPLER_2D]) {
      new Uniform({ value: 3, kind: 'int' }).setUniform(gl, type, {})
    }
    expect(gl.uniform1i).toHaveBeenCalledTimes(3)
  })

  it('removes a program’s entries from the cache, leaving others', () => {
    const vertex = 'void main(){}'
    const fragment = 'void main(){}'
    const a = new Program(gl, { vertex, fragment })
    const b = new Program(gl, { vertex, fragment })
    const info = { type: gl.FLOAT } as WebGLActiveInfo
    const locA = {}
    const locB = {}
    a.uniformLocations.set(info, locA)
    b.uniformLocations.set(info, locB)

    const u = new Uniform({ value: 1, kind: 'float' })
    u.setUniform(gl, gl.FLOAT, locA)
    u.setUniform(gl, gl.FLOAT, locB)

    a.remove()

    const cache = gl.renderer.state.uniformLocations
    expect(cache.has(locA)).toBe(false)
    expect(cache.has(locB)).toBe(true)
    expect(a.uniformLocations.size).toBe(0)
  })
})

describe('Uniform kind checks', () => {
  let gl: MockGL
  let program: Program
  let warn: ReturnType<typeof vi.spyOn>

  const info = (type: number) => ({ type }) as WTCGLActiveInfo

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
    program = { gl, textureUnit: -1 } as unknown as Program
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it('binds a texture as a texture even when kind is wrong, and warns once', () => {
    const texture = new Texture(gl)
    const update = vi.spyOn(texture, 'update')
    const u = new Uniform({ name: 't', value: texture })
    const loc = {}

    u.bind(program, loc, info(gl.SAMPLER_2D))
    expect(update).toHaveBeenCalledWith(0)
    expect(gl.uniform1i).toHaveBeenCalledWith(loc, 0)
    expect(gl.uniform1i).not.toHaveBeenCalledWith(loc, texture)

    program.textureUnit = -1
    u.bind(program, loc, info(gl.SAMPLER_2D))
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain("kind 'float_vec2'")
  })

  it('binds a texture array as texture units', () => {
    const textures = [new Texture(gl), new Texture(gl)]
    const u = new Uniform({ name: 't', value: textures, kind: 'texture_array' })
    const loc = {}

    u.bind(program, loc, info(gl.SAMPLER_2D))
    expect(gl.uniform1iv).toHaveBeenCalledWith(loc, [0, 1])
    expect(warn).not.toHaveBeenCalled()
  })

  it('skips a texture bound to a non-sampler uniform', () => {
    const u = new Uniform({
      name: 't',
      value: new Texture(gl),
      kind: 'texture'
    })

    u.bind(program, {}, info(gl.FLOAT_VEC2))
    expect(gl.uniform2fv).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('binds textures to WebGL2 sampler types', () => {
    const volume = new Texture(gl, { target: gl.TEXTURE_3D })
    const layers = new Texture(gl, { target: gl.TEXTURE_2D_ARRAY })
    vi.spyOn(volume, 'update').mockImplementation(() => {})
    vi.spyOn(layers, 'update').mockImplementation(() => {})
    const a = {}
    const b = {}

    new Uniform({ name: 'v', value: volume, kind: 'texture' }).bind(
      program,
      a,
      info(gl.SAMPLER_3D)
    )
    new Uniform({ name: 'l', value: layers, kind: 'texture' }).bind(
      program,
      b,
      info(gl.SAMPLER_2D_ARRAY)
    )
    expect(gl.uniform1i).toHaveBeenCalledWith(a, 0)
    expect(gl.uniform1i).toHaveBeenCalledWith(b, 1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('skips a texture whose target does not match the sampler', () => {
    const cube = new Texture(gl, { target: gl.TEXTURE_CUBE_MAP })
    const update = vi.spyOn(cube, 'update')
    const u = new Uniform({ name: 'c', value: cube, kind: 'texture' })

    u.bind(program, {}, info(gl.SAMPLER_2D))
    expect(update).not.toHaveBeenCalled()
    expect(gl.uniform1i).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain("doesn't match")
  })

  it('checks the target of every texture in an array', () => {
    const textures = [
      new Texture(gl),
      new Texture(gl, { target: gl.TEXTURE_CUBE_MAP })
    ]
    const u = new Uniform({ name: 't', value: textures, kind: 'texture_array' })

    u.bind(program, {}, info(gl.SAMPLER_2D))
    expect(gl.uniform1iv).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('skips a non-texture value bound to a sampler', () => {
    const u = new Uniform({ name: 'f', value: new Float32Array(2) })
    const loc = {}

    u.bind(program, loc, info(gl.SAMPLER_2D))
    u.bind(program, loc, info(gl.SAMPLER_2D))
    expect(gl.uniform1i).not.toHaveBeenCalled()
    expect(gl.uniform1iv).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('accepts null, texture units and unit arrays on a sampler without warning', () => {
    new Uniform({ name: 'a', value: null!, kind: 'texture' }).bind(
      program,
      {},
      info(gl.SAMPLER_2D)
    )
    new Uniform({ name: 'b', value: 2, kind: 'int' }).bind(
      program,
      {},
      info(gl.SAMPLER_2D)
    )
    new Uniform({ name: 'c', value: [0, 1], kind: 'int' }).bind(
      program,
      {},
      info(gl.SAMPLER_2D)
    )
    expect(gl.uniform1i).toHaveBeenCalledTimes(2)
    expect(gl.uniform1iv).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })
})
