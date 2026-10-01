import { beforeEach, describe, expect, it } from 'vitest'

import { Uniform } from '../src/core/Uniform'
import { Program } from '../src/core/Program'
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
