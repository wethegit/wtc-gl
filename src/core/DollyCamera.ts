import { Camera, CameraOptions } from './Camera'
import { Vec2, Vec3 } from 'wtc-math'

type DollyCameraOptions = {
  element?: any
  enabled?: boolean
  target?: Vec3
  ease?: number
  inertia?: number
  enableRotate?: boolean
  rotateSpeed?: number
  autoRotate?: boolean
  autoRotateSpeed?: number
  enableZoom?: boolean
  zoomSpeed?: number
  zoomStyle?: string
  enablePan?: boolean
  panSpeed?: number
  minPolarAngle?: number
  maxPolarAngle?: number
  minAzimuthAngle?: number
  maxAzimuthAngle?: number
  minDistance?: number
  maxDistance?: number
}

class DollyCamera extends Camera {
  element: any

  enabled: boolean
  target: Vec3
  zoomStyle: string

  minDistance: number
  maxDistance: number

  enableRotate: boolean
  autoRotate: boolean
  enableZoom: boolean
  enablePan: boolean

  ease: number
  inertia: number
  rotateSpeed: number
  autoRotateSpeed: number
  zoomSpeed: number
  panSpeed: number
  minPolarAngle: number
  maxPolarAngle: number
  minAzimuthAngle: number
  maxAzimuthAngle: number

  sphericalDelta: Vec3
  sphericalTarget: Vec3
  spherical: Vec3
  panDelta: Vec3

  offset: Vec3

  rotateStart: Vec2
  panStart: Vec2
  dollyStart: Vec2

  state: number
  mouseButtons: { ORBIT: number; ZOOM: number; PAN: number }

  static STATE_NONE: number = 0
  static STATE_ROTATE: number = 1
  static STATE_DOLLY: number = 2
  static STATE_PAN: number = 4
  static STATE_DOLLY_PAN: number = 8

  constructor(
    {
      element = document,
      enabled = true,
      target = new Vec3(0, 0, 0),
      ease = 0.25,
      inertia = 0.5,
      enableRotate = true,
      rotateSpeed = .5,
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
    }: DollyCameraOptions = {},
    cameraOptions: CameraOptions = {}
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
  
  setPosition(x, y, z) {
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
    let sinPhiRadius =
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

  getZoomScale() {
    return Math.pow(0.95, this.zoomSpeed)
  }

  panLeft(distance, m) {
    const pan = new Vec3(m[0], m[1], m[2])
    pan.scale(-distance)
    this.panDelta.add(pan)
  }

  panUp(distance, m) {
    const pan = new Vec3(m[4], m[5], m[6])
    pan.scale(distance)
    this.panDelta.add(pan)
  }

  pan(deltaX, deltaY) {
    let el = this.element === document ? document.body : this.element
    const tempPos = this.position.subtractNew(this.target)
    let targetDistance = tempPos.length
    targetDistance *= Math.tan((((this.fov || 45) / 2) * Math.PI) / 180.0)
    this.panLeft((2 * deltaX * targetDistance) / el.clientHeight, this.matrix)
    this.panUp((2 * deltaY * targetDistance) / el.clientHeight, this.matrix)
  }

  dolly(dollyScale) {
    if (this.zoomStyle === 'dolly') this.sphericalDelta.radius /= dollyScale
    else {
      this.fov /= dollyScale
      if (this.type === 'orthographic') this.orthographic()
      else this.perspective()
    }
  }

  handleAutoRotate() {
    const angle = ((2 * Math.PI) / 60 / 60) * this.autoRotateSpeed
    this.sphericalDelta.theta -= angle
  }

  handleMoveRotate(x, y) {
    const movement = new Vec2(x, y)
    const moveRot = movement
      .subtractNew(this.rotateStart)
      .scale(this.rotateSpeed)
    let el = this.element === document ? document.body : this.element
    this.sphericalDelta.theta -= (2 * Math.PI * moveRot.x) / el.clientHeight
    this.sphericalDelta.phi -= (2 * Math.PI * moveRot.y) / el.clientHeight
    this.rotateStart.resetToVector(movement)
  }

  handleMouseMoveDolly(e) {
    const movement = new Vec2(e.clientX, e.clientY)
    const dolly = movement.subtractNew(this.dollyStart)
    if (dolly.y > 0) {
      this.dolly(this.getZoomScale())
    } else if (dolly.y < 0) {
      this.dolly(1 / this.getZoomScale())
    }
    this.dollyStart.resetToVector(movement)
  }

  handleMovePan(x, y) {
    const movement = new Vec2(x, y)
    const panm = movement.subtractNew(this.panStart).scale(this.panSpeed)
    this.pan(panm.x, panm.y)
    this.panStart.resetToVector(movement)
  }

  handleTouchStartDollyPan(e) {
    if (this.enableZoom) {
      let distance = new Vec2(
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

  handleTouchMoveDollyPan(e) {
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
      let x = 0.5 * (e.touches[0].pageX + e.touches[1].pageX)
      let y = 0.5 * (e.touches[0].pageY + e.touches[1].pageY)
      this.handleMovePan(x, y)
    }
  }

  onMouseDown(e) {
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

  onMouseMove(e) {
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

  onMouseUp() {
    window.removeEventListener('mousemove', this.onMouseMove, false)
    window.removeEventListener('mouseup', this.onMouseUp, false)
    this.state = DollyCamera.STATE_NONE
  }

  onMouseWheel(e) {
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

  onTouchStart(e) {
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

  onTouchMove(e) {
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

  onTouchEnd(e) {
    if (!this.enabled) return
    this.state = DollyCamera.STATE_NONE
  }

  onContextMenu(e) {
    if (!this.enabled) return
    e.preventDefault()
  }

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

export { DollyCamera }
