import { Vec2, Vec3 } from 'wtc-math'

import type { WTCGLRenderingContext } from '../../types'
import { Renderer, type RendererOptions } from '../../core/Renderer'
import { Camera, type CameraOptions } from '../../core/Camera'
import { DollyCamera, type DollyCameraOptions } from '../../core/DollyCamera'
import { Obj } from '../../core/Object'
import { worldBoundingSphere } from '../../core/bounds'
import { Lights, type LightsOptions } from '../../lighting/Lights'
import { Shadow, type ShadowOptions } from '../../lighting/Shadow'
import {
  GLTFLoader,
  type GLTF,
  type GLTFLoaderOptions
} from '../../loaders/GLTFLoader'

/**
 * Options for a {@link Stage}. Every one is optional.
 * @category Recipes
 */
export interface StageOptions {
  /**
   * The element the canvas goes in, and is sized to. The body means the
   * window.
   * @default document.body
   */
  container: HTMLElement
  /**
   * Orbit the camera with the pointer, through a `DollyCamera`. Zoom is off
   * by default, so the wheel still scrolls the page; turn it on with
   * `controlOptions: { enableZoom: true }`. `false` gives a fixed `Camera`.
   * @default true
   */
  controls: boolean
  /** Options for the `DollyCamera`, when `controls` is on. @default {} */
  controlOptions: Partial<DollyCameraOptions>
  /** Options for the camera. @default { fov: 35, near: 0.1, far: 100 } */
  camera: Partial<CameraOptions>
  /** Where the camera starts, before anything is fitted. @default [4, 3, 6] */
  cameraPosition: [number, number, number]
  /** A `Lights` to share, or the options for a new one. @default new Lights() */
  lights: Lights | Partial<LightsOptions>
  /**
   * The shadow: `true` for one with a 2048 map, options for your own, or
   * `false` for none.
   * @default true
   */
  shadow: boolean | Partial<Omit<ShadowOptions, 'lights'>>
  /** The colour to clear to. @default [0, 0, 0, 0] */
  clearColour: [number, number, number, number]
  /**
   * Options for the `Renderer`. The stage's own defaults are `alpha`,
   * `premultipliedAlpha` and `antialias` on, and `dpr` the device's, capped
   * at 2.
   * @default {}
   */
  rendererProps: Partial<RendererOptions>
  /** Start the render loop straight away. @default true */
  autoplay: boolean
  /**
   * Called each frame before drawing, with the time since the loop started
   * and since the last frame, in seconds.
   */
  onBeforeRender: (time: number, delta: number) => void
  /** Called each frame after drawing, with the same times. */
  onAfterRender: (time: number, delta: number) => void
}

/**
 * Options for {@link Stage.fit}.
 * @category Recipes
 */
export interface StageFitOptions {
  /** How much room to leave around the node, as a multiple of its size. @default 1.15 */
  padding: number
  /** Fit the shadow to the node too. @default true */
  shadow: boolean
}

/**
 * Options for {@link Stage.render}, for drawing an extra view of the scene,
 * such as a minimap, from `onAfterRender`.
 * @category Recipes
 */
export interface StageRenderOptions {
  /** The camera to draw through. @default stage.camera */
  camera: Camera
  /** The part of the canvas to draw into, as `[size, position]` in device pixels from the bottom left. @default the whole canvas */
  viewport: [Vec2, Vec2]
  /** Keep the clear and the drawing inside a rect: `true` for the viewport, or `[size, position]`. @default false */
  scissor: boolean | [Vec2, Vec2]
  /** Whether to clear first. Left out, the renderer's `autoClear` decides. */
  clear: boolean
  /** Render the shadow map first. An extra view in the same frame can reuse the one already drawn. @default true */
  shadow: boolean
}

/**
 * Options for {@link Stage.load}: the loader's, plus whether to fit.
 * @category Recipes
 */
export interface StageLoadOptions extends Partial<GLTFLoaderOptions> {
  /** Frame the camera and shadow on the model once it's loaded. @default true */
  fit: boolean
}

const hasWindow = typeof window !== 'undefined'

