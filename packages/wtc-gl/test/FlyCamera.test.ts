import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Vec3 } from 'wtc-math'

import { FlyCamera, type FlyCameraOptions } from '../src/core/FlyCamera'

// A minimal event target: listeners by type, and a way to fire them
function target() {
  const listeners = new Map<string, Set<(e: unknown) => void>>()
  return {
    addEventListener: vi.fn((type: string, fn: (e: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    }),
    removeEventListener: vi.fn((type: string, fn: (e: unknown) => void) => {
      listeners.get(type)?.delete(fn)
    }),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    fire(type: string, e: Record<string, unknown> = {}) {
      const event = { preventDefault: vi.fn(), target: null, ...e }
      for (const fn of listeners.get(type) ?? []) fn(event)
      return event
    },
    count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0)
  }
}

let element: ReturnType<typeof target>
let keys: ReturnType<typeof target>
let win: ReturnType<typeof target>

beforeEach(() => {
  element = target()
  keys = target()
  win = target()
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', { body: element })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function create(options: Partial<FlyCameraOptions> = {}) {
  return new FlyCamera({
    element: element as unknown as HTMLElement,
    keyTarget: keys as unknown as EventTarget,
    ...options
  })
}

const down = (key: string, e = {}) => keys.fire('keydown', { key, ...e })
const up = (key: string) => keys.fire('keyup', { key })
const press = (x: number, y: number) =>
  element.fire('pointerdown', {
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: x,
    clientY: y
  })
const move = (x: number, y: number) =>
  element.fire('pointermove', { pointerId: 1, clientX: x, clientY: y })
const release = () => element.fire('pointerup', { pointerId: 1 })

// Where the camera is looking, in world space
const forward = (cam: FlyCamera) => {
  const { x, y, z, w } = cam.quaternion
  return new Vec3(
    -2 * (x * z + w * y),
    -2 * (y * z - w * x),
    -(1 - 2 * (x * x + y * y))
  )
}
// Its up, in world space
const upward = (cam: FlyCamera) => {
  const { x, y, z, w } = cam.quaternion
  return new Vec3(
    2 * (x * y - w * z),
    1 - 2 * (x * x + z * z),
    2 * (y * z + w * x)
  )
}

const run = (cam: FlyCamera, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) cam.update(dt)
}

