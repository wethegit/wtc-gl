import { describe, expect, it } from 'vitest'
import { Mat4, Vec3 } from 'wtc-math'

import { Camera } from '../src/core/Camera'
import { InstancedMesh } from '../src/core/InstancedMesh'
import { Mesh } from '../src/core/Mesh'
import { Obj } from '../src/core/Object'
import { Program } from '../src/core/Program'
import { Box } from '../src/geometry/Box'
import { Geometry } from '../src/geometry/Geometry'
import { GeometryAttribute } from '../src/geometry/GeometryAttribute'
import { Plane } from '../src/geometry/Plane'
import { Sphere } from '../src/geometry/Sphere'
import { Raycast } from '../src/interaction/Raycast'
import { createMockRenderer, type MockGL } from './mockGL'

const expectVec = (
  v: { x: number; y: number; z?: number },
  x: number,
  y: number,
  z?: number,
  digits = 5
) => {
  expect(v.x).toBeCloseTo(x, digits)
  expect(v.y).toBeCloseTo(y, digits)
  if (z !== undefined) expect(v.z!).toBeCloseTo(z, digits)
}

const program = (gl: MockGL, cullFace?: number) =>
  new Program(gl, { vertex: '', fragment: '', cullFace })

/** A mesh with up-to-date world matrices. */
function mesh(gl: MockGL, geometry: Geometry, cullFace?: number) {
  const m = new Mesh(gl, { geometry, program: program(gl, cullFace) })
  m.updateMatrixWorld()
  return m
}

/** A ray from (x, y, 10) looking down -z. */
function down(x = 0, y = 0) {
  const raycast = new Raycast()
  raycast.set(new Vec3(x, y, 10), new Vec3(0, 0, -1))
  return raycast
}

