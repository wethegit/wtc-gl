import { describe, expect, it, type Mock } from 'vitest'

import { Mesh } from '../src/core/Mesh'
import { Program } from '../src/core/Program'
import { Geometry } from '../src/geometry/Geometry'
import { GeometryAttribute } from '../src/geometry/GeometryAttribute'
import { Plane } from '../src/geometry/Plane'
import { AxesHelper } from '../src/helpers/AxesHelper'
import { FaceNormalsHelper } from '../src/helpers/FaceNormalsHelper'
import { GridHelper } from '../src/helpers/GridHelper'
import { NormalProgram } from '../src/helpers/NormalProgram'
import { VertexNormalsHelper } from '../src/helpers/VertexNormalsHelper'
import { WireMesh } from '../src/helpers/WireMesh'
import { createMockRenderer, type MockGL } from './mockGL'

/** The vertex and fragment sources of the last program compiled on `gl`. */
function sources(gl: MockGL) {
  const shaderSource = gl.shaderSource as unknown as Mock
  const calls = shaderSource.mock.calls.map((c) => c[1] as string)
  const last = (match: (s: string) => boolean) =>
    calls.filter(match)[calls.filter(match).length - 1]
  return {
    vertex: last((s) => s.includes('gl_Position')),
    fragment: last((s) => !s.includes('gl_Position'))
  }
}

/** Every line of an indexed LINES geometry, as sorted vertex pairs. */
function edges(geometry: Geometry) {
  const index = geometry.attributes.index.data
  const out: string[] = []
  for (let i = 0; i < index.length; i += 2) {
    const a = index[i]
    const b = index[i + 1]
    out.push(a < b ? `${a}-${b}` : `${b}-${a}`)
  }
  return out
}

const close = (v: number) => expect.closeTo(v, 5)

const data = (geometry: Geometry, name: string) =>
  Array.from(geometry.attributes[name].data)

const program = (gl: MockGL) =>
  new Program(gl, { vertex: 'gl_Position', fragment: '' })

/** One triangle, (0, 0, 0), (1, 0, 0), (0, 1, 0), facing +z. */
function triangle(gl: MockGL, indexed: boolean) {
  const attributes: Record<string, GeometryAttribute> = {
    position: new GeometryAttribute({
      size: 3,
      data: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    }),
    normal: new GeometryAttribute({
      size: 3,
      data: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])
    })
  }
  if (indexed) {
    attributes.index = new GeometryAttribute({
      data: new Uint16Array([0, 1, 2])
    })
  }
  return new Geometry(gl, attributes)
}

describe('WireMesh', () => {
  it('draws each edge of an indexed geometry once', () => {
    const { gl } = createMockRenderer()
    const wire = new WireMesh(gl, { geometry: new Plane(gl) })
    const lines = edges(wire.geometry)
    expect(lines).toHaveLength(5)
    expect(new Set(lines).size).toBe(5)
    expect(wire.mode).toBe(gl.LINES)
  })

  it('draws three edges per triangle without an index', () => {
    const { gl } = createMockRenderer()
    const source = new Plane(gl).toNonIndexed()
    const wire = new WireMesh(gl, { geometry: source })
    // Two triangles that share no vertices
    expect(edges(wire.geometry)).toHaveLength(2 * 3)
  })

  it('uses a 32-bit index above 65,535 vertices', () => {
    const { gl } = createMockRenderer()
    const count = 70000 - (70000 % 3)
    const source = new Geometry(gl, {
      position: new GeometryAttribute({
        size: 3,
        data: new Float32Array(count * 3)
      })
    })
    const wire = new WireMesh(gl, { geometry: source })
    expect(wire.geometry.attributes.index.data).toBeInstanceOf(Uint32Array)
    const small = new WireMesh(gl, { geometry: new Plane(gl) })
    expect(small.geometry.attributes.index.data).toBeInstanceOf(Uint16Array)
  })

  it('shares the source’s position buffer without owning it', () => {
    const { gl } = createMockRenderer()
    const source = new Plane(gl)
    const wire = new WireMesh(gl, { geometry: source })
    const position = wire.geometry.attributes.position
    expect(position.external).toBe(true)
    expect(position.buffer).toBe(source.attributes.position.buffer)
    expect(position.buffer).not.toBeNull()
  })

  it('copies the source’s bounds', () => {
    const { gl } = createMockRenderer()
    const source = new Plane(gl, { width: 4, height: 2 })
    const wire = new WireMesh(gl, { geometry: source })
    expect(wire.geometry.bounds).toEqual(source.bounds)
    expect(wire.geometry.bounds!.radius).toBeGreaterThan(0)
  })

  it('rebuilds its edges on update', () => {
    const { gl } = createMockRenderer()
    const source = new Plane(gl)
    const wire = new WireMesh(gl, { geometry: source })
    source.setIndex(new Uint16Array([0, 1, 2]))
    wire.update()
    expect(edges(wire.geometry)).toHaveLength(3)
  })

  it('sets its colour and opacity', () => {
    const { gl } = createMockRenderer()
    const wire = new WireMesh(gl, {
      geometry: new Plane(gl),
      colour: [1, 0, 0],
      opacity: 0.5
    })
    expect(wire.program.uniforms.u_colour.value).toEqual([1, 0, 0])
    expect(wire.program.uniforms.u_opacity.value).toBe(0.5)
    expect(wire.program.transparent).toBe(true)
  })
})