/**
 * A ready-made 3D scene: a renderer sized to its container, an orbiting
 * camera, shared `Lights`, a `Shadow` and a render loop. Put meshes in it with
 * `add`, load models with `load`, and frame them with `fit`.
 *
 * ```ts
 * const stage = new Stage({ container: document.querySelector('.hero') })
 * await stage.load('/models/island.glb') // added, lit, shadowed and framed
 *
 * stage.add(
 *   new Mesh(stage.gl, {
 *     geometry: new Sphere(stage.gl),
 *     program: new LitProgram(stage.gl, { lights: stage.lights, shadow: stage.shadow })
 *   })
 * )
 * ```
 *
 * Everything is still yours to change: `stage.scene` is the root `Obj`,
 * `stage.camera` the camera, `stage.lights` and `stage.shadow` the lighting,
 * and `stage.renderer` the renderer. `destroy()` frees the stage and the
 * models it loaded; meshes you made yourself are yours to `remove()`.
 * @category Recipes
 */
export class Stage {
  /** The renderer. */
  renderer: Renderer
  /** The rendering context. */
  gl: WTCGLRenderingContext
  /** The canvas drawn into. */
  canvas: HTMLCanvasElement
  /** The root of the scene. */
  scene: Obj
  /** The orbiting camera, or null when `controls` is off. */
  controls: DollyCamera | null
  /** The lights every lit program on the stage shares. */
  lights: Lights
  /** The shadow, or null when it's off. */
  shadow: Shadow | null
  /** The element the canvas is in and sized to. */
  container: HTMLElement
  /** Called each frame before drawing, with the time and delta in seconds. */
  onBeforeRender: (time: number, delta: number) => void
  /** Called each frame after drawing, with the time and delta in seconds. */
  onAfterRender: (time: number, delta: number) => void

  #ownsCanvas: boolean
  #loaded: GLTF[] = []
  #resizeObserver: ResizeObserver | null = null
  #camera!: Camera
  #frame = 0
  #last = 0
  #time = 0
  #playing = false
  #destroyed = false

  /**
   * Make the renderer, camera, lights and shadow, put the canvas in the
   * container and start the loop (unless `autoplay` is off).
   * @param options - The stage's options; see {@link StageOptions}.
   */
  constructor({
    container = document.body,
    controls = true,
    controlOptions = {},
    camera = {},
    cameraPosition = [4, 3, 6],
    lights = {},
    shadow = true,
    clearColour = [0, 0, 0, 0],
    rendererProps = {},
    autoplay = true,
    onBeforeRender = () => {},
    onAfterRender = () => {}
  }: Partial<StageOptions> = {}) {
    this.container = container
    this.onBeforeRender = onBeforeRender
    this.onAfterRender = onAfterRender

    this.#ownsCanvas = !rendererProps.canvas
    this.renderer = new Renderer({
      dpr: Math.min(globalThis.devicePixelRatio ?? 1, 2),
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      clearColour,
      ...rendererProps
    })
    this.gl = this.renderer.gl
    this.canvas = this.gl.canvas as HTMLCanvasElement

    if (this.#ownsCanvas) {
      // The renderer sizes the drawing buffer; this sizes it on the page
      Object.assign(
        this.canvas.style,
        container === document.body
          ? { position: 'fixed', inset: '0', width: '100%', height: '100%' }
          : { display: 'block', width: '100%', height: '100%' }
      )
      container.appendChild(this.canvas)
    }

    const cameraOptions = { fov: 35, near: 0.1, far: 100, ...camera }
    const [x, y, z] = cameraPosition
    if (controls) {
      this.controls = new DollyCamera(
        { element: this.canvas, enableZoom: false, ...controlOptions },
        cameraOptions
      )
      this.controls.setPosition(x, y, z)
      this.camera = this.controls
    } else {
      this.controls = null
      const fixed = new Camera(cameraOptions)
      fixed.position.reset(x, y, z)
      fixed.lookAt(new Vec3(0, 0, 0))
      this.camera = fixed
    }

    this.lights = lights instanceof Lights ? lights : new Lights(lights)
    this.shadow = shadow
      ? new Shadow(this.gl, {
          lights: this.lights,
          mapSize: 2048,
          ...(shadow === true ? {} : shadow)
        })
      : null

    this.scene = new Obj()

    this.resize = this.resize.bind(this)
    if (container === document.body) {
      if (hasWindow) window.addEventListener('resize', this.resize)
    } else {
      this.#resizeObserver = new ResizeObserver(() => this.resize())
      this.#resizeObserver.observe(container)
    }
    this.resize()

    if (autoplay) this.playing = true
  }

