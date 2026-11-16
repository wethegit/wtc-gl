import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Camera } from '../src/core/Camera'
import { DollyCamera } from '../src/core/DollyCamera'
import { Mesh } from '../src/core/Mesh'
import { Obj } from '../src/core/Object'
import { Program } from '../src/core/Program'
import { worldBoundingSphere } from '../src/core/bounds'
import { Sphere } from '../src/geometry/Sphere'
import { Lights } from '../src/lighting/Lights'
import { GLTFLoader, type GLTF } from '../src/loaders/GLTFLoader'
import { Stage } from '../src/recipes/Stage'
import { Vec2, Vec3 } from 'wtc-math'
import { createMockGL } from './mockGL'

// A container 800×400, and a window that only needs listeners
const container = {
  clientWidth: 800,
  clientHeight: 400,
  appendChild: vi.fn()
}
let frames = 0

beforeEach(() => {
  frames = 0
  vi.stubGlobal('window', {
    devicePixelRatio: 1,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  })
  vi.stubGlobal('document', { body: {} })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    }
  )
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => ++frames)
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// The stage draws into a mock canvas passed in, as there's no DOM here
function create(options: ConstructorParameters<typeof Stage>[0] = {}) {
  const gl = createMockGL()
  const canvas = gl.canvas as unknown as Record<string, unknown>
  canvas.getContext = () => gl
  return new Stage({
    container: container as unknown as HTMLElement,
    autoplay: false,
    ...options,
    rendererProps: { canvas: canvas as unknown as HTMLCanvasElement, dpr: 1 }
  })
}

// A unit sphere mesh at x
function sphere(stage: Stage, x = 0, radius = 1) {
  const mesh = new Mesh(stage.gl, {
    geometry: new Sphere(stage.gl, { radius }),
    program: new Program(stage.gl, { vertex: '', fragment: '' })
  })
  mesh.position.x = x
  return mesh
}