describe('AxesHelper', () => {
  it('draws three coloured lines from the origin', () => {
    const { gl } = createMockRenderer()
    const axes = new AxesHelper(gl, { size: 2 })
    expect(axes.mode).toBe(gl.LINES)
    expect(data(axes.geometry, 'position')).toEqual([
      0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 2
    ])
    const colour = data(axes.geometry, 'colour')
    // Both ends of each axis share a colour, led by its own channel: x red,
    // y green, z blue
    for (let axis = 0; axis < 3; axis++) {
      const start = colour.slice(axis * 6, axis * 6 + 3)
      expect(colour.slice(axis * 6 + 3, axis * 6 + 6)).toEqual(start)
      expect(Math.max(...start)).toBe(start[axis])
    }
  })

  it('extends through the origin when symmetric', () => {
    const { gl } = createMockRenderer()
    const axes = new AxesHelper(gl, { symmetric: true })
    const position = data(axes.geometry, 'position')
    expect(position).toHaveLength(6 * 3)
    expect(position.slice(0, 6)).toEqual([-1, 0, 0, 1, 0, 0])
  })

  it('takes its colours from the options', () => {
    const { gl } = createMockRenderer()
    const axes = new AxesHelper(gl, { yColour: [0.1, 0.2, 0.3] })
    expect(data(axes.geometry, 'colour').slice(6, 9)).toEqual(
      [0.1, 0.2, 0.3].map(close)
    )
  })

  it('uses vertex colours', () => {
    const { gl } = createMockRenderer()
    new AxesHelper(gl)
    expect(sources(gl).vertex).toContain('#define VERTEX_COLOURS\n')
  })
})

describe('GridHelper', () => {
  it('draws divisions + 1 lines each way on the XZ plane', () => {
    const { gl } = createMockRenderer()
    const grid = new GridHelper(gl, { size: 4, divisions: 4 })
    const position = data(grid.geometry, 'position')
    expect(position.length / 6).toBe(5 * 2)
    for (let i = 1; i < position.length; i += 3) expect(position[i]).toBe(0)
    expect(Math.max(...position)).toBe(2)
    expect(Math.min(...position)).toBe(-2)
  })

  it('gives the centre lines their own colour', () => {
    const { gl } = createMockRenderer()
    const grid = new GridHelper(gl, {
      size: 4,
      divisions: 4,
      colour: [1, 1, 1],
      centreColour: [0, 0, 0]
    })
    const colour = data(grid.geometry, 'colour')
    // Two lines (four vertices) are black
    const black = colour.filter((_, i) => i % 3 === 0).filter((v) => v === 0)
    expect(black).toHaveLength(4)
  })

  it('has no centre line with an odd number of divisions', () => {
    const { gl } = createMockRenderer()
    const grid = new GridHelper(gl, {
      divisions: 3,
      colour: [1, 1, 1],
      centreColour: [0, 0, 0]
    })
    expect(data(grid.geometry, 'colour').every((v) => v === 1)).toBe(true)
  })
})