  /**
   * Put a node in the scene and, unless `castShadow` is false, make it cast
   * the shadow.
   * @param node - The node to add.
   * @param options - The add options.
   * @param options.castShadow - Whether the node casts the shadow. Defaults to true.
   * @returns The node.
   */
  add<T extends Obj>(node: T, { castShadow = true } = {}): T {
    node.setParent(this.scene)
    if (castShadow) this.shadow?.add(node)
    return node
  }

  /**
   * Frame the camera on a node: point it at the node's centre and move it
   * back, along the way it's already looking, until the whole node is in
   * view. The shadow is fitted around the node too.
   * @param node - The node to frame, usually something in the scene.
   * @param options - The fit options; see {@link StageFitOptions}.
   * @returns The stage, for chaining.
   */
  fit(
    node: Obj,
    { padding = 1.15, shadow = true }: Partial<StageFitOptions> = {}
  ): this {
    this.scene.updateMatrixWorld()
    if (!node.parent) node.updateMatrixWorld()
    const sphere = worldBoundingSphere(node)
    if (!sphere) return this
    const centre = new Vec3(...sphere.centre)
    const radius = Math.max(sphere.radius, 1e-6)

    const camera = this.camera

    // The narrower of the two view angles decides the distance
    const halfV = (camera.fov * Math.PI) / 360
    const halfH = Math.atan(Math.tan(halfV) * camera.aspect)
    const distance = (radius / Math.sin(Math.min(halfV, halfH))) * padding

    camera.perspective({
      near: Math.max(distance - radius * 2, distance / 100),
      far: distance + radius * 4
    })

    // A camera inside the scene, such as one from a model, keeps its place
    if (camera.parent && camera !== this.controls) {
      this.#fitShadow(node, shadow, padding)
      return this
    }

    // Keep looking from the same side: along the orbit, or back along the
    // way the camera faces (its z axis points away from what it looks at)
    let direction: Vec3
    if (camera === this.controls) {
      direction = camera.position.subtractNew(this.controls.target)
    } else {
      camera.updateMatrixWorld()
      const m = camera.worldMatrix
      direction = new Vec3(m.a31, m.a32, m.a33)
    }
    if (direction.length < 1e-6) direction.reset(0.55, 0.4, 0.75)
    direction.normalise().scale(distance)
    const position = centre.addNew(direction)

    if (camera === this.controls) {
      this.controls.target.reset(centre.x, centre.y, centre.z)
      this.controls.setPosition(position.x, position.y, position.z)
    } else {
      camera.position.reset(position.x, position.y, position.z)
      camera.lookAt(centre)
    }

    this.#fitShadow(node, shadow, padding)
    return this
  }

