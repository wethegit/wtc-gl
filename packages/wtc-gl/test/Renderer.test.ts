import { beforeEach, describe, expect, it } from 'vitest'

import { Obj } from '../src/core/Object'
import { Mesh } from '../src/core/Mesh'
import { Program, type ProgramOptions } from '../src/core/Program'
import { Geometry } from '../src/geometry/Geometry'
import type { Renderer } from '../src/core/Renderer'
import { createMockRenderer, type MockGL } from './mockGL'

describe('Renderer.getRenderList', () => {
  let gl: MockGL
  let renderer: Renderer
  let geometry: Geometry
  let scene: Obj

  const program = (options: Partial<ProgramOptions> = {}) =>
    new Program(gl, { vertex: '', fragment: '', ...options })

  const mesh = (p: Program, renderOrder = 0) => {
    const m = new Mesh(gl, { geometry, program: p, renderOrder })
    scene.addChild(m)
    return m
  }

  const list = (sort = true) =>
    renderer.getRenderList({ scene, frustumCull: false, sort })

  beforeEach(() => {
    ;({ gl, renderer } = createMockRenderer())
    geometry = new Geometry(gl, {})
    scene = new Obj()
  })

  it('orders opaque, then transparent, then UI', () => {
    const ui = mesh(program({ transparent: true, depthTest: false }))
    const transparent = mesh(program({ transparent: true }))
    const opaque = mesh(program())

    expect(list()).toEqual([opaque, transparent, ui])
  })

  it('draws transparent meshes without depth testing', () => {
    // Regression: these used to fall out of every list and never render
    const ui = mesh(program({ transparent: true, depthTest: false }))
    expect(list()).toContain(ui)
  })

  it('sorts by render order within a group', () => {
    const p = program()
    const late = mesh(p, 3)
    const early = mesh(p, 1)
    const middle = mesh(p, 2)

    expect(list()).toEqual([early, middle, late])
  })

  it('groups opaque meshes by program', () => {
    const p1 = program()
    const p2 = program()
    const a = mesh(p2)
    const b = mesh(p1)
    const c = mesh(p2)
    const d = mesh(p1)

    const result = list()
    // Meshes sharing a program are drawn together, saving program switches
    expect(result.slice(0, 2).every((m) => m.program === p1)).toBe(true)
    expect(result.slice(2).every((m) => m.program === p2)).toBe(true)
    expect(result).toHaveLength(4)
    expect(new Set(result)).toEqual(new Set([a, b, c, d]))
  })

  it('sorts transparent meshes back to front', () => {
    const p = program({ transparent: true })
    const near = mesh(p)
    const far = mesh(p)
    near.zDepth = 0.2
    far.zDepth = 0.8

    // No camera, so getRenderList keeps the zDepth values set here
    expect(list()).toEqual([far, near])
  })

  it('skips invisible nodes and their children', () => {
    const p = program()
    const visible = mesh(p)
    const hidden = mesh(p)
    const child = new Mesh(gl, { geometry, program: p })
    hidden.addChild(child)
    hidden.visible = false

    expect(list()).toEqual([visible])
  })

  it('keeps scene order when sorting is off', () => {
    const ui = mesh(program({ transparent: true, depthTest: false }))
    const opaque = mesh(program())

    expect(list(false)).toEqual([ui, opaque])
  })
})