describe('Raycast', () => {
  describe('castMouse', () => {
    it('casts from a perspective camera through the centre', () => {
      const camera = new Camera({ fov: 45, aspect: 1, near: 0.1, far: 100 })
      camera.position.z = 10
      camera.updateMatrixWorld()
      const raycast = new Raycast()
      raycast.castMouse(camera, [0, 0])
      expectVec(raycast.origin, 0, 0, 10)
      expectVec(raycast.direction, 0, 0, -1)
    })

    it('points along the frustum edges at the edges of the screen', () => {
      const camera = new Camera({ fov: 90, aspect: 1, near: 0.1, far: 100 })
      camera.updateMatrixWorld()
      const raycast = new Raycast()
      raycast.castMouse(camera, [1, 0])
      const s = Math.SQRT1_2
      expectVec(raycast.direction, s, 0, -s)
    })

    it('casts parallel rays from an orthographic camera', () => {
      const camera = new Camera({ left: -2, right: 2, top: 1, bottom: -1 })
      camera.position.z = 10
      camera.updateMatrixWorld()
      const raycast = new Raycast()
      raycast.castMouse(camera, [1, 1])
      expectVec(raycast.origin, 2, 1, 10 - camera.near)
      expectVec(raycast.direction, 0, 0, -1)
    })

    it('normalises the direction it is given', () => {
      const raycast = new Raycast()
      raycast.set(new Vec3(), new Vec3(0, 3, 4))
      expectVec(raycast.direction, 0, 0.6, 0.8)
    })
  })

  describe('shapes', () => {
    it('meets a plane in front, and not one behind or parallel', () => {
      const raycast = down(1, 2)
      const hit = raycast.intersectPlane(new Vec3(0, 0, 1), new Vec3(0, 0, -3))
      expectVec(hit!, 1, 2, -3)
      expect(
        raycast.intersectPlane(new Vec3(0, 0, 1), new Vec3(0, 0, 20))
      ).toBeNull()
      expect(
        raycast.intersectPlane(new Vec3(1, 0, 0), new Vec3(5, 0, 0))
      ).toBeNull()
    })

    it('writes the plane hit to out', () => {
      const out = new Vec3()
      expect(down().intersectPlane(new Vec3(0, 0, 1), new Vec3(), out)).toBe(
        out
      )
    })

    it('gives the distance to a sphere or box, or Infinity', () => {
      const raycast = down()
      expect(raycast.intersectSphere(new Vec3(0, 0, 0), 2)).toBeCloseTo(8)
      expect(raycast.intersectSphere(new Vec3(5, 0, 0), 2)).toBe(Infinity)
      expect(
        raycast.intersectBox(new Vec3(-1, -1, -1), new Vec3(1, 1, 1))
      ).toBeCloseTo(9)
      expect(raycast.intersectBox(new Vec3(2, 2, -1), new Vec3(3, 3, 1))).toBe(
        Infinity
      )
    })

    it('is at distance 0 from a shape it starts inside', () => {
      const raycast = new Raycast()
      raycast.set(new Vec3(), new Vec3(0, 0, -1))
      expect(raycast.intersectSphere(new Vec3(), 1)).toBe(0)
      expect(
        raycast.intersectBox(new Vec3(-1, -1, -1), new Vec3(1, 1, 1))
      ).toBe(0)
    })
  })

  describe('intersectBounds', () => {
    it('hits a moved and scaled mesh, nearest first', () => {
      const { gl } = createMockRenderer()
      const near = mesh(gl, new Box(gl))
      const far = new Mesh(gl, { geometry: new Box(gl), program: program(gl) })
      far.position.z = -5
      far.scale.x = far.scale.y = far.scale.z = 2
      far.updateMatrixWorld()
      const hits = down(0.3).intersectBounds([far, near])
      expect(hits.map((h) => h.mesh)).toEqual([near, far])
      expect(hits[0].distance).toBeCloseTo(9.5)
      expect(hits[1].distance).toBeCloseTo(14)
      expectVec(hits[1].point, 0.3, 0, -4)
      expectVec(hits[1].localPoint, 0.15, 0, 0.5)
      // Wide enough for the far box only
      expect(
        down(0.8)
          .intersectBounds([far, near])
          .map((h) => h.mesh)
      ).toEqual([far])
    })

    it('misses a mesh to the side, unless padded', () => {
      const { gl } = createMockRenderer()
      const box = mesh(gl, new Box(gl))
      expect(down(0.6).intersectBounds(box)).toHaveLength(0)
      expect(down(0.6).intersectBounds(box, { padding: 0.2 })).toHaveLength(1)
    })

    it('walks a scene, skipping what is hidden', () => {
      const { gl } = createMockRenderer()
      const scene = new Obj()
      const group = new Obj()
      const shown = new Mesh(gl, {
        geometry: new Box(gl),
        program: program(gl)
      })
      const hidden = new Mesh(gl, {
        geometry: new Box(gl),
        program: program(gl)
      })
      const hiddenChild = new Mesh(gl, {
        geometry: new Box(gl),
        program: program(gl)
      })
      shown.setParent(scene)
      hidden.setParent(scene)
      group.setParent(scene)
      hiddenChild.setParent(group)
      hidden.visible = false
      group.visible = false
      scene.updateMatrixWorld()
      expect(
        down()
          .intersectBounds(scene)
          .map((h) => h.mesh)
      ).toEqual([shown])
    })
  })

  describe('intersectMeshes', () => {
    it('finds the point, face, uv and normal on a plane', () => {
      const { gl } = createMockRenderer()
      const plane = mesh(gl, new Plane(gl))
      const [hit, ...rest] = down(0.25, -0.25).intersectMeshes(plane)
      expect(rest).toHaveLength(0)
      expect(hit.mesh).toBe(plane)
      expect(hit.distance).toBeCloseTo(10)
      expectVec(hit.point, 0.25, -0.25, 0)
      expectVec(hit.localPoint, 0.25, -0.25, 0)
      expectVec(hit.uv!, 0.75, 0.25)
      expectVec(hit.normal, 0, 0, 1)
      expectVec(hit.faceNormal, 0, 0, 1)
      expect([0, 1]).toContain(hit.faceIndex)
    })

    it('works in world space on a moved, rotated, scaled mesh', () => {
      const { gl } = createMockRenderer()
      const plane = new Mesh(gl, {
        geometry: new Plane(gl),
        program: program(gl)
      })
      // Facing +x, at x = 2, twice the size
      plane.rotation.y = Math.PI / 2
      plane.updateRotation()
      plane.position.x = 2
      plane.scale.x = plane.scale.y = plane.scale.z = 2
      plane.updateMatrixWorld()
      const raycast = new Raycast()
      raycast.set(new Vec3(10, 0.5, 0), new Vec3(-1, 0, 0))
      const [hit] = raycast.intersectMeshes(plane)
      expect(hit.distance).toBeCloseTo(8)
      expectVec(hit.point, 2, 0.5, 0)
      expectVec(hit.localPoint, 0, 0.25, 0)
      expectVec(hit.normal, 1, 0, 0)
    })

    it('misses back faces when the program culls them', () => {
      const { gl } = createMockRenderer()
      const raycast = new Raycast()
      raycast.set(new Vec3(0, 0, -10), new Vec3(0, 0, 1))
      expect(
        raycast.intersectMeshes(mesh(gl, new Plane(gl), gl.BACK))
      ).toHaveLength(0)
      const both = raycast.intersectMeshes(mesh(gl, new Plane(gl), 0))
      expect(both).toHaveLength(1)
      expectVec(both[0].faceNormal, 0, 0, 1)
    })

    it('takes face culling from the options over the program', () => {
      const { gl } = createMockRenderer()
      const raycast = new Raycast()
      raycast.set(new Vec3(0, 0, -10), new Vec3(0, 0, 1))
      const culled = mesh(gl, new Plane(gl), gl.BACK)
      expect(raycast.intersectMeshes(culled, { cullFace: 0 })).toHaveLength(1)
      expect(
        down().intersectMeshes(culled, { cullFace: gl.FRONT })
      ).toHaveLength(0)
    })

    it('misses when the bounds are hit but no triangle is', () => {
      const { gl } = createMockRenderer()
      const sphere = mesh(gl, new Sphere(gl, { radius: 1 }))
      // Inside the bounding box's corner, outside the sphere
      expect(down(0.9, 0.9).intersectBounds(sphere)).toHaveLength(1)
      expect(down(0.9, 0.9).intersectMeshes(sphere)).toHaveLength(0)
    })

    it('reads geometry without an index, within its draw range', () => {
      const { gl } = createMockRenderer()
      const geometry = new Plane(gl).toNonIndexed()
      const plane = mesh(gl, geometry)
      expect(down(0.25, -0.25).intersectMeshes(plane)).toHaveLength(1)
      // Only the first triangle, which doesn't cover both of these points
      geometry.setDrawRange(0, 3)
      const hits = [
        down(0.25, -0.25).intersectMeshes(plane).length,
        down(-0.25, 0.25).intersectMeshes(plane).length
      ]
      expect(hits.sort()).toEqual([0, 1])
    })

    it('stops at the max distance', () => {
      const { gl } = createMockRenderer()
      const plane = mesh(gl, new Plane(gl))
      expect(down().intersectMeshes(plane, { maxDistance: 5 })).toHaveLength(0)
      expect(down().intersectMeshes(plane, { maxDistance: 11 })).toHaveLength(1)
    })

    it('skips lines and positions it can’t read', () => {
      const { gl } = createMockRenderer()
      const lines = new Mesh(gl, {
        geometry: new Plane(gl),
        program: program(gl),
        mode: gl.LINES
      })
      lines.updateMatrixWorld()
      const external = mesh(
        gl,
        new Geometry(gl, {
          position: new GeometryAttribute({
            size: 3,
            data: new Float32Array(9),
            buffer: {} as WebGLBuffer,
            external: true
          })
        })
      )
      expect(down().intersectMeshes([lines, external])).toHaveLength(0)
      expect(down().intersectBounds([lines, external])).toHaveLength(0)
    })

    it('reports which instance was hit', () => {
      const { gl } = createMockRenderer()
      const instances = new InstancedMesh(gl, {
        geometry: new Plane(gl),
        program: program(gl),
        count: 3
      })
      const m = new Mat4()
      for (let i = 0; i < 3; i++) {
        m.a41 = i * 3
        instances.setMatrixAt(i, m)
      }
      instances.updateMatrixWorld()
      const [hit, ...rest] = down(3.25, 0.25).intersectMeshes(instances)
      expect(rest).toHaveLength(0)
      expect(hit.instanceId).toBe(1)
      expectVec(hit.point, 3.25, 0.25, 0)
      expectVec(hit.localPoint, 0.25, 0.25, 0)
      expect(down(3.25).intersectBounds(instances)[0].instanceId).toBe(1)

      instances.count = 1
      expect(down(3.25, 0.25).intersectMeshes(instances)).toHaveLength(0)
    })
  })
})