  #fitShadow(node: Obj, shadow: boolean, padding: number): void {
    if (!shadow || !this.shadow) return
    this.shadow.fit(node)
    this.shadow.size *= padding
  }

  /**
   * Load a glTF model with the stage's lights and shadow, add it to the
   * scene casting the shadow, and frame it (unless `fit` is false). The
   * stage frees it in `destroy()`.
   * @param url - The `.glb` or `.gltf` file.
   * @param options - Loader options, plus `fit`; see {@link StageLoadOptions}.
   * @returns The loaded model.
   */
  async load(
    url: string,
    { fit = true, ...options }: Partial<StageLoadOptions> = {}
  ): Promise<GLTF> {
    const gltf = await GLTFLoader.load(this.gl, url, {
      lights: this.lights,
      shadow: this.shadow,
      ...options
    })
    if (this.#destroyed) {
      gltf.remove()
      return gltf
    }
    this.#loaded.push(gltf)
    this.add(gltf.scene)
    if (fit) this.fit(gltf.scene)
    return gltf
  }

  /**
   * Draw one frame: update the controls and world matrices, render the
   * shadow, then the scene through the camera. The loop calls it; call it
   * yourself to draw while paused.
   *
   * The options draw an extra view in the same frame, such as a minimap in a
   * corner, from `onAfterRender`:
   *
   * ```ts
   * stage.onAfterRender = () => {
   *   const size = new Vec2(320, 200) // device pixels
   *   stage.render({ camera: overhead, viewport: [size, new Vec2(16, 16)], scissor: true, clear: true, shadow: false })
   * }
   * ```
   * @param options - What to draw through, and where; see {@link StageRenderOptions}.
   */
  render({
    camera = this.camera,
    viewport,
    scissor,
    clear,
    shadow = true
  }: Partial<StageRenderOptions> = {}): void {
    // The controls only move the camera while it's the one being drawn
    if (camera === this.controls) this.controls.update()
    this.scene.updateMatrixWorld()
    camera.updateMatrixWorld()
    if (shadow) this.shadow?.render({ scene: this.scene, update: false })
    this.renderer.render({
      scene: this.scene,
      camera,
      viewport,
      scissor,
      clear
    })
  }

  /**
   * The camera the stage draws through: the `DollyCamera` when `controls`
   * is on, otherwise a fixed `Camera`.
   */
  get camera(): Camera {
    return this.#camera
  }
  /**
   * Draw through another camera, such as one loaded with a model. It's
   * given the canvas's aspect, and the orbit controls are switched off until
   * `stage.controls` is set back.
   */
  set camera(camera: Camera) {
    this.#camera = camera
    if (this.controls) this.controls.enabled = camera === this.controls
    const { x, y } = this.renderer.dimensions ?? { x: 0, y: 0 }
    if (x && y) camera.perspective({ aspect: x / y })
  }

  /** Size the canvas and camera to the container. Bound to the instance. */
  resize(): void {
    const body = this.container === document.body
    const width =
      body && hasWindow ? window.innerWidth : this.container.clientWidth
    const height =
      body && hasWindow ? window.innerHeight : this.container.clientHeight
    if (!width || !height) return
    this.renderer.dimensions = new Vec2(width, height)
    this.camera.perspective({ aspect: width / height })
    if (!this.#playing && !this.#destroyed) this.render()
  }

  /** The time since the loop started, in seconds, not counting pauses. */
  get time(): number {
    return this.#time
  }

  /** Start or stop the render loop. Stopping cancels the requested frame. */
  set playing(value: boolean) {
    if (value && !this.#playing) {
      this.#playing = true
      this.#last = 0
      this.#frame = requestAnimationFrame(this.#tick)
    } else if (!value && this.#playing) {
      cancelAnimationFrame(this.#frame)
      this.#playing = false
    }
  }
  /** Whether the render loop is running. */
  get playing(): boolean {
    return this.#playing
  }

  #tick = (now: number) => {
    this.#frame = requestAnimationFrame(this.#tick)
    const seconds = now / 1000
    const delta = this.#last ? Math.min(seconds - this.#last, 0.1) : 0
    this.#last = seconds
    this.#time += delta
    this.onBeforeRender(this.#time, delta)
    this.render()
    this.onAfterRender(this.#time, delta)
  }

  /**
   * Stop the loop and the resize tracking, remove the controls' listeners,
   * free the shadow and every model `load` made, and dispose of the
   * renderer. A canvas the stage made is removed from the page; one passed
   * in through `rendererProps.canvas` stays. Meshes you made yourself aren't
   * freed: call their `remove()` too if the context is staying.
   * @returns The canvas.
   */
  destroy(): HTMLCanvasElement {
    this.#destroyed = true
    this.playing = false
    if (hasWindow) window.removeEventListener('resize', this.resize)
    this.#resizeObserver?.disconnect()
    this.controls?.removeHandlers()
    for (const gltf of this.#loaded) gltf.remove()
    this.#loaded = []
    this.shadow?.remove()
    this.renderer.dispose()
    if (this.#ownsCanvas) this.canvas.remove()
    return this.canvas
  }
}
