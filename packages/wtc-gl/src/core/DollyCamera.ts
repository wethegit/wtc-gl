import { Vec2, Vec3 } from 'wtc-math'

import { Camera, CameraOptions } from './Camera'

/**
 * Options for creating a {@link DollyCamera}.
 * @category Core
 */
export interface DollyCameraOptions {
  /** The element that listens for mouse, wheel and touch input. @default document.body */
  element: HTMLElement
  /** Whether input moves the camera. @default true */
  enabled: boolean
  /** The point the camera orbits and looks at. @default new Vec3(0, 0, 0) */
  target: Vec3
  /** The fraction of the remaining distance to its target position the camera moves each update, from 0 to 1. 0 is treated as 1. @default 0.25 */
  ease: number
  /** The fraction of rotation and pan movement kept from one update to the next, from 0 to 1. @default 0.5 */
  inertia: number
  /** Whether dragging rotates the camera. @default true */
  enableRotate: boolean
  /** A multiplier for rotation from dragging. @default 0.5 */
  rotateSpeed: number
  /** Whether the camera turns around the target on its own. @default false */
  autoRotate: boolean
  /** The auto rotation speed. At 1, one turn takes 3600 updates (a minute at 60fps). @default 1 */
  autoRotateSpeed: number
  /** Whether the wheel, middle-button dragging and pinching zoom. @default true */
  enableZoom: boolean
  /** How much each zoom step scales by, as an exponent of 0.95. @default 1 */
  zoomSpeed: number
  /** `'dolly'` moves the camera towards the target; anything else changes the field of view. @default 'dolly' */
  zoomStyle: string
  /** Whether right-button dragging and two-finger dragging pan. @default true */
  enablePan: boolean
  /** A multiplier for panning. @default 0.5 */
  panSpeed: number
  /** The lowest polar angle, in radians from straight above the target. @default 0 */
  minPolarAngle: number
  /** The highest polar angle, in radians from straight above the target. @default Math.PI */
  maxPolarAngle: number
  /** The lowest azimuth angle around the target's y axis, in radians. @default -Infinity */
  minAzimuthAngle: number
  /** The highest azimuth angle around the target's y axis, in radians. @default Infinity */
  maxAzimuthAngle: number
  /** The closest the camera can get to the target. @default 0 */
  minDistance: number
  /** The furthest the camera can get from the target. @default Infinity */
  maxDistance: number
}

/**
 * A camera that orbits a target, driven by mouse, wheel and touch input on
 * an element. Left-dragging or one finger rotates, the wheel, middle-dragging
 * or pinching zooms, and right-dragging or two fingers pan. Movement eases
 * towards where the input puts it, so call `update()` every frame.
 * @extends Camera
 * @category Core
 */
export class DollyCamera extends Camera {
  /** The element that listens for input. */
  element: HTMLElement

  /** Whether input moves the camera. */
  enabled: boolean
  /** The point the camera orbits and looks at. Panning moves it. */
  target: Vec3
  /** `'dolly'` moves the camera towards the target; anything else changes the field of view. */
  zoomStyle: string

  /** The closest the camera can get to the target. */
  minDistance: number
  /** The furthest the camera can get from the target. */
  maxDistance: number

  /** Whether dragging rotates the camera. */
  enableRotate: boolean
  /** Whether the camera turns around the target on its own. */
  autoRotate: boolean
  /** Whether zooming is enabled. */
  enableZoom: boolean
  /** Whether panning is enabled. */
  enablePan: boolean

  /** The fraction of the remaining distance to its target position the camera moves each update. */
  ease: number
  /** The fraction of rotation and pan movement kept from one update to the next. */
  inertia: number
  /** A multiplier for rotation from dragging. */
  rotateSpeed: number
  /** The auto rotation speed. At 1, one turn takes 3600 updates. */
  autoRotateSpeed: number
  /** How much each zoom step scales by, as an exponent of 0.95. */
  zoomSpeed: number
  /** A multiplier for panning. */
  panSpeed: number
  /** The lowest polar angle, in radians from straight above the target. */
  minPolarAngle: number
  /** The highest polar angle, in radians from straight above the target. */
  maxPolarAngle: number
  /** The lowest azimuth angle around the target's y axis, in radians. */
  minAzimuthAngle: number
  /** The highest azimuth angle around the target's y axis, in radians. */
  maxAzimuthAngle: number

  /** The change to apply on the next update, as spherical coordinates: a radius multiplier and phi and theta offsets. */
  sphericalDelta: Vec3
  /** The spherical coordinates around the target that the camera is easing towards. */
  sphericalTarget: Vec3
  /** The camera's current spherical coordinates around the target. */
  spherical: Vec3
  /** The pan to add to the target on the next update. Decays by `inertia`. */
  panDelta: Vec3