describe('Stage', () => {
  it('builds an orbit camera, lights and a shadow, sized to its container', () => {
    const stage = create()
    expect(stage.camera).toBeInstanceOf(DollyCamera)
    expect(stage.controls).toBe(stage.camera)
    expect(stage.controls?.enableZoom).toBe(false)
    expect(stage.lights).toBeInstanceOf(Lights)
    expect(stage.shadow?.mapSize).toBe(2048)
    expect(stage.renderer.dimensions.x).toBe(800)
    expect(stage.camera.aspect).toBe(2)
  })

  it('has a fixed camera without controls, and no shadow when asked', () => {
    const lights = new Lights()
    const stage = create({ controls: false, shadow: false, lights })
    expect(stage.camera).toBeInstanceOf(Camera)
    expect(stage.camera).not.toBeInstanceOf(DollyCamera)
    expect(stage.controls).toBe(null)
    expect(stage.shadow).toBe(null)
    expect(stage.lights).toBe(lights)
  })

  it('adds nodes to the scene, casting the shadow unless told not to', () => {
    const stage = create()
    const add = vi.spyOn(stage.shadow!, 'add')
    const a = stage.add(new Obj())
    const b = stage.add(new Obj(), { castShadow: false })
    expect(a.parent).toBe(stage.scene)
    expect(b.parent).toBe(stage.scene)
    // By identity: two empty Objs are deeply equal
    const added = add.mock.calls.map(([node]) => node)
    expect(added.includes(a)).toBe(true)
    expect(added.includes(b)).toBe(false)
  })

  it('frames the camera on a node from the side it was looking', () => {
    for (const controls of [true, false]) {
      const stage = create({ controls, cameraPosition: [0, 0, 10] })
      const mesh = stage.add(sphere(stage, 5))
      stage.fit(mesh, { padding: 1 })
      const target = stage.controls?.target
      if (target) expect([target.x, target.y, target.z]).toEqual([5, 0, 0])
      const { x, y, z } = stage.camera.position
      // Straight back along z, far enough for the sphere to fill the view
      const half = (35 * Math.PI) / 360
      expect(x).toBeCloseTo(5)
      expect(y).toBeCloseTo(0)
      expect(z).toBeCloseTo(1 / Math.sin(half), 4)
      // The shadow covers the sphere too
      expect(stage.shadow?.target.x).toBeCloseTo(5)
      expect(stage.shadow?.size).toBeCloseTo(1)
    }
  })

  it('loads a model with its lights and shadow, then adds and frames it', async () => {
    const stage = create()
    const scene = new Obj()
    scene.addChild(sphere(stage))
    const remove = vi.fn()
    const load = vi
      .spyOn(GLTFLoader, 'load')
      .mockResolvedValue({ scene, remove } as unknown as GLTF)
    const fit = vi.spyOn(stage, 'fit')

    const gltf = await stage.load('island.glb')
    expect(load).toHaveBeenCalledWith(stage.gl, 'island.glb', {
      lights: stage.lights,
      shadow: stage.shadow
    })
    expect(gltf.scene.parent).toBe(stage.scene)
    expect(fit).toHaveBeenCalledWith(scene)

    await stage.load('again.glb', { fit: false })
    expect(fit).toHaveBeenCalledTimes(1)

    stage.destroy()
    expect(remove).toHaveBeenCalledTimes(2)
    load.mockRestore()
  })

  it('renders the shadow, then the scene through the camera', () => {
    const stage = create()
    const calls: string[] = []
    vi.spyOn(stage.shadow!, 'render').mockImplementation(() => {
      calls.push('shadow')
    })
    vi.spyOn(stage.renderer, 'render').mockImplementation(({ camera }) => {
      calls.push(camera === stage.camera ? 'scene' : 'other')
    })
    stage.render()
    expect(calls).toEqual(['shadow', 'scene'])
  })

  it('swaps cameras, switching the orbit controls off and on', () => {
    const stage = create()
    const other = new Camera({ fov: 50 })
    const update = vi.spyOn(stage.controls!, 'update')
    stage.camera = other
    expect(stage.camera).toBe(other)
    expect(other.aspect).toBe(2)
    expect(stage.controls?.enabled).toBe(false)

    // Drawing through the other camera leaves the controls alone
    const render = vi
      .spyOn(stage.renderer, 'render')
      .mockImplementation(() => {})
    stage.render()
    expect(update).not.toHaveBeenCalled()
    expect(render.mock.calls[0][0].camera).toBe(other)

    stage.camera = stage.controls!
    expect(stage.controls?.enabled).toBe(true)
    stage.render()
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('draws an extra view through another camera, into part of the canvas', () => {
    const stage = create()
    const overhead = new Camera()
    const shadow = vi
      .spyOn(stage.shadow!, 'render')
      .mockImplementation(() => {})
    const render = vi
      .spyOn(stage.renderer, 'render')
      .mockImplementation(() => {})
    const viewport = [new Vec2(100, 50), new Vec2(10, 10)] as [Vec2, Vec2]
    stage.render({
      camera: overhead,
      viewport,
      scissor: true,
      clear: true,
      shadow: false
    })
    expect(shadow).not.toHaveBeenCalled()
    expect(render).toHaveBeenCalledWith({
      scene: stage.scene,
      camera: overhead,
      viewport,
      scissor: true,
      clear: true
    })
    // The stage's own camera is unchanged
    expect(stage.camera).toBe(stage.controls)
  })

  it('fits a swapped-in camera, but leaves one inside the scene in place', () => {
    const stage = create()
    const mesh = stage.add(sphere(stage, 5))

    const free = new Camera()
    free.position.reset(5, 0, 3)
    free.lookAt(new Vec3(5, 0, 0))
    stage.camera = free
    stage.fit(mesh, { padding: 1 })
    expect(free.position.x).toBeCloseTo(5)
    expect(free.position.z).toBeCloseTo(
      1 / Math.sin((free.fov * Math.PI) / 360),
      4
    )

    const held = new Camera()
    held.position.reset(1, 2, 3)
    held.setParent(stage.scene)
    stage.camera = held
    stage.fit(mesh)
    expect([held.position.x, held.position.y, held.position.z]).toEqual([
      1, 2, 3
    ])
    // Its near and far still suit the node
    expect(held.far).toBeGreaterThan(1)
  })

  it('runs a loop that stops cleanly', () => {
    const before = vi.fn()
    const stage = create({ autoplay: true, onBeforeRender: before })
    expect(stage.playing).toBe(true)
    stage.playing = false
    expect(cancelAnimationFrame).toHaveBeenCalledWith(frames)
  })

  it('frees its shadow, controls and renderer on destroy', () => {
    const stage = create()
    const shadow = vi.spyOn(stage.shadow!, 'remove')
    const handlers = vi.spyOn(stage.controls!, 'removeHandlers')
    const renderer = vi.spyOn(stage.renderer, 'dispose')
    stage.destroy()
    expect(shadow).toHaveBeenCalled()
    expect(handlers).toHaveBeenCalled()
    expect(renderer).toHaveBeenCalled()
  })
})

describe('worldBoundingSphere', () => {
  it('surrounds every mesh under a node, in world space', () => {
    const stage = create()
    const group = new Obj()
    group.position.y = 2
    group.addChild(sphere(stage, -3))
    group.addChild(sphere(stage, 3))
    group.updateMatrixWorld()
    const result = worldBoundingSphere(group)!
    expect(result.centre[0]).toBeCloseTo(0)
    expect(result.centre[1]).toBeCloseTo(2)
    expect(result.radius).toBeCloseTo(4)
    expect(worldBoundingSphere(new Obj())).toBe(null)
  })
})
