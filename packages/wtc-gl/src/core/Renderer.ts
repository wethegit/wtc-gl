import { Vec2 } from 'wtc-math'

import type {
  WTCGLRendererState,
  WTCGLRenderingContext,
  WTCGLExtensionMap,
  WTCGLRendererParams,
  WTCGLRestorable
} from '../types'

import { Camera } from './Camera'
import { RenderTarget } from './RenderTarget'
import { Obj } from './Object'
import { Drawable } from './Drawable'
import type { StencilOptions } from './Program'

export interface RendererOptions {
  canvas: HTMLCanvasElement
  width: number
  height: number
  dpr: number
  alpha: boolean
  depth: boolean
  stencil: boolean
  antialias: boolean
  premultipliedAlpha: boolean
  preserveDrawingBuffer: boolean
  powerPreference: string
  autoClear: boolean
  clearColour: WTCGLColour
}

/**
 * A colour as `[r, g, b, a]`, each from 0 to 1.
 */
export type WTCGLColour = [number, number, number, number]

export interface RenderOptions {
  scene: Obj
  camera?: Camera
  target?: RenderTarget | null
  update?: boolean
  sort?: boolean
  frustumCull?: boolean
  clear?: boolean
  viewport?: [Vec2, Vec2]
}

/**
 * Create a renderer. This is responsible for bringing together the whole state and, eventually, rendering to screen.
 */
export class Renderer {
  /**
   * The pixel aspect ratio of the renderer.
   * @default devicePixelRatio, capped at 2 (1 when there is no window).
   */
  dpr: number
  /**
   * The dimensions of the renderer
   */
  #dimensions = new Vec2()

  /**
   * Whether to render an alpha channel. This property is passed to the rendering context.
   * @default false
   */
  alpha: boolean
  /**
   * Whether to clear the color bit
   * @default true
   */
  colour: boolean
  /**
   * Whether to render a depth buffer. This property is passed to the rendering context.
   * @default true
   */
  depth: boolean
  /**
   * Whether to render a stencil buffer. This property is passed to the rendering context.
   * @default false
   */
  stencil: boolean
  /**
   * Whether to use premultiplied alphs. This property is passed to the rendering context.
   * @default false
   */
  premultipliedAlpha: boolean
  /**
   * Whether to automatically clear the buffers before render.
   * @default true
   */
  autoClear: boolean
  #clearColour: WTCGLColour = [0, 0, 0, 0]

  /**
   * The WTCGL rendering context.
   */
  gl: WTCGLRenderingContext
  /**
   * The rendering state. Allows us to avoid redundant calls on methods used internally
   */
  state: WTCGLRendererState
  /**
   * Extensions looked up so far, so each is only requested once per context.
   */
  #extensions = new Map<string, unknown>()
  /**
   * Stored device parameters such as max allowable units etc.
   */
  parameters: WTCGLRendererParams

  /**
   * Stores the current geometry being rendered. Used to otimise geo rendering.
   */
  currentGeometry = ''

  // Allows programs to optimise by determine if they're the currently rendering program and skipping some steps
  currentProgram = -1

  #ownsCanvas: boolean

  /**
   * Whether the WebGL context is currently lost. Rendering is skipped until
   * the browser restores it.
   */
  contextLost = false
  /**
   * Incremented each time the context is restored. Resources compare it with
   * their own, so each one is only rebuilt once per restore.
   */
  contextVersion = 0
  /**
   * Called when the WebGL context is lost, e.g. after a GPU reset or when the
   * browser reclaims contexts. A good place to show a fallback.
   */
  onContextLost?: () => void
  /**
   * Called once the context has been restored and every tracked resource has
   * been rebuilt.
   */
  onContextRestored?: () => void

  #resources = new Set<WeakRef<WTCGLRestorable>>()
  #resourceRefs = new WeakMap<WTCGLRestorable, WeakRef<WTCGLRestorable>>()