describe('VertexNormalsHelper', () => {
  it('draws a line per vertex along its normal', () => {
    const { gl } = createMockRenderer()
    const mesh = new Mesh(gl, {
      geometry: triangle(gl, true),
      program: program(gl)
    })
    const helper = new VertexNormalsHelper(mesh, { size: 0.5 })
    const { geometry } = helper
    expect(helper.mode).toBe(gl.LINES)
    expect(data(geometry, 'position')).toEqual([
      0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0
    ])
    expect(data(geometry, 'normal')).toEqual(
      new Array(6).fill([0, 0, 1]).flat()
    )
    expect(data(geometry, 'side')).toEqual([0, 1, 0, 1, 0, 1])
    expect(helper.program.uniforms.u_size.value).toBe(0.5)
  })

  it('follows the mesh it shows', () => {
    const { gl } = createMockRenderer()
    const mesh = new Mesh(gl, {
      geometry: triangle(gl, false),
      program: program(gl)
    })
    expect(new VertexNormalsHelper(mesh).parent).toBe(mesh)
  })

  it('needs normals', () => {
    const { gl } = createMockRenderer()
    const geometry = new Geometry(gl, {
      position: new GeometryAttribute({ size: 3, data: new Float32Array(9) })
    })
    const mesh = new Mesh(gl, { geometry, program: program(gl) })
    expect(() => new VertexNormalsHelper(mesh)).toThrow(/normal/)
  })

  it('re-reads the geometry on update', () => {
    const { gl } = createMockRenderer()
    const mesh = new Mesh(gl, {
      geometry: triangle(gl, true),
      program: program(gl)
    })
    const helper = new VertexNormalsHelper(mesh)
    mesh.geometry = new Plane(gl)
    helper.update()
    expect(data(helper.geometry, 'side')).toHaveLength(4 * 2)
  })
})

describe('FaceNormalsHelper', () => {
  it.each([true, false])(
    'draws a line from each triangle’s centre (indexed: %s)',
    (indexed) => {
      const { gl } = createMockRenderer()
      const mesh = new Mesh(gl, {
        geometry: triangle(gl, indexed),
        program: program(gl)
      })
      const helper = new FaceNormalsHelper(mesh)
      const position = data(helper.geometry, 'position')
      const third = 1 / 3
      expect(position).toEqual([third, third, 0, third, third, 0].map(close))
      expect(data(helper.geometry, 'normal')).toEqual([0, 0, 1, 0, 0, 1])
      expect(data(helper.geometry, 'side')).toEqual([0, 1])
      expect(helper.parent).toBe(mesh)
    }
  )

  it('draws one line per triangle', () => {
    const { gl } = createMockRenderer()
    const mesh = new Mesh(gl, { geometry: new Plane(gl), program: program(gl) })
    expect(data(new FaceNormalsHelper(mesh).geometry, 'side')).toHaveLength(4)
  })
})

describe('NormalProgram', () => {
  it('is in view space with no defines by default', () => {
    const { gl } = createMockRenderer()
    new NormalProgram(gl)
    const { vertex, fragment } = sources(gl)
    expect(vertex).not.toContain('#define')
    expect(fragment).not.toContain('#define')
  })

  it.each([
    [{ space: 'world' }, 'WORLD_SPACE'],
    [{ flatShading: true }, 'FLAT_SHADING'],
    [{ doubleSided: true }, 'DOUBLE_SIDED'],
    [{ instanced: true }, 'INSTANCED']
  ] as const)('%o adds #define %s', (options, define) => {
    const { gl } = createMockRenderer()
    new NormalProgram(gl, options)
    const { vertex, fragment } = sources(gl)
    expect(vertex).toContain(`#define ${define}\n`)
    expect(fragment).toContain(`#define ${define}\n`)
  })

  it('turns face culling off when double sided', () => {
    const { gl } = createMockRenderer()
    expect(new NormalProgram(gl).cullFace).toBe(gl.BACK)
    expect(new NormalProgram(gl, { doubleSided: true }).cullFace).toBe(0)
  })

  it('recompiles when an option is changed', () => {
    const { gl } = createMockRenderer()
    const program = new NormalProgram(gl)
    const before = program.program
    program.space = 'world'
    expect(program.space).toBe('world')
    expect(program.program).not.toBe(before)
    expect(sources(gl).fragment).toContain('#define WORLD_SPACE\n')

    program.flatShading = true
    program.instanced = true
    expect(sources(gl).vertex).toContain('#define FLAT_SHADING\n')
    expect(sources(gl).vertex).toContain('#define INSTANCED\n')

    program.doubleSided = true
    expect(program.cullFace).toBe(0)
    expect(sources(gl).fragment).toContain('#define DOUBLE_SIDED\n')
  })

  it('doesn’t recompile for an unchanged option', () => {
    const { gl } = createMockRenderer()
    const program = new NormalProgram(gl, { space: 'world' })
    const calls = (gl.shaderSource as unknown as Mock).mock.calls.length
    program.space = 'world'
    program.flatShading = false
    expect((gl.shaderSource as unknown as Mock).mock.calls.length).toBe(calls)
  })
})
