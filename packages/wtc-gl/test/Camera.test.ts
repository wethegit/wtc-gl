import { describe, expect, it } from 'vitest'
import { Mat4, Vec3 } from 'wtc-math'

import { Camera } from '../src/core/Camera'
import { Mesh } from '../src/core/Mesh'
import { Program } from '../src/core/Program'
import { Box } from '../src/geometry/Box'
import { createMockRenderer } from './mockGL'

const fields = (m: Mat4) => [
  m.a11, m.a12, m.a13, m.a14,
  m.a21, m.a22, m.a23, m.a24,
  m.a31, m.a32, m.a33, m.a34,
  m.a41, m.a42, m.a43, m.a44
] // prettier-ignore

const expectMatrix = (actual: Mat4, expected: Mat4) => {
  const a = fields(actual)
  fields(expected).forEach((v, i) => expect(a[i]).toBeCloseTo(v, 10))
}

const expectVec = (
  actual: Vec3,
  x: number,
  y: number,
  z: number,
  digits = 6
) => {
  expect(actual.x).toBeCloseTo(x, digits)
  expect(actual.y).toBeCloseTo(y, digits)
  expect(actual.z).toBeCloseTo(z, digits)
}

/** A perspective camera at (0, 0, 10) looking down -z. */
function perspectiveCamera() {
  const camera = new Camera({ fov: 45, aspect: 1, near: 1, far: 100 })
  camera.position.z = 10
  camera.updateMatrixWorld()
  return camera
}

describe('Camera.updateProjectionMatrix', () => {
  it('rebuilds a perspective projection from the current fields', () => {
    const camera = perspectiveCamera()
    camera.fov = 90
    camera.aspect = 2
    camera.updateProjectionMatrix()
    expectMatrix(
      camera.projectionMatrix,
      Mat4.perspective(Math.PI / 2, 2, 1, 100)
    )
  })

  it('rebuilds an orthographic projection, including zoom', () => {
    const camera = new Camera({ left: -2, right: 2, top: 1, bottom: -1 })
    camera.zoom = 2
    camera.updateProjectionMatrix()
    expectMatrix(
      camera.projectionMatrix,
      Mat4.ortho(-1, 1, -0.5, 0.5, camera.near, camera.far)
    )
  })

  it('keeps the projectionMatrix reference', () => {
    const camera = perspectiveCamera()
    const before = camera.projectionMatrix
    camera.fov = 60
    camera.updateProjectionMatrix()
    camera.perspective({ aspect: 3 })
    camera.orthographic({ left: -1, right: 1, top: 1, bottom: -1 })
    expect(camera.projectionMatrix).toBe(before)
  })

  it('refreshes projectionViewMatrix without updateMatrixWorld', () => {
    const camera = perspectiveCamera()
    camera.fov = 90
    camera.updateProjectionMatrix()
    expectMatrix(
      camera.projectionViewMatrix,
      camera.projectionMatrix.multiplyNew(camera.viewMatrix)
    )
  })

  it('is what perspective() uses, so it refreshes projectionViewMatrix too', () => {
    const camera = perspectiveCamera()
    camera.perspective({ aspect: 2 })
    expectMatrix(
      camera.projectionMatrix,
      Mat4.perspective(Math.PI / 4, 2, 1, 100)
    )
    expectMatrix(
      camera.projectionViewMatrix,
      camera.projectionMatrix.multiplyNew(camera.viewMatrix)
    )
  })
})

describe('Camera.project', () => {
  it('maps the view axis to the centre, with near at -1 and far at 1', () => {
    const camera = perspectiveCamera()
    expectVec(camera.project(new Vec3(0, 0, 9)), 0, 0, -1)
    expectVec(camera.project(new Vec3(0, 0, -90)), 0, 0, 1)
  })

  it('maps the orthographic edges to ±1', () => {
    const camera = new Camera({ left: -2, right: 2, top: 1, bottom: -1 })
    camera.updateMatrixWorld()
    expect(camera.project(new Vec3(2, 1, -5)).x).toBeCloseTo(1)
    expect(camera.project(new Vec3(-2, -1, -5)).y).toBeCloseTo(-1)
  })

  it('writes to out and leaves the input alone', () => {
    const camera = perspectiveCamera()
    const input = new Vec3(1, 2, 3)
    const out = new Vec3()
    expect(camera.project(input, out)).toBe(out)
    expectVec(input, 1, 2, 3)
    expect(out.z).not.toBe(3)
  })

  it('projects in place by default', () => {
    const camera = perspectiveCamera()
    const v = new Vec3(0, 0, 9)
    expect(camera.project(v)).toBe(v)
    expectVec(v, 0, 0, -1)
  })

  it('puts points behind the camera past z = 1', () => {
    const camera = perspectiveCamera()
    expect(camera.project(new Vec3(0, 0, 15)).z).toBeGreaterThan(1)
  })
})

