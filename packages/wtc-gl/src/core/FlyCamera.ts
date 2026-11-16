import { Quat } from 'wtc-math'

import { Camera, CameraOptions } from './Camera'

/**
 * The keys for each of a {@link FlyCamera}'s actions, as `KeyboardEvent.key`
 * values. Single letters match either case.
 * @category Core
 */
export interface FlyCameraKeys {
  /** Pitch the nose up, or boost the speed while held in `accelerationMode`. @default ['w', 'ArrowUp'] */
  up: string[]
  /** Pitch the nose down, or brake and then reverse while held in `accelerationMode`. @default ['s', 'ArrowDown'] */
  down: string[]
  /** Turn left. @default ['a', 'ArrowLeft'] */
  left: string[]
  /** Turn right. @default ['d', 'ArrowRight'] */
  right: string[]
  /** Roll anticlockwise. @default ['q'] */
  rollLeft: string[]
  /** Roll clockwise. @default ['e'] */
  rollRight: string[]
  /** Speed up. @default ['r'] */
  faster: string[]
  /** Slow down, as far as stopping. @default ['f'] */
  slower: string[]
  /** Stop, or start again at the same speed. @default [' '] */
  pause: string[]
}

/**
 * Options for creating a {@link FlyCamera}. Every property is optional.
 * @category Core
 */
export interface FlyCameraOptions {
  /** The element that listens for pointer input. @default document.body */
  element: HTMLElement
  /** What listens for key input. @default window */
  keyTarget: EventTarget
  /** Whether input steers the camera. It keeps flying either way. @default true */
  enabled: boolean
  /** The forward speed, in units per second. @default 1 */
  speed: number
  /** The fastest that speeding up can go. @default speed * 10 */
  maxSpeed: number
  /** The fastest it can reverse, holding down in `accelerationMode`. 0 stops it reversing. @default maxSpeed / 2 */
  maxReverseSpeed: number
  /** How quickly the speed changes while a speed key is held, in units per second². @default the starting speed */
  acceleration: number
  /** The turn rate at full stick, or with a turn key held, in radians per second. @default 1 */
  turnSpeed: number
  /** The roll rate with a roll key held, in radians per second. @default 1 */
  rollSpeed: number
  /** The seconds a held key takes to reach its full rate. @default 0.9 */
  rampTime: number
  /** How quickly turning dies away once let go: the rate is scaled by e^(−damping × seconds). @default 6 */
  damping: number
  /** The distance, in CSS pixels, a drag needs to turn at the full rate. @default 200 */
  stickRadius: number
  /** The seconds a press is held before dragging steers, so clicks don't. @default 0.1 */
  holdDelay: number
  /** Use the up and down keys (W, S and the arrows) to boost and brake instead of pitching: holding up speeds up, holding down slows to a stop and then reverses, and letting go returns quickly to `speed`. Dragging still pitches. @default false */
  accelerationMode: boolean
  /** How quickly a boost or brake returns to `speed` once let go: the difference is scaled by e^(−accelerationDecay × seconds). @default 4 */
  accelerationDecay: number
  /** Keys to replace the defaults, by action. See {@link FlyCameraKeys}. */
  keys: Partial<FlyCameraKeys>
}

type Action = keyof FlyCameraKeys

const DEFAULT_KEYS: FlyCameraKeys = {
  up: ['w', 'ArrowUp'],
  down: ['s', 'ArrowDown'],
  left: ['a', 'ArrowLeft'],
  right: ['d', 'ArrowRight'],
  rollLeft: ['q'],
  rollRight: ['e'],
  faster: ['r'],
  slower: ['f'],
  pause: [' ']
}

// Single letters match either case, so Shift doesn't drop a held key
const normalise = (key: string) => (key.length === 1 ? key.toLowerCase() : key)

const smoothstep = (edge0: number, edge1: number, x: number) => {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

const clamp1 = (x: number) => Math.min(Math.max(x, -1), 1)

/** Whether a key event comes from somewhere the user is typing. */
function isEditable(target: EventTarget | null): boolean {
  const el = target as {
    tagName?: string
    isContentEditable?: boolean
  } | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName.toUpperCase()
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable === true
  )
}

/** One turning axis: its current rate and how long its key has been held. */
interface Axis {
  rate: number
  held: number
}

