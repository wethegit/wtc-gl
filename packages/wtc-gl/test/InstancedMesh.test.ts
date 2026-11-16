import { describe, expect, it, type Mock } from 'vitest'
import { Mat4, Vec3 } from 'wtc-math'

import { Camera } from '../src/core/Camera'
import { InstancedMesh } from '../src/core/InstancedMesh'
import { Program } from '../src/core/Program'
import { Box } from '../src/geometry/Box'
import { createMockRenderer } from './mockGL'

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

const translation = (x: number, y = 0, z = 0, scale = 1) => {
  const m = new Mat4()
  m.a11 = m.a22 = m.a33 = scale
  m.a41 = x
  m.a42 = y
  m.a43 = z
  return m
}

/** A camera at (0, 0, 10) looking down -z, with its matrices up to date. */
function camera() {
  const c = new Camera({ fov: 45, aspect: 1, near: 0.1, far: 100 })
  c.position.z = 10
  c.updateMatrixWorld()
  return c
}

function setup(count = 4, options = {}) {
  const { gl } = createMockRenderer()
  const source = new Box(gl)
  const mesh = new InstancedMesh(gl, {
    geometry: source,
    program: new Program(gl, { vertex: '', fragment: '' }),
    count,
    ...options
  })
  mesh.updateMatrixWorld()
  return { gl, source, mesh }
}

const gpu = (mesh: InstancedMesh, name: string) =>
  mesh.geometry.attributes[name]