describe('Camera.unproject', () => {
  const points = [
    new Vec3(0, 0, 0),
    new Vec3(1.5, -2, 3),
    new Vec3(-4, 0.5, -20)
  ]

  it('inverts project for a moved and rotated perspective camera', () => {
    const camera = new Camera({ fov: 60, aspect: 1.5, near: 0.5, far: 200 })
    camera.position.reset(6, 4, 12)
    camera.lookAt(new Vec3(-1, 0, 0))
    camera.updateMatrixWorld()
    for (const p of points) {
      const round = camera.unproject(camera.project(p.clone()))
      expectVec(round, p.x, p.y, p.z, 4)
    }
  })

  it('inverts project for a moved and rotated orthographic camera', () => {
    const camera = new Camera({ left: -10, right: 10, top: 8, bottom: -8 })
    camera.position.reset(-3, 5, 30)
    camera.lookAt(new Vec3(0, 0, 0))
    camera.updateMatrixWorld()
    for (const p of points) {
      const round = camera.unproject(camera.project(p.clone()))
      expectVec(round, p.x, p.y, p.z, 4)
    }
  })

  it('puts the NDC corners at z = -1 on the near plane', () => {
    const camera = perspectiveCamera()
    const half = Math.tan(Math.PI / 8) // near = 1, so half-height = tan(fov/2)
    expectVec(camera.unproject(new Vec3(1, 1, -1)), half, half, 9)
    expectVec(camera.unproject(new Vec3(-1, -1, -1)), -half, -half, 9)
  })

  it('writes to out and leaves the input alone', () => {
    const camera = perspectiveCamera()
    const input = new Vec3(0, 0, -1)
    const out = new Vec3()
    expect(camera.unproject(input, out)).toBe(out)
    expectVec(input, 0, 0, -1)
    expectVec(out, 0, 0, 9)
  })
})

describe('Camera.frustumIntersects with a world matrix', () => {
  function setup() {
    const { gl } = createMockRenderer()
    const mesh = new Mesh(gl, {
      geometry: new Box(gl),
      program: new Program(gl, { vertex: '', fragment: '' })
    })
    const camera = perspectiveCamera()
    camera.updateFrustum()
    return { mesh, camera }
  }

  const translation = (x: number, scale = 1) => {
    const m = new Mat4()
    m.a11 = m.a22 = m.a33 = scale
    m.a41 = x
    return m
  }

  it('uses the node’s own world matrix by default', () => {
    const { mesh, camera } = setup()
    mesh.updateMatrixWorld()
    expect(camera.frustumIntersects(mesh)).toBe(true)
    mesh.position.x = 1000
    mesh.updateMatrixWorld()
    expect(camera.frustumIntersects(mesh)).toBe(false)
  })

  it('culls an in-view mesh against an out-of-view override', () => {
    const { mesh, camera } = setup()
    mesh.updateMatrixWorld()
    expect(camera.frustumIntersects(mesh, translation(1000))).toBe(false)
  })

  it('keeps an out-of-view mesh against an in-view override', () => {
    const { mesh, camera } = setup()
    mesh.position.x = 1000
    mesh.updateMatrixWorld()
    expect(camera.frustumIntersects(mesh, translation(0))).toBe(true)
  })

  it('scales the bounds by the override', () => {
    const { mesh, camera } = setup()
    // About 4.1 is the half-width at the mesh's depth, so x = 20 is outside
    expect(camera.frustumIntersects(mesh, translation(20))).toBe(false)
    expect(camera.frustumIntersects(mesh, translation(20, 40))).toBe(true)
  })
})