describe('FlyCamera', () => {
  it('flies forward along −Z at its speed, without turning', () => {
    const cam = create({ speed: 3 })
    cam.update(0.5)
    expect(cam.position.z).toBeCloseTo(-1.5)
    expect(cam.position.x).toBeCloseTo(0)
    expect(cam.quaternion.w).toBeCloseTo(1)
  })

  it('pauses, keeping its speed, and space toggles it', () => {
    const cam = create({ speed: 2 })
    down(' ')
    cam.update(1)
    expect(cam.paused).toBe(true)
    expect(cam.position.z).toBe(0)
    expect(cam.speed).toBe(2)
    // A held key repeating doesn't toggle it back
    down(' ', { repeat: true })
    expect(cam.paused).toBe(true)
    down(' ')
    cam.update(1)
    expect(cam.position.z).toBeCloseTo(-2)
  })

  it('rolls with Q, ramping up over rampTime', () => {
    const cam = create({ rampTime: 1, speed: 0 })
    down('q')
    cam.update(0.1)
    const early = cam.quaternion.z
    run(cam, 1)
    // Rolled anticlockwise: up leans towards −X
    expect(upward(cam).x).toBeLessThan(0)
    // Faster once ramped up
    const before = cam.quaternion.z
    cam.update(0.1)
    expect(cam.quaternion.z - before).toBeGreaterThan(early)
  })

  it('pitches with W or ArrowUp, and turns with A or ArrowLeft', () => {
    for (const key of ['w', 'ArrowUp', 'W']) {
      const cam = create({ speed: 0, rampTime: 0 })
      down(key)
      run(cam, 0.25)
      expect(forward(cam).y, key).toBeGreaterThan(0.1)
      cam.removeHandlers()
    }
    for (const key of ['a', 'ArrowLeft']) {
      const cam = create({ speed: 0, rampTime: 0 })
      down(key)
      run(cam, 0.25)
      expect(forward(cam).x, key).toBeLessThan(-0.1)
      cam.removeHandlers()
    }
  })

  it('takes remapped keys in place of the defaults', () => {
    const cam = create({ speed: 0, rampTime: 0, keys: { up: ['i'] } })
    down('w')
    run(cam, 0.25)
    expect(forward(cam).y).toBeCloseTo(0)
    up('w')
    down('i')
    run(cam, 0.25)
    expect(forward(cam).y).toBeGreaterThan(0.1)
  })

  it('speeds up to maxSpeed and slows to a stop, not reversing', () => {
    const cam = create({ speed: 1, maxSpeed: 3, acceleration: 10 })
    down('r')
    run(cam, 2)
    expect(cam.speed).toBe(3)
    up('r')
    down('f')
    run(cam, 2)
    expect(cam.speed).toBe(0)
  })

  it('in accelerationMode, W boosts while held and drops back once let go', () => {
    const cam = create({
      speed: 2,
      maxSpeed: 10,
      acceleration: 20,
      rampTime: 0,
      accelerationDecay: 4,
      accelerationMode: true
    })
    down('w')
    run(cam, 1)
    // Up to maxSpeed while held, without pitching or changing the cruise
    expect(cam.currentSpeed).toBe(10)
    expect(cam.speed).toBe(2)
    expect(forward(cam).y).toBeCloseTo(0)
    up('w')
    // Most of the way back within half a second
    run(cam, 0.5)
    expect(cam.currentSpeed).toBeLessThan(2 + 8 * 0.15)
    run(cam, 2)
    expect(cam.currentSpeed).toBeCloseTo(2, 2)
  })

  it('in accelerationMode, S brakes, then reverses, and recovers', () => {
    const cam = create({
      speed: 2,
      maxSpeed: 10,
      maxReverseSpeed: 3,
      acceleration: 20,
      rampTime: 0,
      accelerationMode: true
    })
    down('ArrowDown')
    run(cam, 1)
    // Through a stop and into reverse, as far as maxReverseSpeed
    expect(cam.currentSpeed).toBe(-3)
    const z = cam.position.z
    cam.update(0.1)
    expect(cam.position.z).toBeCloseTo(z + 0.3)
    up('ArrowDown')
    run(cam, 2)
    expect(cam.currentSpeed).toBeCloseTo(2, 2)
  })

  it("doesn't reverse with maxReverseSpeed 0", () => {
    const cam = create({
      speed: 2,
      maxReverseSpeed: 0,
      acceleration: 20,
      rampTime: 0,
      accelerationMode: true
    })
    down('s')
    run(cam, 1)
    expect(cam.currentSpeed).toBe(0)
  })

  it('flies at its currentSpeed, which is 0 while paused', () => {
    const cam = create({ speed: 3 })
    expect(cam.currentSpeed).toBe(3)
    cam.paused = true
    expect(cam.currentSpeed).toBe(0)
  })

  it('steers by dragging from the press, clamped at stickRadius', () => {
    const turned = (dx: number) => {
      const cam = create({ speed: 0, stickRadius: 100 })
      press(200, 200)
      move(200 + dx, 200)
      run(cam, 0.5)
      release()
      cam.removeHandlers()
      return forward(cam).x
    }
    // Dragging right turns right
    expect(turned(50)).toBeGreaterThan(0)
    expect(turned(100)).toBeGreaterThan(turned(50))
    expect(turned(400)).toBeCloseTo(turned(100))
  })

  it("pitches down when dragged down, and a quick click doesn't steer", () => {
    const cam = create({ speed: 0 })
    press(0, 0)
    move(0, 150)
    run(cam, 0.5)
    expect(forward(cam).y).toBeLessThan(0)

    const clicked = create({ speed: 0, holdDelay: 0.1 })
    press(0, 0)
    move(0, 150)
    clicked.update(0.05)
    release()
    run(clicked, 0.5)
    expect(clicked.quaternion.w).toBeCloseTo(1)
  })

  it('dies away the same at any frame rate', () => {
    const settle = (dt: number) => {
      const cam = create({ speed: 0, rampTime: 0 })
      down('a')
      cam.update(1 / 60)
      up('a')
      run(cam, 1, dt)
      cam.removeHandlers()
      return forward(cam).x
    }
    expect(settle(1 / 30)).toBeCloseTo(settle(1 / 120), 2)
  })

  it('ignores keys typed into fields, and while disabled', () => {
    const cam = create({ speed: 0, rampTime: 0 })
    const event = down('w', { target: { tagName: 'INPUT' } })
    run(cam, 0.25)
    expect(forward(cam).y).toBeCloseTo(0)
    expect(event.preventDefault).not.toHaveBeenCalled()

    cam.enabled = false
    down('w')
    run(cam, 0.25)
    expect(forward(cam).y).toBeCloseTo(0)
  })

  it('keeps the arrows and space from scrolling the page', () => {
    create()
    expect(down('ArrowDown').preventDefault).toHaveBeenCalled()
    expect(down('x').preventDefault).not.toHaveBeenCalled()
  })

  it('lets go of held keys when the window loses focus', () => {
    const cam = create({ speed: 0, rampTime: 0 })
    down('w')
    win.fire('blur')
    run(cam, 0.25)
    expect(forward(cam).y).toBeCloseTo(0)
  })

  it('removes its listeners', () => {
    const cam = create()
    expect(element.count() + keys.count() + win.count()).toBeGreaterThan(0)
    cam.removeHandlers()
    expect(element.count() + keys.count() + win.count()).toBe(0)
  })
})
