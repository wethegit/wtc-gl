import { beforeEach, describe, expect, it } from 'vitest'

import { Vec3 } from 'wtc-math'

import { Camera } from '../src/core/Camera'
import { Line } from '../src/core/Line'
import { LineGeometry } from '../src/geometry/LineGeometry'
import { createMockRenderer, type MockGL } from './mockGL'

const data = (geometry: LineGeometry, name: string) =>
  Array.from(geometry.attributes[name].data)

// The xyz of vertex v in a vec3 attribute
const vec3At = (geometry: LineGeometry, name: string, v: number) =>
  data(geometry, name).slice(v * 3, v * 3 + 3)

describe('LineGeometry', () => {
  let gl: MockGL

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
  })

  it('doubles each point, one vertex either side', () => {
    const line = new LineGeometry(gl, { points: [0, 0, 0, 1, 0, 0, 2, 0, 0] })
    expect(line.attributes.position.count).toBe(6)
    expect(data(line, 'side')).toEqual([-1, 1, -1, 1, -1, 1])
    expect(data(line, 'uv')).toEqual([0, 0, 0, 1, 0.5, 0, 0.5, 1, 1, 0, 1, 1])
  })

  it('draws two triangles per segment', () => {
    const line = new LineGeometry(gl, { points: [0, 0, 0, 1, 0, 0, 2, 0, 0] })
    expect(data(line, 'index')).toEqual([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5])
    expect(line.drawRange.count).toBe(12)
  })

  it('mirrors the missing neighbour at open ends', () => {
    const line = new LineGeometry(gl, { points: [0, 0, 0, 1, 2, 0, 3, 3, 0] })
    // first point: prev is p0 - (p1 - p0)
    expect(vec3At(line, 'prev', 0)).toEqual([-1, -2, 0])
    expect(vec3At(line, 'next', 0)).toEqual([1, 2, 0])
    // last point: next is p2 + (p2 - p1)
    expect(vec3At(line, 'prev', 4)).toEqual([1, 2, 0])
    expect(vec3At(line, 'next', 4)).toEqual([5, 4, 0])
  })

  it('wraps a closed line and repeats its first point', () => {
    const line = new LineGeometry(gl, {
      points: [0, 0, 0, 1, 0, 0, 1, 1, 0],
      closed: true
    })
    // 3 points plus the repeat
    expect(line.attributes.position.count).toBe(8)
    expect(vec3At(line, 'prev', 0)).toEqual([1, 1, 0])
    expect(vec3At(line, 'position', 6)).toEqual([0, 0, 0])
    expect(vec3At(line, 'next', 6)).toEqual([1, 0, 0])
    expect(line.drawRange.count).toBe(18)
  })

  it('accumulates the distance along the line', () => {
    const line = new LineGeometry(gl, { points: [0, 0, 0, 3, 4, 0, 3, 4, 2] })
    expect(data(line, 'lineDistance')).toEqual([0, 0, 5, 5, 7, 7])
  })

  it('calls the width callback with t and the point index', () => {
    const calls: [number, number][] = []
    const line = new LineGeometry(gl, {
      points: [0, 0, 0, 1, 0, 0, 2, 0, 0],
      width: (t, i) => {
        calls.push([t, i])
        return 1 - t
      }
    })
    expect(calls).toEqual([
      [0, 0],
      [0.5, 1],
      [1, 2]
    ])
    expect(data(line, 'width')).toEqual([1, 1, 0.5, 0.5, 0, 0])
  })

  it('accepts Vec3 points', () => {
    const line = new LineGeometry(gl, {
      points: [new Vec3(1, 2, 3), new Vec3(4, 5, 6)]
    })
    expect(Array.from(line.points)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('reuses the buffers when the point count is unchanged', () => {
    const line = new LineGeometry(gl, { points: [0, 0, 0, 1, 0, 0] })
    const position = line.attributes.position.data
    line.computeBoundingSphere()

    line.setPoints([0, 0, 0, 5, 0, 0])

    expect(line.attributes.position.data).toBe(position)
    expect(line.attributes.position.needsUpdate).toBe(true)
    expect(vec3At(line, 'position', 2)).toEqual([5, 0, 0])
    // bounds are recomputed on demand
    expect(line.bounds).toBeUndefined()
  })

  it('resizes the attributes, index and draw range for a new count', () => {
    const line = new LineGeometry(gl, { points: [0, 0, 0, 1, 0, 0] })
    line.setPoints([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0])
    expect(line.pointCount).toBe(4)
    expect(line.attributes.position.count).toBe(8)
    expect(line.attributes.index.count).toBe(18)
    expect(line.drawRange.count).toBe(18)
  })

  it('pushes a new head and drops the tail', () => {
    const line = new LineGeometry(gl, { points: [0, 0, 0, 1, 0, 0, 2, 0, 0] })
    line.push([3, 0, 0])
    expect(Array.from(line.points)).toEqual([1, 0, 0, 2, 0, 0, 3, 0, 0])
    expect(vec3At(line, 'position', 4)).toEqual([3, 0, 0])
    // distances restart from the new tail
    expect(data(line, 'lineDistance')).toEqual([0, 0, 1, 1, 2, 2])
  })
})

describe('Line', () => {
  let gl: MockGL

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
  })

  it('builds its geometry and a default program', () => {
    const line = new Line(gl, { points: [0, 0, 0, 1, 0, 0], lineWidth: 6 })
    expect(line.geometry).toBeInstanceOf(LineGeometry)
    expect(line.program.uniforms.u_lineWidth.value).toBe(6)
    // the ribbon's winding flips with direction, so nothing is culled
    expect(line.program.cullFace).toBeFalsy()
  })

  it('updates uniforms through its properties', () => {
    const line = new Line(gl, { points: [0, 0, 0, 1, 0, 0] })
    line.lineWidth = 12
    line.sizeAttenuation = true
    line.dashArray = 0.5
    line.visibility = 0.25
    line.colour = [1, 0, 0]
    expect(line.program.uniforms.u_lineWidth.value).toBe(12)
    expect(line.program.uniforms.u_sizeAttenuation.value).toBe(1)
    expect(line.program.uniforms.u_dashArray.value).toBe(0.5)
    expect(line.program.uniforms.u_visibility.value).toBe(0.25)
    expect(line.program.uniforms.u_colour.value).toEqual([1, 0, 0])
  })

  it('gives an unmapped line a placeholder texture', () => {
    const line = new Line(gl, { points: [0, 0, 0, 1, 0, 0] })
    expect(line.program.uniforms.u_map.value).toBeDefined()
    expect(line.program.uniforms.u_useMap.value).toBe(0)
  })

  it('sets its resolution from the viewport before drawing', () => {
    const line = new Line(gl, { points: [0, 0, 0, 1, 0, 0] })
    gl.renderer.state.viewport.width = 640
    gl.renderer.state.viewport.height = 480
    const camera = new Camera()
    line.beforeRenderCallbacks.forEach((f) => f?.({ mesh: line, camera }))
    expect(
      Array.from(line.program.uniforms.u_resolution.value as Float32Array)
    ).toEqual([640, 480])
  })
})