  /** The camera's position relative to the target. */
  offset = new Vec3()

  /** The pointer position at the last rotate step. */
  rotateStart: Vec2
  /** The pointer position at the last pan step. */
  panStart: Vec2
  /** The pointer position at the last zoom step, or `(0, distance)` between two touches. */
  dollyStart: Vec2

  /** The current interaction, one of the `STATE_` constants. */
  state: number
  /** Which `MouseEvent.button` rotates, zooms and pans. */
  mouseButtons: {
    /** The button that rotates. @default 0 (left) */
    ORBIT: number
    /** The button that zooms. @default 1 (middle) */
    ZOOM: number
    /** The button that pans. @default 2 (right) */
    PAN: number
  }

  /** No interaction is in progress. */
  static STATE_NONE: number = 0
  /** Rotating with the mouse or one finger. */
  static STATE_ROTATE: number = 1
  /** Zooming with the mouse. */
  static STATE_DOLLY: number = 2
  /** Panning with the mouse. */
  static STATE_PAN: number = 4
  /** Zooming and panning with two fingers. */
  static STATE_DOLLY_PAN: number = 8

  /**
   * Create a dolly camera and start listening for input on its element.
   * @param options - The input and movement settings; see {@link DollyCameraOptions}.
   * @param cameraOptions - The projection settings passed to {@link Camera}.
   */
  constructor(
    {
      element = document.body,
      enabled = true,
      target = new Vec3(0, 0, 0),
      ease = 0.25,
      inertia = 0.5,
      enableRotate = true,
      rotateSpeed = 0.5,
      autoRotate = false,
      autoRotateSpeed = 1.0,
      enableZoom = true,
      zoomSpeed = 1,
      zoomStyle = 'dolly',
      enablePan = true,
      panSpeed = 0.5,
      minPolarAngle = 0,
      maxPolarAngle = Math.PI,
      minAzimuthAngle = -Infinity,
      maxAzimuthAngle = Infinity,
      minDistance = 0,
      maxDistance = Infinity
    }: Partial<DollyCameraOptions> = {},
    cameraOptions: Partial<CameraOptions> = {}
  ) {
    super(cameraOptions)

    this.element = element

    this.enabled = enabled
    this.target = target
    this.zoomStyle = zoomStyle

    this.ease = ease || 1
    this.inertia = inertia || 0
    this.enableRotate = enableRotate
    this.rotateSpeed = rotateSpeed
    this.autoRotate = autoRotate
    this.autoRotateSpeed = autoRotateSpeed
    this.enableZoom = enableZoom
    this.zoomSpeed = zoomSpeed
    this.enablePan = enablePan
    this.panSpeed = panSpeed
    this.minPolarAngle = minPolarAngle
    this.maxPolarAngle = maxPolarAngle
    this.minAzimuthAngle = minAzimuthAngle
    this.maxAzimuthAngle = maxAzimuthAngle

    this.minDistance = minDistance
    this.maxDistance = maxDistance

    // current position in sphericalTarget coordinates
    this.sphericalDelta = new Vec3(1, 0, 0) // { radius: 1, phi: 0, theta: 0 };
    this.sphericalTarget = new Vec3(1, 0, 0)
    this.spherical = new Vec3(1, 0, 0)
    this.panDelta = new Vec3()

    this.setPosition(this.position.x, this.position.y, this.position.z)

    this.rotateStart = new Vec2()
    this.panStart = new Vec2()
    this.dollyStart = new Vec2()

    this.state = DollyCamera.STATE_NONE
    this.mouseButtons = { ORBIT: 0, ZOOM: 1, PAN: 2 }

    this.onContextMenu = this.onContextMenu.bind(this)
    this.onMouseDown = this.onMouseDown.bind(this)
    this.onMouseWheel = this.onMouseWheel.bind(this)
    this.onTouchStart = this.onTouchStart.bind(this)
    this.onTouchEnd = this.onTouchEnd.bind(this)
    this.onTouchMove = this.onTouchMove.bind(this)
    this.onMouseMove = this.onMouseMove.bind(this)
    this.onMouseUp = this.onMouseUp.bind(this)

    this.addHandlers()
  }

