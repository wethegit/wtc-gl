import { beforeAll, describe, expect, it, vi } from 'vitest'
import Module from 'manifold-3d'

import { Geometry } from '../src/geometry/Geometry'
import { GeometryAttribute } from '../src/geometry/GeometryAttribute'
import { Box } from '../src/geometry/Box'
import { Sphere } from '../src/geometry/Sphere'
import { Plane } from '../src/geometry/Plane'
import { fromManifold, toManifold } from '../src/geometry/manifold'
import { createMockRenderer } from './mockGL'

type Wasm = Awaited<ReturnType<typeof Module>>
let wasm: Wasm

beforeAll(async () => {
  wasm = await Module()
  wasm.setup()
})

const setup = () => createMockRenderer().gl

const values = (geometry: Geometry, name: string, i: number) => {
  const { data, size } = geometry.attributes[name]
  return Array.from(data.slice(i * size, (i + 1) * size))
}

const vertexCount = (geometry: Geometry) =>
  geometry.attributes.position.data.length / 3

describe('toManifold and fromManifold', () => {
  it('round-trips a box', () => {
    const gl = setup()
    const box = toManifold(wasm, new Box(gl))
    expect(box.volume()).toBeCloseTo(1)

    const geometry = fromManifold(gl, box)
    expect(Object.keys(geometry.attributes).sort()).toEqual([
      'index',
      'normal',
      'position',
      'uv'
    ])
    expect(geometry.attributes.index.data.length).toBe(36)
    for (let i = 0; i < vertexCount(geometry); i++) {
      expect(Math.hypot(...values(geometry, 'normal', i))).toBeCloseTo(1)
    }
    box.delete()
  })

  it('cuts a sphere out of a box, with the faces facing the right way', () => {
    const gl = setup()
    const properties = { normal: 3, uv: 2, colour: 3 }
    const box = toManifold(wasm, new Box(gl), { properties })
    const sphere = toManifold(
      wasm,
      new Sphere(gl, { radius: 0.4, widthSegments: 32, heightSegments: 16 }),
      { properties, fill: { colour: [1, 0, 0] } }
    )
    const hole = sphere.translate([0.5, 0, 0])
    const cut = box.subtract(hole)
    // Half of the sphere is inside the box
    const sphereVolume = sphere.volume()
    expect(cut.volume()).toBeCloseTo(1 - sphereVolume / 2, 2)

    const geometry = fromManifold(gl, cut, { properties })
    let cavity = 0
    for (let i = 0; i < vertexCount(geometry); i++) {
      const [x, y, z] = values(geometry, 'position', i)
      const [nx, ny, nz] = values(geometry, 'normal', i)
      const colour = values(geometry, 'colour', i)
      const fromSphere = colour[1] === 0
      if (fromSphere) {
        cavity++
        // Facing into the cavity, towards the sphere's centre
        const d = [0.5 - x, -y, -z]
        expect(d[0] * nx + d[1] * ny + d[2] * nz).toBeGreaterThan(0)
        expect(colour).toEqual([1, 0, 0])
      } else {
        // The box's own faces keep white
        expect(colour).toEqual([1, 1, 1])
      }
    }
    expect(cavity).toBeGreaterThan(0)
    for (const m of [box, sphere, hole, cut]) m.delete()
  })

  it('rotates normals with the manifold', () => {
    const gl = setup()
    const box = toManifold(wasm, new Box(gl))
    const turned = box.rotate([0, 0, 90])
    const geometry = fromManifold(gl, turned)
    const index = geometry.attributes.index.data
    const p = (i: number) => values(geometry, 'position', i)
    // Every vertex normal points the same way as its triangle
    for (let t = 0; t < index.length; t += 3) {
      const [a, b, c] = [p(index[t]), p(index[t + 1]), p(index[t + 2])]
      const u = b.map((v, k) => v - a[k])
      const w = c.map((v, k) => v - a[k])
      const face = [
        u[1] * w[2] - u[2] * w[1],
        u[2] * w[0] - u[0] * w[2],
        u[0] * w[1] - u[1] * w[0]
      ]
      const n = values(geometry, 'normal', index[t])
      expect(face[0] * n[0] + face[1] * n[1] + face[2] * n[2]).toBeGreaterThan(
        0
      )
    }
    box.delete()
    turned.delete()
  })

  it('welds non-indexed geometry into a solid', () => {
    const gl = setup()
    const box = toManifold(wasm, new Box(gl).toNonIndexed())
    expect(box.volume()).toBeCloseTo(1)
    box.delete()
  })

  it('computes normals the geometry is missing', () => {
    const gl = setup()
    const source = new Box(gl)
    const geometry = new Geometry(gl, {
      position: source.attributes.position,
      index: source.attributes.index
    })
    const box = toManifold(wasm, geometry)
    const out = fromManifold(gl, box)
    // Flat faces: every normal is along an axis
    for (let i = 0; i < vertexCount(out); i++) {
      const n = values(out, 'normal', i).map(Math.abs).sort()
      expect(n[0]).toBeCloseTo(0)
      expect(n[2]).toBeCloseTo(1)
    }
    box.delete()
  })

  it('pads and truncates attributes to the asked size', () => {
    const gl = setup()
    const box = new Box(gl)
    const count = box.attributes.position.count
    box.addAttribute(
      'colour',
      new GeometryAttribute({
        size: 3,
        data: new Float32Array(count * 3).fill(0.5)
      })
    )
    const properties = { normal: 3, colour: 4 }
    const manifold = toManifold(wasm, box, { properties })
    const out = fromManifold(gl, manifold, { properties })
    expect(values(out, 'colour', 0)).toEqual([0.5, 0.5, 0.5, 1])
    manifold.delete()

    const two = toManifold(wasm, box, { properties: { colour: 2 } })
    const short = fromManifold(gl, two, { properties: { colour: 2 } })
    expect(values(short, 'colour', 0)).toEqual([0.5, 0.5])
    two.delete()
  })

  it('throws for a geometry that isn’t a closed solid', () => {
    const gl = setup()
    expect(() => toManifold(wasm, new Plane(gl))).toThrow(
      "The geometry isn't a closed solid (Not manifold)"
    )
  })

  it('frees a manifold that reports an error', () => {
    const gl = setup()
    const remove = vi.fn()
    const fake = {
      Mesh: class {
        merge() {
          return false
        }
      },
      Manifold: class {
        status() {
          return 'NonFiniteVertex'
        }
        delete = remove
      }
    } as unknown as Wasm
    expect(() => toManifold(fake, new Box(gl))).toThrow(/NonFiniteVertex/)
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('leaves the manifold for the caller to delete', () => {
    const gl = setup()
    const box = toManifold(wasm, new Box(gl))
    const remove = vi.spyOn(box, 'delete')
    fromManifold(gl, box)
    expect(remove).not.toHaveBeenCalled()
    expect(box.volume()).toBeCloseTo(1)
    box.delete()
  })

  it('makes an empty geometry from an empty manifold', () => {
    const gl = setup()
    const a = toManifold(wasm, new Box(gl))
    const b = a.translate([5, 0, 0])
    const none = a.intersect(b)
    const out = fromManifold(gl, none)
    expect(vertexCount(out)).toBe(0)
    expect(out.attributes.index.data.length).toBe(0)
    for (const m of [a, b, none]) m.delete()
  })
})