describe('InstancedMesh', () => {
  describe('its geometry', () => {
    it('reads every source attribute from the source’s buffers', () => {
      const { source, mesh } = setup()
      for (const name of Object.keys(source.attributes)) {
        const own = mesh.geometry.attributes[name]
        expect(own, name).toBeDefined()
        expect(own.external, name).toBe(true)
        expect(own.buffer, name).toBe(source.attributes[name].buffer)
        expect(own.size, name).toBe(source.attributes[name].size)
      }
      expect(mesh.geometry).not.toBe(source)
    })

    it('never deletes the source’s buffers', () => {
      const { gl, source, mesh } = setup()
      const buffers = Object.values(source.attributes).map((a) => a.buffer)
      mesh.geometry.remove()
      const deleted = (gl.deleteBuffer as unknown as Mock).mock.calls.map(
        (c) => c[0]
      )
      for (const buffer of buffers) expect(deleted).not.toContain(buffer)
    })

    it('adds per-instance matrix and colour attributes', () => {
      const { mesh } = setup(3)
      const matrix = gpu(mesh, 'instanceMatrix')
      const colour = gpu(mesh, 'instanceColour')
      expect(matrix.size).toBe(16)
      expect(matrix.divisor).toBe(1)
      expect(colour.size).toBe(3)
      expect(colour.divisor).toBe(1)
      expect(mesh.geometry.isInstanced).toBe(true)
    })

    it('follows the source after update', () => {
      const { source, mesh } = setup()
      source.setIndex(new Uint16Array([0, 1, 2]))
      mesh.update()
      expect(mesh.geometry.attributes.index.buffer).toBe(
        source.attributes.index.buffer
      )
      expect(mesh.geometry.attributes.index.count).toBe(3)
    })
  })

  describe('instances', () => {
    it('start as identity matrices and white', () => {
      const { mesh } = setup(2)
      expect(Array.from(mesh.matrices)).toEqual([...IDENTITY, ...IDENTITY])
      expect(Array.from(mesh.colours)).toEqual([1, 1, 1, 1, 1, 1])
      expect(mesh.capacity).toBe(2)
      expect(mesh.count).toBe(2)
    })

    it('set and get matrices and colours', () => {
      const { mesh } = setup(3)
      mesh.setMatrixAt(1, translation(1, 2, 3, 2))
      mesh.setColourAt(2, [0.5, 0.25, 0])
      const out = new Mat4()
      mesh.getMatrixAt(1, out)
      expect([out.a11, out.a41, out.a42, out.a43]).toEqual([2, 1, 2, 3])
      expect(Array.from(mesh.getColourAt(2, [0, 0, 0]))).toEqual([0.5, 0.25, 0])
      expect(Array.from(mesh.matrices.slice(0, 16))).toEqual(IDENTITY)
    })

    it('clamps the count to the capacity', () => {
      const { mesh } = setup(3)
      mesh.count = 10
      expect(mesh.count).toBe(3)
      mesh.count = -1
      expect(mesh.count).toBe(0)
    })
  })

  describe('without culling', () => {
    it('draws every instance straight from its arrays', () => {
      const { mesh } = setup(3, { frustumCulled: false })
      mesh.setMatrixAt(0, translation(1000))
      mesh.draw({ camera: camera() })
      expect(mesh.geometry.instancedCount).toBe(3)
      expect(gpu(mesh, 'instanceMatrix').data).toBe(mesh.matrices)
      expect(gpu(mesh, 'instanceColour').data).toBe(mesh.colours)
    })

    it('draws only the first count instances', () => {
      const { mesh } = setup(3, { frustumCulled: false })
      mesh.count = 2
      mesh.draw({ camera: camera() })
      expect(mesh.geometry.instancedCount).toBe(2)
    })
  })

  describe('cull', () => {
    it('draws only the instances in view, packed to the front', () => {
      const { mesh } = setup(2)
      mesh.setMatrixAt(0, translation(1000))
      mesh.setMatrixAt(1, translation(1, 2, 0))
      mesh.setColourAt(1, [0, 1, 0])
      mesh.cull(camera())
      expect(mesh.geometry.instancedCount).toBe(1)
      const packed = gpu(mesh, 'instanceMatrix').data
      expect(Array.from(packed.slice(12, 15))).toEqual([1, 2, 0])
      expect(Array.from(gpu(mesh, 'instanceColour').data.slice(0, 3))).toEqual([
        0, 1, 0
      ])
    })

    it('includes the mesh’s own transform', () => {
      const { mesh } = setup(1)
      mesh.position.x = 1000
      mesh.updateMatrixWorld()
      mesh.cull(camera())
      expect(mesh.geometry.instancedCount).toBe(0)
    })

    it('grows the bounds with the instance’s scale', () => {
      const { mesh } = setup(1)
      // Outside the view at a scale of 1, inside at a scale of 40
      mesh.setMatrixAt(0, translation(20))
      mesh.cull(camera())
      expect(mesh.geometry.instancedCount).toBe(0)
      mesh.setMatrixAt(0, translation(20, 0, 0, 40))
      mesh.cull(camera())
      expect(mesh.geometry.instancedCount).toBe(1)
    })

    it('only uploads again when something changed', () => {
      const { mesh } = setup(2)
      const c = camera()
      const matrix = gpu(mesh, 'instanceMatrix')
      mesh.cull(c)
      expect(matrix.needsUpdate).toBe(true)
      matrix.needsUpdate = false

      mesh.cull(c)
      expect(matrix.needsUpdate).toBe(false)

      mesh.setMatrixAt(0, translation(0.5))
      mesh.cull(c)
      expect(matrix.needsUpdate).toBe(true)
    })

    it('stops at the count', () => {
      const { mesh } = setup(3)
      mesh.count = 1
      mesh.cull(camera())
      expect(mesh.geometry.instancedCount).toBe(1)
    })

    it('uses the cull camera rather than the drawing one', () => {
      const { mesh } = setup(1)
      const away = new Camera({ fov: 45, aspect: 1, near: 0.1, far: 100 })
      away.position.z = -10
      // Looking away from the origin
      away.lookAt(new Vec3(0, 0, -20))
      away.updateMatrixWorld()
      mesh.cullCamera = away
      mesh.draw({ camera: camera() })
      expect(mesh.geometry.instancedCount).toBe(0)
      mesh.cullCamera = null
      mesh.draw({ camera: camera() })
      expect(mesh.geometry.instancedCount).toBe(1)
    })
  })
})