/**
 * A camera that flies forward on its own and is steered, like a plane:
 *
 * - Hold the pointer and drag away from where you pressed to turn, like a
 *   joystick. The further you drag, the faster it turns.
 * - W and S, or the up and down arrows, pitch the nose; A and D, or the left
 *   and right arrows, turn. With `accelerationMode`, holding W or S boosts
 *   or brakes and reverses instead, and letting go returns quickly to the
 *   cruising speed.
 * - Q and E roll; R and F speed up and slow down; space stops and starts.
 *
 * Held keys build up to their full rate over `rampTime`, and turning dies
 * away once let go, the same at any frame rate. Call `update(delta)` every
 * frame, with the frame's time in seconds. It looks down its local −Z, like
 * any camera, and turns about its own axes, so it can loop and fly upside
 * down.
 *
 * Set `touch-action: none` on the element so touch drags steer rather than
 * scroll. Call `removeHandlers()` before discarding it.
 *
 * ```js
 * const fly = new FlyCamera({ element: canvas, speed: 4 }, { fov: 60 })
 * stage.camera = fly
 * stage.onBeforeRender = (time, delta) => fly.update(delta)
 * ```
 * @extends Camera
 * @category Core
 */
export class FlyCamera extends Camera {
  /** The element that listens for pointer input. */
  readonly element: HTMLElement
  /** What listens for key input. */
  readonly keyTarget: EventTarget
  /** Whether input steers the camera. It keeps flying either way. */
  enabled: boolean
  /** The cruising speed, in units per second, which R and F change. Kept while paused. */
  speed: number
  /** The fastest that speeding up can go. */
  maxSpeed: number
  /** The fastest it can reverse, in `accelerationMode`. */
  maxReverseSpeed: number
  /** How quickly the speed changes while a speed key is held, in units per second². */
  acceleration: number
  /** The turn rate at full stick, or with a turn key held, in radians per second. */
  turnSpeed: number
  /** The roll rate with a roll key held, in radians per second. */
  rollSpeed: number
  /** The seconds a held key takes to reach its full rate. */
  rampTime: number
  /** How quickly turning dies away once let go. */
  damping: number
  /** The drag distance, in CSS pixels, for the full turn rate. */
  stickRadius: number
  /** The seconds a press is held before dragging steers. */
  holdDelay: number
  /** Whether the up and down keys boost and brake instead of pitching. */
  accelerationMode: boolean
  /** How quickly a boost or brake returns to `speed` once let go. */
  accelerationDecay: number
  /** Whether the camera has stopped. Space toggles it. */
  paused: boolean = false

  #keys: Map<string, Action[]> = new Map()
  #held: Set<Action> = new Set()
  #yaw: Axis = { rate: 0, held: 0 }
  #pitch: Axis = { rate: 0, held: 0 }
  #roll: Axis = { rate: 0, held: 0 }
  #throttleHeld = 0
  // Added to the cruising speed by boosting or braking in accelerationMode
  #boost = 0
  #boostHeld = 0

  // The pointer stick: where it was pressed, where it is, and for how long
  #pointerId: number | null = null
  #press = [0, 0]
  #pointer = [0, 0]
  #pressTime = 0

  /**
   * Create a fly camera and start listening for input.
   * @param options - The input and movement settings; see {@link FlyCameraOptions}.
   * @param cameraOptions - The projection settings passed to {@link Camera}.
   */
  constructor(
    {
      element = document.body,
      keyTarget = window,
      enabled = true,
      speed = 1,
      maxSpeed = speed * 10,
      maxReverseSpeed = maxSpeed / 2,
      acceleration = speed,
      turnSpeed = 1,
      rollSpeed = 1,
      rampTime = 0.9,
      damping = 6,
      stickRadius = 200,
      holdDelay = 0.1,
      accelerationMode = false,
      accelerationDecay = 4,
      keys = {}
    }: Partial<FlyCameraOptions> = {},
    cameraOptions: Partial<CameraOptions> = {}
  ) {
    super(cameraOptions)
    this.element = element
    this.keyTarget = keyTarget
    this.enabled = enabled
    this.speed = speed
    this.maxSpeed = maxSpeed
    this.maxReverseSpeed = maxReverseSpeed
    this.acceleration = acceleration
    this.turnSpeed = turnSpeed
    this.rollSpeed = rollSpeed
    this.rampTime = rampTime
    this.damping = damping
    this.stickRadius = stickRadius
    this.holdDelay = holdDelay
    this.accelerationMode = accelerationMode
    this.accelerationDecay = accelerationDecay
    this.setKeys(keys)

    this.onKeyDown = this.onKeyDown.bind(this)
    this.onKeyUp = this.onKeyUp.bind(this)
    this.onBlur = this.onBlur.bind(this)
    this.onPointerDown = this.onPointerDown.bind(this)
    this.onPointerMove = this.onPointerMove.bind(this)
    this.onPointerUp = this.onPointerUp.bind(this)

    this.addHandlers()
  }