  /**
   * create a renderer
   * @param __namedParameters - The parameters to initialise the renderer.
   * @param canvas - The canvas HTML element to render to.
   * @param width - The width of the canvas.
   * @param height - The height of the canvas.
   * @param dpr - The pixel aspect ratio of the canvas.
   * @param alpha - Whether to render an alpha channel.
   * @param depth - Whether to render a depth buffer.
   * @param stencil - Whether to render a stencil buffer.
   * @param premultipliedAlpha - Whether to use premultiplied alpha.
   * @param preserveDrawingBuffer - Preserve the drawing buffer between calls. Useful for when downloading the canvas to an image.
   * @param powerPreference - WebGL power preference.
   * @param autoClear - Whether to clear the canvas between draw.
   * @param clearColour - The colour to clear to, as `[r, g, b, a]`.
   */
  constructor({
    canvas,
    width = 300,
    height = 150,
    dpr = Math.min(globalThis.devicePixelRatio ?? 1, 2),
    alpha = false,
    depth = true,
    stencil = false,
    antialias = false,
    premultipliedAlpha = false,
    preserveDrawingBuffer = false,
    powerPreference = 'default',
    autoClear = true,
    clearColour
  }: Partial<RendererOptions> = {}) {
    const attributes = {
      alpha,
      depth,
      stencil,
      antialias,
      premultipliedAlpha,
      preserveDrawingBuffer,
      powerPreference
    }
    this.#ownsCanvas = !canvas
    canvas ??= document.createElement('canvas')

    this.dpr = dpr
    this.alpha = alpha
    this.colour = true
    this.depth = depth
    this.stencil = stencil
    this.premultipliedAlpha = premultipliedAlpha
    this.autoClear = autoClear

    const gl = canvas.getContext(
      'webgl2',
      attributes
    ) as WTCGLRenderingContext | null
    if (!gl) throw new Error('Unable to create a WebGL2 context')

    this.gl = gl
    this.gl.renderer = this

    // initialise size values
    this.dimensions = new Vec2(width, height)

    this.state = this.#createState()

    this.#enableExtensions()
    this.parameters = this.#getParameters()

    if (clearColour) this.clearColour = clearColour

    canvas.addEventListener('webglcontextlost', this.#handleContextLost)
    canvas.addEventListener('webglcontextrestored', this.#handleContextRestored)
  }

  /**
   * The initial state cache, matching a fresh WebGL context.
   */
  #createState(): WTCGLRendererState {
    return {
      blendFunc: { src: this.gl.ONE, dst: this.gl.ZERO },
      blendEquation: {
        modeRGB: this.gl.FUNC_ADD,
        modeAlpha: this.gl.FUNC_ADD
      },
      cullFace: null,
      frontFace: this.gl.CCW,
      depthMask: true,
      depthFunc: this.gl.LESS,
      premultiplyAlpha: false,
      flipY: false,
      unpackAlignment: 4,
      framebuffer: null,
      viewport: { width: null, height: null, x: 0, y: 0 },
      textureUnits: [],
      activeTextureUnit: 0,
      boundBuffer: null,
      uniformLocations: new Map()
    }
  }

  /**
   * Enable the optional extensions the library relies on: rendering to and
   * filtering float textures.
   */
  #enableExtensions() {
    this.getExtension('EXT_color_buffer_float')
    this.getExtension('OES_texture_float_linear')
  }

