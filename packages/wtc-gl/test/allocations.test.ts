import { describe, expect, it } from 'vitest'

import { Camera } from '../src/core/Camera'
import { Mesh } from '../src/core/Mesh'
import { Obj } from '../src/core/Object'
import { Program } from '../src/core/Program'
import { Box } from '../src/geometry/Box'
import { createMockRenderer } from './mockGL'

// Node built-ins, loaded by name since the package has no Node types
const load = (name: string) => import(/* @vite-ignore */ name)

const MESHES = 1000
const noop = () => {}

/**
 * Build a scene of animated meshes on a mock context whose GL calls are
 * no-ops, so only the library's own allocations are measured.
 */
function createScene() {
  const { gl, renderer } = createMockRenderer()
  const geometry = new Box(gl)
  const program = new Program(gl, { vertex: '', fragment: '' })
  const scene = new Obj()
  const meshes: Mesh[] = []
  for (let i = 0; i < MESHES; i++) {
    const mesh = new Mesh(gl, { geometry, program })
    mesh.position.x = (i % 40) - 20
    mesh.position.z = Math.floor(i / 40) - 12
    mesh.setParent(scene)
    meshes.push(mesh)
  }
  const camera = new Camera({ fov: 60, aspect: 1, near: 0.1, far: 100 })
  camera.position.z = 40
  camera.position.y = 10

  // Uniform locations, so the matrix uniforms are actually uploaded
  const locations = new Map<string, object>()
  program.uniformLocations.clear()
  for (const name of [
    'u_modelMatrix',
    'u_viewMatrix',
    'u_modelViewMatrix',
    'u_normalMatrix',
    'u_projectionMatrix',
    'u_cameraPosition'
  ]) {
    const location = {}
    locations.set(name, location)
    program.uniformLocations.set(
      {
        name,
        type:
          name === 'u_normalMatrix'
            ? 35675
            : name === 'u_cameraPosition'
              ? 35665
              : 35676
      } as never,
      location
    )
  }

  let t = 0
  const frame = () => {
    t += 0.016
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i]
      mesh.position.y = Math.sin(t + i)
      mesh.rotation.y = t + i
      mesh.updateRotation()
    }
    renderer.render({ scene, camera })
  }

  // Warm up (first-frame setup allocates), then make every GL call a no-op so
  // the mock's call recording doesn't count
  frame()
  frame()
  const target = gl as unknown as Record<string, unknown>
  for (const key of Object.keys(target)) {
    if (typeof target[key] === 'function') target[key] = noop
  }
  frame()

  return frame
}

type ProfileNode = {
  callFrame: { url: string }
  selfSize: number
  children: ProfileNode[]
}

/**
 * Average bytes the library allocates per frame, from V8's sampling heap
 * profiler (including objects already collected). heapUsed deltas aren't
 * reliable here: forcing a GC also discards compiled code, which is then
 * rebuilt during the measured frame. Allocations made by the mock context
 * itself are left out.
 */
async function bytesPerFrame(frame: () => void, frames = 20) {
  // Let the JIT optimise the frame first, as it would in a running app
  for (let i = 0; i < 300; i++) frame()

  const inspector = await load('node:inspector')
  const session = new inspector.Session()
  session.connect()
  const post = <T>(method: string, params = {}) =>
    new Promise<T>((resolve, reject) =>
      session.post(method, params, (error: Error | null, result: T) =>
        error ? reject(error) : resolve(result)
      )
    )

  await post('HeapProfiler.enable')
  await post('HeapProfiler.startSampling', {
    samplingInterval: 64,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true
  })
  for (let i = 0; i < frames; i++) frame()
  const { profile } = await post<{ profile: { head: ProfileNode } }>(
    'HeapProfiler.stopSampling'
  )
  session.disconnect()

  let bytes = 0
  const walk = (node: ProfileNode, inMock: boolean) => {
    const mock = inMock || node.callFrame.url.includes('mockGL')
    const inspector = node.callFrame.url.startsWith('node:inspector')
    if (!mock && !inspector) bytes += node.selfSize
    for (const child of node.children) walk(child, mock)
  }
  walk(profile.head, false)
  return bytes / frames
}

describe('Per-frame allocations', () => {
  it(`stay small for ${MESHES} animated meshes`, async () => {
    const frame = createScene()
    const bytes = await bytesPerFrame(frame)
    console.info(
      `[allocations] ${MESHES} meshes: ${(bytes / 1024).toFixed(1)} KB/frame, ${(bytes / MESHES).toFixed(0)} B/mesh`
    )
    // Was ~7.8 KB per mesh before the matrix and render-list work
    expect(bytes / MESHES).toBeLessThan(400)
  })
})