  /**
   * Move the camera to a position straight away, without easing, and keep
   * orbiting the target from there.
   * @param x - The x position.
   * @param y - The y position.
   * @param z - The z position.
   */
  setPosition(x: number, y: number, z: number) {
    this.position.reset(x, y, z)
    this.offset = this.position.subtractNew(this.target)

    this.spherical.radius = this.sphericalTarget.radius = this.offset.length
    this.spherical.theta = this.sphericalTarget.theta = Math.atan2(
      this.offset.x,
      this.offset.z
    )
    this.spherical.phi = this.sphericalTarget.phi = Math.acos(
      Math.min(Math.max(this.offset.y / this.sphericalTarget.radius, -1), 1)
    )
  }

  /**
   * Apply input, auto rotation, easing and limits, then move the camera and
   * point it at the target. Call once per frame.
   */
  update() {
    if (this.autoRotate) {
      this.handleAutoRotate()
    }

    // apply delta
    this.sphericalTarget.radius *= this.sphericalDelta.radius
    this.sphericalTarget.theta += this.sphericalDelta.theta
    this.sphericalTarget.phi += this.sphericalDelta.phi

    // apply boundaries
    this.sphericalTarget.theta = Math.max(
      this.minAzimuthAngle,
      Math.min(this.maxAzimuthAngle, this.sphericalTarget.theta)
    )
    this.sphericalTarget.phi = Math.max(
      this.minPolarAngle,
      Math.min(this.maxPolarAngle, this.sphericalTarget.phi)
    )
    this.sphericalTarget.radius = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, this.sphericalTarget.radius)
    )

    // ease values
    this.spherical.phi +=
      (this.sphericalTarget.phi - this.spherical.phi) * this.ease
    this.spherical.theta +=
      (this.sphericalTarget.theta - this.spherical.theta) * this.ease
    this.spherical.radius +=
      (this.sphericalTarget.radius - this.spherical.radius) * this.ease

    // apply pan to target. As offset is relative to target, it also shifts
    this.target.add(this.panDelta)

    // apply rotation to offset
    const sinPhiRadius =
      this.spherical.radius * Math.sin(Math.max(0.000001, this.spherical.phi))
    this.offset.x = sinPhiRadius * Math.sin(this.spherical.theta)
    this.offset.y = this.spherical.radius * Math.cos(this.spherical.phi)
    this.offset.z = sinPhiRadius * Math.cos(this.spherical.theta)

    // Apply updated values to object
    this.position.resetToVector(this.target.addNew(this.offset))
    this.lookAt(this.target)

    // Apply inertia to values
    this.sphericalDelta.theta *= this.inertia
    this.sphericalDelta.phi *= this.inertia
    this.panDelta.scale(this.inertia)

    // Reset scale every frame to avoid applying scale multiple times
    this.sphericalDelta.radius = 1
  }

  /**
   * Sync the orbit to the camera's current `position` and look at the
   * target. Call after setting `position` directly.
   */
  forcePosition() {
    this.offset = this.position.subtractNew(this.target)
    this.spherical.radius = this.sphericalTarget.radius = this.offset.length
    this.spherical.theta = this.sphericalTarget.theta = Math.atan2(
      this.offset.x,
      this.offset.z
    )
    this.spherical.phi = this.sphericalTarget.phi = Math.acos(
      Math.min(Math.max(this.offset.y / this.sphericalTarget.radius, -1), 1)
    )
    this.lookAt(this.target)
  }

  /**
   * The scale for one zoom step.
   * @returns `0.95` to the power of `zoomSpeed`.
   */
  getZoomScale() {
    return Math.pow(0.95, this.zoomSpeed)
  }

  /**
   * Pan along the x axis of a matrix.
   * @param distance - How far to pan. Positive moves left.
   * @param m - The matrix as a column-major array; its first column is the axis.
   */
  panLeft(distance: number, m: number[]) {
    const pan = new Vec3(m[0], m[1], m[2])
    pan.scale(-distance)
    this.panDelta.add(pan)
  }

  /**
   * Pan along the y axis of a matrix.
   * @param distance - How far to pan. Positive moves up.
   * @param m - The matrix as a column-major array; its second column is the axis.
   */
  panUp(distance: number, m: number[]) {
    const pan = new Vec3(m[4], m[5], m[6])
    pan.scale(distance)
    this.panDelta.add(pan)
  }

  /**
   * Pan by a pointer movement, scaled by the camera's distance to the target
   * and its field of view.
   * @param deltaX - The horizontal movement, in pixels.
   * @param deltaY - The vertical movement, in pixels.
   */
  pan(deltaX: number, deltaY: number) {
    const el = this.element
    const tempPos = this.position.subtractNew(this.target)
    let targetDistance = tempPos.length
    targetDistance *= Math.tan((((this.fov || 45) / 2) * Math.PI) / 180.0)

    this.panLeft(
      (2 * deltaX * targetDistance) / el.clientHeight,
      this.matrix.array
    )

    this.panUp(
      (2 * deltaY * targetDistance) / el.clientHeight,
      this.matrix.array
    )
  }

  /**
   * Zoom by a scale factor: values over 1 zoom in, under 1 zoom out. Moves
   * the camera or changes the field of view, depending on `zoomStyle`.
   * @param dollyScale - The scale factor.
   */
  dolly(dollyScale: number) {
    if (this.zoomStyle === 'dolly') this.sphericalDelta.radius /= dollyScale
    else {
      this.fov /= dollyScale
      this.updateProjectionMatrix()
    }
  }

  /**
   * Add one update's worth of auto rotation.
   */
  handleAutoRotate() {
    const angle = ((2 * Math.PI) / 60 / 60) * this.autoRotateSpeed
    this.sphericalDelta.theta -= angle
  }

  /**
   * Rotate by the pointer's movement since `rotateStart`.
   * @param x - The pointer's x position, in pixels.
   * @param y - The pointer's y position, in pixels.
   */
  handleMoveRotate(x: number, y: number) {
    const movement = new Vec2(x, y)
    const moveRot = movement
      .subtractNew(this.rotateStart)
      .scale(this.rotateSpeed)
    const el = this.element

    this.sphericalDelta.theta -= (2 * Math.PI * moveRot.x) / el.clientHeight
    this.sphericalDelta.phi -= (2 * Math.PI * moveRot.y) / el.clientHeight
    this.rotateStart.resetToVector(movement)
  }

  /**
   * Zoom one step in the direction the mouse moved vertically.
   * @param e - The mouse move event.
   */
  handleMouseMoveDolly(e: MouseEvent) {
    const movement = new Vec2(e.clientX, e.clientY)
    const dolly = movement.subtractNew(this.dollyStart)
    if (dolly.y > 0) {
      this.dolly(this.getZoomScale())
    } else if (dolly.y < 0) {
      this.dolly(1 / this.getZoomScale())
    }
    this.dollyStart.resetToVector(movement)
  }

  /**
   * Pan by the pointer's movement since `panStart`.
   * @param x - The pointer's x position, in pixels.
   * @param y - The pointer's y position, in pixels.
   */
  handleMovePan(x: number, y: number) {
    const movement = new Vec2(x, y)
    const panm = movement.subtractNew(this.panStart).scale(this.panSpeed)
    this.pan(panm.x, panm.y)
    this.panStart.resetToVector(movement)
  }

  /**
   * Record the starting distance and midpoint of a two-finger touch.
   * @param e - The touch start event.
   */
  handleTouchStartDollyPan(e: TouchEvent) {
    if (this.enableZoom) {
      const distance = new Vec2(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      ).length
      this.dollyStart.reset(0, distance)
    }

    if (this.enablePan) {
      this.panStart.reset(
        0.5 * (e.touches[0].pageX + e.touches[1].pageX),
        0.5 * (e.touches[0].pageY + e.touches[1].pageY)
      )
    }
  }

  /**
   * Zoom by the change in distance between two fingers and pan by the
   * movement of their midpoint.
   * @param e - The touch move event.
   */
  handleTouchMoveDollyPan(e: TouchEvent) {
    if (this.enableZoom) {
      const touchzoom = new Vec2(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      )
      const zoom = new Vec2(0, touchzoom.length)
      const dollyZoom = new Vec2(
        0,
        Math.pow(zoom.y / this.dollyStart.y, this.zoomSpeed)
      )
      this.dolly(dollyZoom.y)
      this.dollyStart.resetToVector(zoom)
    }

    if (this.enablePan) {
      const x = 0.5 * (e.touches[0].pageX + e.touches[1].pageX)
      const y = 0.5 * (e.touches[0].pageY + e.touches[1].pageY)
      this.handleMovePan(x, y)
    }
  }

  /**
   * Start rotating, zooming or panning, depending on the button.
   * @param e - The mouse down event.
   */
  onMouseDown(e: MouseEvent) {
    if (!this.enabled) return

    switch (e.button) {
      case this.mouseButtons.ORBIT:
        if (this.enableRotate === false) return
        this.rotateStart.reset(e.clientX, e.clientY)
        this.state = DollyCamera.STATE_ROTATE
        break
      case this.mouseButtons.ZOOM:
        if (this.enableZoom === false) return
        this.dollyStart.reset(e.clientX, e.clientY)
        this.state = DollyCamera.STATE_DOLLY
        break
      case this.mouseButtons.PAN:
        if (this.enablePan === false) return
        this.panStart.reset(e.clientX, e.clientY)
        this.state = DollyCamera.STATE_PAN
        break
    }

    if (this.state !== DollyCamera.STATE_NONE) {
      window.addEventListener('mousemove', this.onMouseMove, false)
      window.addEventListener('mouseup', this.onMouseUp, false)
    }
  }

  /**
   * Continue the current mouse interaction.
   * @param e - The mouse move event.
   */
  onMouseMove(e: MouseEvent) {
    if (!this.enabled) return

    switch (this.state) {
      case DollyCamera.STATE_ROTATE:
        if (this.enableRotate === false) return
        this.handleMoveRotate(e.clientX, e.clientY)
        break
      case DollyCamera.STATE_DOLLY:
        if (this.enableZoom === false) return
        this.handleMouseMoveDolly(e)
        break
      case DollyCamera.STATE_PAN:
        if (this.enablePan === false) return
        this.handleMovePan(e.clientX, e.clientY)
        break
    }
  }

  /**
   * End the current mouse interaction.
   */
  onMouseUp() {
    window.removeEventListener('mousemove', this.onMouseMove, false)
    window.removeEventListener('mouseup', this.onMouseUp, false)
    this.state = DollyCamera.STATE_NONE
  }

  /**
   * Zoom one step in the wheel's direction.
   * @param e - The wheel event.
   */
  onMouseWheel(e: WheelEvent) {
    if (
      !this.enabled ||
      !this.enableZoom ||
      (this.state !== DollyCamera.STATE_NONE &&
        this.state !== DollyCamera.STATE_ROTATE)
    )
      return
    e.stopPropagation()
    e.preventDefault()

    if (e.deltaY < 0) {
      this.dolly(1 / this.getZoomScale())
    } else if (e.deltaY > 0) {
      this.dolly(this.getZoomScale())
    }
  }

  /**
   * Start rotating with one finger, or zooming and panning with two.
   * @param e - The touch start event.
   */
  onTouchStart(e: TouchEvent) {
    if (!this.enabled) return
    e.preventDefault()

    switch (e.touches.length) {
      case 1:
        if (this.enableRotate === false) return
        this.rotateStart.reset(e.touches[0].pageX, e.touches[0].pageY)
        this.state = DollyCamera.STATE_ROTATE
        break
      case 2:
        if (this.enableZoom === false && this.enablePan === false) return
        this.handleTouchStartDollyPan(e)
        this.state = DollyCamera.STATE_DOLLY_PAN
        break
      default:
        this.state = DollyCamera.STATE_NONE
    }
  }

  /**
   * Continue the current touch interaction.
   * @param e - The touch move event.
   */
  onTouchMove(e: TouchEvent) {
    if (!this.enabled) return
    e.preventDefault()
    e.stopPropagation()

    switch (e.touches.length) {
      case 1:
        if (this.enableRotate === false) return
        this.handleMoveRotate(e.touches[0].pageX, e.touches[0].pageY)
        break
      case 2:
        if (this.enableZoom === false && this.enablePan === false) return
        this.handleTouchMoveDollyPan(e)
        break
      default:
        this.state = DollyCamera.STATE_NONE
    }
  }

  /**
   * End the current touch interaction.
   */
  onTouchEnd() {
    if (!this.enabled) return
    this.state = DollyCamera.STATE_NONE
  }

  /**
   * Stop the context menu opening while the camera and panning are enabled,
   * so the right button can pan.
   * @param e - The context menu event.
   */
  onContextMenu(e: Event) {
    if (!this.enablePan) return
    if (!this.enabled) return
    e.preventDefault()
  }

  /**
   * Start listening for input on `element`. Called by the constructor.
   */
  addHandlers() {
    this.element.addEventListener('contextmenu', this.onContextMenu, false)
    this.element.addEventListener('mousedown', this.onMouseDown, false)
    this.element.addEventListener('wheel', this.onMouseWheel, {
      passive: false
    })
    this.element.addEventListener('touchstart', this.onTouchStart, {
      passive: false
    })
    this.element.addEventListener('touchend', this.onTouchEnd, false)
    this.element.addEventListener('touchmove', this.onTouchMove, {
      passive: false
    })
  }

  /**
   * Stop listening for input. Call before discarding the camera.
   */
  removeHandlers() {
    this.element.removeEventListener('contextmenu', this.onContextMenu)
    this.element.removeEventListener('mousedown', this.onMouseDown)
    this.element.removeEventListener('wheel', this.onMouseWheel)
    this.element.removeEventListener('touchstart', this.onTouchStart)
    this.element.removeEventListener('touchend', this.onTouchEnd)
    this.element.removeEventListener('touchmove', this.onTouchMove)
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
  }
}