  /**
   * Replace the keys for some actions; the rest go back to their defaults.
   * Anything held is let go. See {@link FlyCameraKeys}.
   * @param keys - The keys for each action to change.
   */
  setKeys(keys: Partial<FlyCameraKeys>): void {
    this.#keys.clear()
    this.#held.clear()
    const all = { ...DEFAULT_KEYS, ...keys }
    for (const action of Object.keys(all) as Action[]) {
      for (const key of all[action]) {
        const k = normalise(key)
        const actions = this.#keys.get(k) ?? []
        actions.push(action)
        this.#keys.set(k, actions)
      }
    }
  }

  /**
   * Turn, roll and change speed from the input, then fly forward. Call once
   * a frame.
   * @param delta - The frame's time, in seconds.
   */
  update(delta: number): void {
    const dt = Math.max(0, delta)
    const held = this.#held
    const key = (a: Action, b: Action) =>
      (held.has(a) ? 1 : 0) - (held.has(b) ? 1 : 0)

    // The stick, once a press has been held long enough
    let stickX = 0
    let stickY = 0
    if (this.#pointerId !== null) {
      this.#pressTime += dt
      if (this.#pressTime >= this.holdDelay && this.stickRadius > 0) {
        stickX = clamp1((this.#pointer[0] - this.#press[0]) / this.stickRadius)
        stickY = clamp1((this.#pointer[1] - this.#press[1]) / this.stickRadius)
      }
    }
    const steering =
      this.#pointerId !== null && this.#pressTime >= this.holdDelay

    const updown = key('up', 'down')
    const pitchKeys = this.accelerationMode ? 0 : updown
    // Turning left is a positive turn about Y, and dragging right turns right
    const yaw = this.#steer(
      this.#yaw,
      key('left', 'right'),
      -stickX,
      steering,
      dt
    )
    // Up is a positive turn about X, and dragging down pitches down
    const pitch = this.#steer(this.#pitch, pitchKeys, -stickY, steering, dt)
    const roll = this.#steer(
      this.#roll,
      key('rollLeft', 'rollRight'),
      0,
      false,
      dt
    )

    // The cruising speed
    const throttle = key('faster', 'slower')
    if (throttle) {
      this.#throttleHeld += dt
      const ramp = smoothstep(0, this.rampTime, this.#throttleHeld)
      this.speed += Math.sign(throttle) * this.acceleration * ramp * dt
      this.speed = Math.min(Math.max(this.speed, 0), this.maxSpeed)
    } else {
      this.#throttleHeld = 0
    }

    // A boost or brake on top, held in accelerationMode, that returns to the
    // cruising speed once let go
    const boost = this.accelerationMode ? updown : 0
    if (boost) {
      this.#boostHeld += dt
      const ramp = smoothstep(0, this.rampTime, this.#boostHeld)
      this.#boost += boost * this.acceleration * ramp * dt
    } else {
      this.#boostHeld = 0
      this.#boost *= Math.exp(-this.accelerationDecay * dt)
    }
    // Braking carries on into reverse
    this.#boost = Math.min(
      Math.max(this.#boost, -this.speed - this.maxReverseSpeed),
      this.maxSpeed - this.speed
    )

    // Turn about the camera's own axes
    const q = this.quaternion
    rotateLocal(q, 0, yaw * this.turnSpeed)
    rotateLocal(q, 1, pitch * this.turnSpeed)
    rotateLocal(q, 2, roll * this.rollSpeed)
    this.updateQuaternion()

    // Forward is the camera's −Z
    const speed = this.currentSpeed
    if (speed !== 0) {
      const { x, y, z, w } = q
      const step = speed * dt
      this.position.x -= 2 * (x * z + w * y) * step
      this.position.y -= 2 * (y * z - w * x) * step
      this.position.z -= (1 - 2 * (x * x + y * y)) * step
    }
  }

  /**
   * Ease an axis's rate, from -1 to 1: keys ramp up over `rampTime`, the
   * stick sets it straight away, and with neither it dies away. Returns how
   * far it turns this step, as a rate × seconds.
   */
  #steer(
    axis: Axis,
    keys: number,
    stick: number,
    steering: boolean,
    dt: number
  ): number {
    if (keys) axis.held += dt
    else axis.held = 0
    if (keys || steering) {
      const ramp = keys ? smoothstep(0, this.rampTime, axis.held) : 0
      axis.rate = clamp1(keys * ramp + stick)
      return axis.rate * dt
    }
    // The exact turn while dying away, so it's the same at any frame rate
    const k = this.damping
    const turn =
      k > 0 ? (axis.rate * (1 - Math.exp(-k * dt))) / k : axis.rate * dt
    axis.rate *= Math.exp(-k * dt)
    return turn
  }

  /**
   * The speed it's flying at: the cruising `speed`, plus any boost or brake
   * in `accelerationMode`. Below 0 while reversing, and 0 while paused.
   */
  get currentSpeed(): number {
    if (this.paused) return 0
    return Math.min(
      Math.max(this.speed + this.#boost, -this.maxReverseSpeed),
      this.maxSpeed
    )
  }

  /** Let go of every key and the pointer. */
  release(): void {
    this.#held.clear()
    this.#pointerId = null
  }

  /** @internal */
  onKeyDown(e: KeyboardEvent) {
    if (!this.enabled || e.metaKey || e.ctrlKey || e.altKey) return
    if (isEditable(e.target)) return
    const actions = this.#keys.get(normalise(e.key))
    if (!actions) return
    for (const action of actions) {
      if (action === 'pause') {
        if (!e.repeat) this.paused = !this.paused
      } else {
        this.#held.add(action)
      }
    }
    // So the arrows and space don't scroll the page
    e.preventDefault()
  }

  /** @internal */
  onKeyUp(e: KeyboardEvent) {
    const actions = this.#keys.get(normalise(e.key))
    if (!actions) return
    for (const action of actions) this.#held.delete(action)
  }

  /** @internal */
  onBlur() {
    this.release()
  }

  /** @internal */
  onPointerDown(e: PointerEvent) {
    if (!this.enabled || !e.isPrimary || e.button !== 0) return
    this.#pointerId = e.pointerId
    this.#press[0] = this.#pointer[0] = e.clientX
    this.#press[1] = this.#pointer[1] = e.clientY
    this.#pressTime = 0
    this.element.setPointerCapture?.(e.pointerId)
  }

  /** @internal */
  onPointerMove(e: PointerEvent) {
    if (e.pointerId !== this.#pointerId) return
    this.#pointer[0] = e.clientX
    this.#pointer[1] = e.clientY
  }

  /** @internal */
  onPointerUp(e: PointerEvent) {
    if (e.pointerId !== this.#pointerId) return
    this.#pointerId = null
    this.element.releasePointerCapture?.(e.pointerId)
  }

  /** Start listening for input. Called by the constructor. */
  addHandlers(): void {
    this.element.addEventListener('pointerdown', this.onPointerDown)
    this.element.addEventListener('pointermove', this.onPointerMove)
    this.element.addEventListener('pointerup', this.onPointerUp)
    this.element.addEventListener('pointercancel', this.onPointerUp)
    this.keyTarget.addEventListener('keydown', this.onKeyDown as EventListener)
    this.keyTarget.addEventListener('keyup', this.onKeyUp as EventListener)
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.onBlur)
    }
  }

  /** Stop listening for input, and let go of anything held. Call before discarding the camera. */
  removeHandlers(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown)
    this.element.removeEventListener('pointermove', this.onPointerMove)
    this.element.removeEventListener('pointerup', this.onPointerUp)
    this.element.removeEventListener('pointercancel', this.onPointerUp)
    this.keyTarget.removeEventListener(
      'keydown',
      this.onKeyDown as EventListener
    )
    this.keyTarget.removeEventListener('keyup', this.onKeyUp as EventListener)
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this.onBlur)
    }
    this.release()
  }
}

/**
 * Turn a quaternion about one of its own axes (0 Y, 1 X, 2 Z), in place:
 * q × the axis's rotation, without allocating.
 */
function rotateLocal(q: Quat, axis: 0 | 1 | 2, angle: number) {
  if (!angle) return
  const s = Math.sin(angle / 2)
  const c = Math.cos(angle / 2)
  const { x, y, z, w } = q
  if (axis === 0) {
    // About Y
    q.x = x * c - z * s
    q.y = y * c + w * s
    q.z = z * c + x * s
    q.w = w * c - y * s
  } else if (axis === 1) {
    // About X
    q.x = x * c + w * s
    q.y = y * c + z * s
    q.z = z * c - y * s
    q.w = w * c - x * s
  } else {
    // About Z
    q.x = x * c + y * s
    q.y = y * c - x * s
    q.z = z * c + w * s
    q.w = w * c - z * s
  }
}