  #getParameters(): WTCGLRendererParams {
    return {
      maxTextureUnits: this.gl.getParameter(
        this.gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS
      ),
      maxAnisotropy: this.#maxAnisotropy()
    }
  }

  #maxAnisotropy(): number {
    const ext = this.getExtension('EXT_texture_filter_anisotropic')
    return ext ? this.gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 0
  }

  #handleContextLost = (event: Event) => {
    // Without preventDefault the browser won't try to restore the context
    event.preventDefault()
    this.contextLost = true
    this.onContextLost?.()
  }

  #handleContextRestored = () => {
    // A restored context starts from scratch, so reset every cache and
    // re-request the extensions before rebuilding resources
    this.state = this.#createState()
    this.#extensions.clear()
    this.#enableExtensions()
    this.parameters = this.#getParameters()
    this.currentProgram = -1
    this.currentGeometry = ''
    this.clearColour = this.#clearColour
    this.#colourWrite = true
    this.#stencilState = defaultStencilState()

    this.contextVersion++
    this.contextLost = false

    for (const ref of this.#resources) {
      const resource = ref.deref()
      if (resource) resource.restoreContext()
      else this.#resources.delete(ref)
    }

    this.onContextRestored?.()
  }

  /**
   * Register a resource to be rebuilt when the WebGL context is restored.
   * Programs, geometry, textures, render targets and transform feedbacks
   * register themselves when created; call this for your own resources.
   * Only a weak reference is kept, so tracking doesn't stop garbage collection;
   * keep your own reference to anything you track.
   * @param resource - An object with a `restoreContext()` method.
   */
  track(resource: WTCGLRestorable): void {
    if (this.#resourceRefs.has(resource)) return
    const ref = new WeakRef(resource)
    this.#resourceRefs.set(resource, ref)
    this.#resources.add(ref)
  }

  /**
   * Stop rebuilding a resource on context restore. Called by `remove()`.
   * @param resource - A resource previously passed to `track`.
   */
  untrack(resource: WTCGLRestorable): void {
    const ref = this.#resourceRefs.get(resource)
    if (!ref) return
    this.#resources.delete(ref)
    this.#resourceRefs.delete(resource)
  }

  /**
   * Clear the renderer's state caches. If the renderer created its own
   * canvas, the WebGL context is also released straight away (via
   * `WEBGL_lose_context`) rather than when it's garbage collected, as
   * browsers cap the number of live contexts per page. A canvas passed in
   * through the `canvas` option is left alone, because a canvas only ever
   * holds one context and losing it would stop a new renderer using it.
   *
   * Programs, geometry and textures aren't tracked by the renderer, so call
   * `remove()` on them first if the context is being kept.
   */
  dispose() {
    const canvas = this.gl.canvas as HTMLCanvasElement
    canvas.removeEventListener('webglcontextlost', this.#handleContextLost)
    canvas.removeEventListener(
      'webglcontextrestored',
      this.#handleContextRestored
    )
    this.#resources.clear()
    this.state.uniformLocations.clear()
    this.state.textureUnits = []
    this.currentProgram = -1
    this.currentGeometry = ''
    if (this.#ownsCanvas) this.getExtension('WEBGL_lose_context')?.loseContext()
  }

  set dimensions(v: Vec2) {
    this.#dimensions = v

    this.gl.canvas.width = v.width * this.dpr
    this.gl.canvas.height = v.height * this.dpr
  }
  get dimensions() {
    return this.#dimensions
  }

  /**
   * Set up the viewport for rendering.
   * @param dimensions - The dimensions of the viewport
   * @param position - The position of the viewport
   */
  setViewport(dimensions: Vec2, position: Vec2): void {
    if (
      this.state.viewport.width === dimensions.width &&
      this.state.viewport.height === dimensions.height &&
      this.state.viewport.x === position.x &&
      this.state.viewport.y === position.y
    )
      return
    this.state.viewport.width = dimensions.width
    this.state.viewport.height = dimensions.height
    this.state.viewport.x = position.x
    this.state.viewport.y = position.y
    this.gl.viewport(
      position.x,
      position.y,
      dimensions.width,
      dimensions.height
    )
  }

  /**
   * Enables specific WebGL capabilities for this context.
   * See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/enable) for more details
   * @param id - The ID of the capability to enable
   */
  enable(id: GLenum): void {
    // these typings are ugly I just couldn't find a way to map the rendering context to the state without major refactor of the  interface and its uses
    if (this.state[id as unknown as keyof WTCGLRendererState] === true) return

    this.gl.enable(id)
    this.state[id as unknown as keyof WTCGLRendererState] = true as never
  }

  /**
   * Disables specific WebGL capabilities for this context.
   * @param id - The ID of the capability to enable
   */
  disable(id: GLenum): void {
    // these typings are ugly I just couldn't find a way to map the rendering context to the state without major refactor of the  interface and its uses
    if (this.state[id as unknown as keyof WTCGLRendererState] === false) return

    this.gl.disable(id)
    this.state[id as unknown as keyof WTCGLRendererState] = false as never
  }

  /**
   * Set's various blend functions are used for blending pixel calculations
   * See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/blendFunc) for more details
   * If alpha functions are provided, this will call gl.blendFuncSeparate, otherwise blendFunc
   * @param src - A WebGL_API.Types specifying a multiplier for the RGB source blending factors.
   * @param dst - A WebGL_API.Types specifying a multiplier for the RGB destination blending factors.
   * @param srcAlpha - A WebGL_API.Types specifying a multiplier for the alpha source blending factor.
   * @param dstAlpha - A WebGL_API.Types specifying a multiplier for the alpha destination blending factor.
   */
  setBlendFunc(
    src: GLenum,
    dst: GLenum,
    srcAlpha?: GLenum,
    dstAlpha?: GLenum
  ): void {
    if (
      this.state.blendFunc.src === src &&
      this.state.blendFunc.dst === dst &&
      this.state.blendFunc.srcAlpha === srcAlpha &&
      this.state.blendFunc.dstAlpha === dstAlpha
    )
      return

    this.state.blendFunc.src = src
    this.state.blendFunc.dst = dst
    this.state.blendFunc.srcAlpha = srcAlpha
    this.state.blendFunc.dstAlpha = dstAlpha

    if (srcAlpha !== undefined && dstAlpha !== undefined)
      this.gl.blendFuncSeparate(src, dst, srcAlpha, dstAlpha)
    else this.gl.blendFunc(src, dst)
  }

  /**
   * Sets a blending function for use in the application.
   * See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/blendEquation) for more information
   * @param modeRGB - The function to be used in RGB models
   * @param modeAlpha - The functions to be used for both RGB and alpha models
   */
  setBlendEquation(modeRGB: GLenum, modeAlpha: GLenum): void {
    modeRGB = modeRGB || this.gl.FUNC_ADD
    if (
      this.state.blendEquation.modeRGB === modeRGB &&
      this.state.blendEquation.modeAlpha === modeAlpha
    )
      return
    this.state.blendEquation.modeRGB = modeRGB
    this.state.blendEquation.modeAlpha = modeAlpha
    if (modeAlpha !== undefined)
      this.gl.blendEquationSeparate(modeRGB, modeAlpha)
    else this.gl.blendEquation(modeRGB)
  }

  /**
   * Sets the cull face bit
   */
  set cullFace(value: GLenum) {
    if (this.state.cullFace === value) return
    this.state.cullFace = value
    this.gl.cullFace(value)
  }
  get cullFace(): GLenum | null {
    return this.state.cullFace
  }

  /**
   * Sets the front face bit
   */
  set frontFace(value: GLenum) {
    if (this.state.frontFace === value) return
    this.state.frontFace = value
    this.gl.frontFace(value)
  }
  get frontFace(): GLenum | null {
    return this.state.frontFace
  }

  /**
   * The colour the canvas and render targets are cleared to, as
   * `[r, g, b, a]` from 0 to 1. Kept across context loss, unlike a colour set
   * with `gl.clearColor` directly.
   * @default [0, 0, 0, 0]
   */
  set clearColour(value: WTCGLColour) {
    this.#clearColour = [value[0], value[1], value[2], value[3]]
    this.gl.clearColor(value[0], value[1], value[2], value[3])
  }
  get clearColour(): WTCGLColour {
    return [...this.#clearColour]
  }

  /**
   * Sets the depth mask bit
   */
  set depthMask(value: boolean) {
    if (this.state.depthMask === value) return
    this.state.depthMask = value
    this.gl.depthMask(value)
  }
  get depthMask() {
    return this.state.depthMask
  }

  /**
   * Sets the depth function bit
   */
  set depthFunc(value: GLenum) {
    if (this.state.depthFunc === value) return
    this.state.depthFunc = value
    this.gl.depthFunc(value)
  }
  get depthFunc(): GLenum | null {
    return this.state.depthFunc
  }

  // Colour-write and stencil state the renderer has set. Only changes the
  // renderer makes are undone, so gl.colorMask and stencil calls made
  // directly on the context keep working for programs that don't set these.
  #colourWrite = true
  #stencilState = defaultStencilState()

  /**
   * Whether colour is written. Set from each program's `colourWrite`.
   */
  set colourWrite(value: boolean) {
    if (this.#colourWrite === value) return
    this.#colourWrite = value
    this.gl.colorMask(value, value, value, value)
  }
  get colourWrite(): boolean {
    return this.#colourWrite
  }

  /**
   * Apply a program's stencil test, or turn off a stencil test this renderer
   * turned on. Called by `Program.applyState`.
   * @param stencil - The resolved stencil settings, or null for none.
   */
  setStencil(stencil: Required<StencilOptions> | null): void {
    const gl = this.gl
    const current = this.#stencilState
    if (!stencil) {
      if (current.enabled) {
        gl.disable(gl.STENCIL_TEST)
        current.enabled = false
      }
      return
    }

    // State may have been changed directly on the context since this
    // renderer last enabled the test, so set everything when enabling
    const force = !current.enabled
    if (force) {
      gl.enable(gl.STENCIL_TEST)
      current.enabled = true
    }
    if (
      force ||
      current.func !== stencil.func ||
      current.ref !== stencil.ref ||
      current.mask !== stencil.mask
    ) {
      gl.stencilFunc(stencil.func, stencil.ref, stencil.mask)
      current.func = stencil.func
      current.ref = stencil.ref
      current.mask = stencil.mask
    }
    if (
      force ||
      current.fail !== stencil.fail ||
      current.zfail !== stencil.zfail ||
      current.zpass !== stencil.zpass
    ) {
      gl.stencilOp(stencil.fail, stencil.zfail, stencil.zpass)
      current.fail = stencil.fail
      current.zfail = stencil.zfail
      current.zpass = stencil.zpass
    }
    if (force || current.writeMask !== stencil.writeMask) {
      gl.stencilMask(stencil.writeMask)
      current.writeMask = stencil.writeMask
    }
  }

  /**
   * Sets the active texture value
   */
  set activeTexture(value: number) {
    if (this.state.activeTextureUnit === value) return
    this.state.activeTextureUnit = value
    this.gl.activeTexture(this.gl.TEXTURE0 + value)
  }
  get activeTexture() {
    return this.state.activeTextureUnit
  }

  /**
   * Binds a given WebGLFramebuffer to a target .
   * @param __namedParameters
   * @param target - A GLenum specifying the binding point (target). Typically only `gl.FRAMEBUFFER` see [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/bindFramebuffer) for more information
   * @param buffer - A WebGLFramebuffer object to bind. If framebuffer is null, then the canvas (which has no WebGLFramebuffer object) is bound.
   * @returns
   */
  bindFramebuffer({
    target = this.gl.FRAMEBUFFER,
    buffer = null
  }: { target?: GLenum; buffer?: WebGLFramebuffer | null } = {}) {
    if (this.state.framebuffer === buffer) return
    this.state.framebuffer = buffer
    this.gl.bindFramebuffer(target, buffer)
  }

  /**
   * Look up and enable a WebGL extension. Each extension is only requested
   * once per context.
   * @param name - The extension's name, e.g. `'EXT_texture_filter_anisotropic'`.
   * @returns The extension object, or null if it isn't supported.
   */
  getExtension<K extends keyof WTCGLExtensionMap>(
    name: K
  ): WTCGLExtensionMap[K] | null
  getExtension(name: string): unknown
  getExtension(name: string): unknown {
    if (!this.#extensions.has(name))
      this.#extensions.set(name, this.gl.getExtension(name))
    return this.#extensions.get(name)
  }

  /**
   * Bind a vertex array object, keeping the renderer's record of the bound
   * geometry in sync.
   * @param vao - The vertex array to bind, or null to unbind.
   * @param key - The `currentGeometry` key this VAO belongs to. Leave it out
   * for VAOs that aren't drawn through `Geometry`, so the next geometry draw
   * rebinds its own.
   */
  bindVertexArray(vao: WebGLVertexArrayObject | null, key = '') {
    this.gl.bindVertexArray(vao)
    this.currentGeometry = key
  }

  /**
   * An array sort for opaque elements
   * @param a - A renderable object for sorting
   * @param b - A renderable object for sorting
   * @returns The number to determine relative position
   */
  sortOpaque(a: Drawable, b: Drawable) {
    if (a.renderOrder !== b.renderOrder) {
      return a.renderOrder - b.renderOrder
    } else if (a.program?.id !== b.program?.id) {
      return (a.program?.id ?? 0) - (b.program?.id ?? 0)
    } else if (a.zDepth !== b.zDepth) {
      return a.zDepth - b.zDepth
    } else {
      return b.id - a.id
    }
  }

  /**
   * An array sort for transparent elements
   * @param a - A renderable object for sorting
   * @param b - A renderable object for sorting
   * @returns The number to determine relative position
   */
  sortTransparent(a: Drawable, b: Drawable) {
    if (a.renderOrder !== b.renderOrder) {
      return a.renderOrder - b.renderOrder
    }
    if (a.zDepth !== b.zDepth) {
      return b.zDepth - a.zDepth
    } else {
      return b.id - a.id
    }
  }

  /**
   * An array sort for UI (no depth) elements
   * @param a - A renderable object for sorting
   * @param b - A renderable object for sorting
   * @returns The number to determine relative position
   */
  sortUI(a: Drawable, b: Drawable) {
    if (a.renderOrder !== b.renderOrder) {
      return a.renderOrder - b.renderOrder
    } else if (a.program?.id !== b.program?.id) {
      return (a.program?.id ?? 0) - (b.program?.id ?? 0)
    } else {
      return b.id - a.id
    }
  }

  /**
   * Retrieves the list of renderable objects sorted by position, explicit render order and applied depth
   * @param __namedParameters
   * @param scene - The root scene to render.
   * @param camera - The camera to use to determine the render list, applies frustum culling etc.
   * @param frustumCull - Whether to apply frustum culling
   * @param sort - Whether to sort the list at all.
   * @returns - An array of renderable objects
   */
  getRenderList({
    scene,
    camera,
    frustumCull,
    sort
  }: {
    scene: Obj
    camera?: Camera
    frustumCull: boolean
    sort: boolean
  }): Drawable[] {
    // A fresh list, as callers may keep it
    return this.#buildRenderList(scene, camera, frustumCull, sort, {
      list: [],
      opaque: [],
      transparent: [],
      ui: []
    })
  }

  // Reused by render() so building the list doesn't allocate every frame
  #lists: RenderLists = { list: [], opaque: [], transparent: [], ui: [] }
  #drawProps: { camera?: Camera } = {}
  // How many render() calls are running, as a draw callback can render too
  #renderDepth = 0
  #viewportSize = new Vec2()
  #viewportPosition = new Vec2()

  /**
   * Fill `lists.list` with the visible drawables in `scene`, culled and
   * sorted as requested. The arrays in `lists` are cleared and reused.
   */
  #buildRenderList(
    scene: Obj,
    camera: Camera | undefined,
    frustumCull: boolean,
    sort: boolean,
    lists: RenderLists
  ): Drawable[] {
    const { list, opaque, transparent, ui } = lists

    if (camera && frustumCull) camera.updateFrustum()

    // Arrays are filled by index and truncated afterwards, rather than
    // emptied with `length = 0`, which would drop their storage and make
    // them regrow every frame
    const count = collectVisible(
      scene,
      frustumCull ? camera : undefined,
      list,
      0
    )
    list.length = count

    if (!sort) return list

    let o = 0
    let t = 0
    let u = 0
    const m = camera?.projectionViewMatrix

    for (let i = 0; i < count; i++) {
      const node = list[i]
      // Split into the 3 render groups
      const { program } = node

      if (program && !program.transparent) {
        opaque[o++] = node
      } else if (program?.depthTest) {
        transparent[t++] = node // depthTest true
      } else {
        ui[u++] = node // depthTest false
      }

      // Only calculate z-depth if renderOrder unset and depthTest is true
      if (node.renderOrder !== 0 || !program?.depthTest || !m) continue

      // z of the object's position in clip space, computed inline rather
      // than with .translation and transformByMat4, which allocate
      const w = node.worldMatrix
      const x = w.a41, y = w.a42, z = w.a43 // prettier-ignore
      const cw = m.a14 * x + m.a24 * y + m.a34 * z + m.a44 || 1
      node.zDepth = (m.a13 * x + m.a23 * y + m.a33 * z + m.a43) / cw
    }
    opaque.length = o
    transparent.length = t
    ui.length = u

    opaque.sort(this.sortOpaque)
    transparent.sort(this.sortTransparent)
    ui.sort(this.sortUI)

    let n = 0
    for (let i = 0; i < o; i++) list[n++] = opaque[i]
    for (let i = 0; i < t; i++) list[n++] = transparent[i]
    for (let i = 0; i < u; i++) list[n++] = ui[i]

    return list
  }

  /**
   * Renders a scene
   * @param __namedParameters
   * @param scene - The renderable object to render.
   * @param camera - The camera to render with. If not supplied will just render as is.
   * @param target - The render target to render to.
   * @param update - Whether to update all of the object worl matrices prior to rendering.
   * @param sort - Whether to sort the objects prior to rendering.
   * @param frustumCull - Whether to apply frustum culling prior to rendering.
   * @param clear - Whether to clear the scene prior to rendering. Only matters if renderer.autoClear is false.
   */
  render({
    scene,
    camera,
    target = null,
    update = true,
    sort = true,
    frustumCull = true,
    clear,
    viewport
  }: RenderOptions) {
    // Nothing can be drawn until the browser restores the context
    if (this.contextLost) return

    if (target === null) {
      // make sure no render target bound so draws to canvas
      this.bindFramebuffer()
      if (viewport) this.setViewport(...viewport)
      else {
        this.#viewportSize.x = this.dimensions.x * this.dpr
        this.#viewportSize.y = this.dimensions.y * this.dpr
        this.setViewport(this.#viewportSize, this.#viewportPosition)
      }
    } else {
      // bind supplied render target and update viewport

      this.bindFramebuffer(target)
      if (viewport) this.setViewport(...viewport)
      else {
        this.#viewportSize.x = target.width
        this.#viewportSize.y = target.height
        this.setViewport(this.#viewportSize, this.#viewportPosition)
      }
    }

    if (clear || (this.autoClear && clear !== false)) {
      // A render target has its own depth and stencil buffers
      const depth = target ? target.depth : this.depth
      const stencil = target ? target.stencil : this.stencil
      // Ensure depth buffer writing is enabled so it can be cleared
      if (depth) {
        this.enable(this.gl.DEPTH_TEST)
        this.depthMask = true
      }
      // Likewise colour and stencil writes, if a program turned them off
      if (this.colour) this.colourWrite = true
      if (stencil && this.#stencilState.writeMask !== 0xff) {
        this.gl.stencilMask(0xff)
        this.#stencilState.writeMask = 0xff
      }
      this.gl.clear(
        (this.colour ? this.gl.COLOR_BUFFER_BIT : 0) |
          (depth ? this.gl.DEPTH_BUFFER_BIT : 0) |
          (stencil ? this.gl.STENCIL_BUFFER_BIT : 0)
      )
    }

    // updates all scene graph matrices
    if (update) scene.updateMatrixWorld()

    // Update camera separately, in case not in scene graph
    if (camera) camera.updateMatrixWorld()

    // Get render list - entails culling and sorting
    // A render started from inside a draw (e.g. to a render target in a
    // mesh callback) gets its own lists, so it doesn't overwrite these
    const nested = this.#renderDepth > 0
    const renderList = this.#buildRenderList(
      scene,
      camera,
      frustumCull,
      sort,
      nested ? { list: [], opaque: [], transparent: [], ui: [] } : this.#lists
    )
    const props = nested ? { camera } : this.#drawProps
    props.camera = camera

    this.#renderDepth++
    try {
      for (let i = 0; i < renderList.length; i++) {
        renderList[i].draw(props as { camera: Camera })
      }
    } finally {
      this.#renderDepth--
      props.camera = undefined
    }
  }
}

/**
 * The stencil state of a new context, as far as the renderer tracks it.
 */
function defaultStencilState() {
  return {
    enabled: false,
    func: 0x0207 as GLenum, // ALWAYS
    ref: 0,
    mask: 0xff,
    writeMask: 0xff,
    fail: 0x1e00 as GLenum, // KEEP
    zfail: 0x1e00 as GLenum,
    zpass: 0x1e00 as GLenum
  }
}

type RenderLists = {
  list: Drawable[]
  opaque: Drawable[]
  transparent: Drawable[]
  ui: Drawable[]
}

/**
 * Write the visible drawables under `node` into `list` from index `count`,
 * skipping invisible subtrees and, when a camera is given, drawables outside
 * its frustum. Returns the new count. A plain recursive function, so
 * traversal doesn't allocate a callback.
 */
function collectVisible(
  node: Obj,
  camera: Camera | undefined,
  list: Drawable[],
  count: number
): number {
  if (!node.visible) return count
  if (
    node instanceof Drawable &&
    (!camera || !node.frustumCulled || camera.frustumIntersects(node))
  ) {
    list[count++] = node
  }
  const children = node.children
  for (let i = 0; i < children.length; i++) {
    count = collectVisible(children[i], camera, list, count)
  }
  return count
}
