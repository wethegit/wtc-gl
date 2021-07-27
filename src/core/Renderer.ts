import { Vec2, Vec3 } from 'wtc-math'
import {
  WTCGLRendererState,
  WTCGLRenderingContext,
  WTCGLExtensions,
  WTCGLRendererParams
} from '../types'
import { Camera } from './Camera'
import { RenderTarget } from './RenderTarget'
import { Obj } from './Object'
import { Drawable } from './Drawable'

let ID = 1
/**
 * Create a renderer. This is responsible for bringing together the whole state and, eventually, rendering to screen.
 */
class Renderer {
  /**
   * The pixel aspect ratio of the renderer.
   * @default window.devicePixelRatio or 2, whichever is smaller.
   */
  dpr: number
  /**
   * The dimensions of the renderer
   */
  #dimensions: Vec2

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
  /**
   * Whether the context we've retrieved is webGL2 or not.
   */
  isWebgl2: boolean

  /**
   * The WTCGL rendering context.
   */
  gl: WTCGLRenderingContext
  /**
   * The rendering state. Allows us to avoid redundant calls on methods used internally
   */
  state: WTCGLRendererState
  /**
   * Stores the enabled extensions
   */
  extensions: WTCGLExtensions
  /**
   * Stored device parameters such as max allowable units etc.
   */
  parameters: WTCGLRendererParams

  /**
   * Stores the current geometry being rendered. Used to otimise geo rendering.
   */
  currentGeometry: string

  /**
   * The WebGL2RenderingContext.vertexAttribDivisor() method of the WebGL 2 API modifies the rate at which generic vertex attributes advance when rendering multiple instances of primitives with
   */
  vertexAttribDivisor: (index: number, divisor: number) => void
  /**
   * The WebGL2RenderingContext.drawArraysInstanced() method of the WebGL 2 API renders primitives from array data like the gl.drawArrays() method. In addition, it can execute multiple instances of the range of elements.
   */
  drawArraysInstanced: (
    mode: GLenum,
    first: number,
    count: number,
    instanceCound: number
  ) => void
  /**
   * The WebGL2RenderingContext.drawElementsInstanced() method of the WebGL 2 API renders primitives from array data like the gl.drawElements() method. In addition, it can execute multiple instances of a set of elements.
   */
  drawElementsInstanced: (
    mode: GLenum,
    count: number,
    type: GLenum,
    offset: GLintptr,
    instanceCount: number
  ) => void
  /**
   * The WebGL2RenderingContext.createVertexArray() method of the WebGL 2 API creates and initializes a WebGLVertexArrayObject object that represents a vertex array object (VAO) pointing to vertex array data and which provides names for different sets of vertex data.
   */
  createVertexArray: () => WebGLVertexArrayObject
  /**
   * The WebGL2RenderingContext.bindVertexArray() method of the WebGL 2 API binds a passed WebGLVertexArrayObject object to the buffer.
   */
  bindVertexArray: (vertexArray: WebGLVertexArrayObject) => void
  /**
   * The WebGL2RenderingContext.deleteVertexArray() method of the WebGL 2 API deletes a given WebGLVertexArrayObject object.
   */
  deleteVertexArray: (vertexArray: WebGLVertexArrayObject) => void
  /**
   * The WebGL2RenderingContext.drawBuffers() method of the WebGL 2 API defines draw buffers to which fragment colors are written into. The draw buffer settings are part of the state of the currently bound framebuffer or the drawingbuffer if no framebuffer is bound.
   */
  drawBuffers: (buffers: GLenum[]) => void

  // Allows programs to optimise by determine if they're the currently rendering program and skipping some steps
  currentProgram: number

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
   * @param webgl - The webGL version to try to use - 1, or 2
   */
  constructor({
    canvas = document.createElement('canvas'),
    width = 300,
    height = 150,
    dpr = Math.min(window.devicePixelRatio, 2),
    alpha = false,
    depth = true,
    stencil = false,
    antialias = false,
    premultipliedAlpha = false,
    preserveDrawingBuffer = false,
    powerPreference = 'default',
    autoClear = true,
    webgl = 2
  }: {
    canvas?: HTMLCanvasElement
    width?: number
    height?: number
    dpr?: number
    alpha?: boolean
    depth?: boolean
    stencil?: boolean
    antialias?: boolean
    premultipliedAlpha?: boolean
    preserveDrawingBuffer?: boolean
    powerPreference?: string
    autoClear?: boolean
    webgl?: number
  } = {}) {
    const attributes = {
      alpha,
      depth,
      stencil,
      antialias,
      premultipliedAlpha,
      preserveDrawingBuffer,
      powerPreference
    }
    this.dpr = dpr
    this.alpha = alpha
    this.colour = true
    this.depth = depth
    this.stencil = stencil
    this.premultipliedAlpha = premultipliedAlpha
    this.autoClear = autoClear

    if (webgl === 2)
      this.gl = canvas.getContext('webgl2', attributes) as WTCGLRenderingContext
    this.isWebgl2 = !!this.gl
    if (!this.gl) {
      this.gl = canvas.getContext('webgl', attributes) as WTCGLRenderingContext
    }
    if (!this.gl) {
      console.error('unable to create webgl context')
      return this
    }

    this.gl.renderer = this

    // initialise size values
    this.dimensions = new Vec2(width, height)

    this.state = {
      blendFunc: { src: this.gl.ONE, dst: this.gl.ZERO },
      blendEquation: { modeRGB: this.gl.FUNC_ADD },
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

    // store requested extensions
    this.extensions = {}

    // Initialise extra format types
    if (this.isWebgl2) {
      this.getExtension('EXT_color_buffer_float')
      this.getExtension('OES_texture_float_linear')
    } else {
      this.getExtension('OES_texture_float')
      this.getExtension('OES_texture_float_linear')
      this.getExtension('OES_texture_half_float')
      this.getExtension('OES_texture_half_float_linear')
      this.getExtension('OES_element_index_uint')
      this.getExtension('OES_standard_derivatives')
      this.getExtension('EXT_sRGB')
      this.getExtension('WEBGL_depth_texture')
      this.getExtension('WEBGL_draw_buffers')
    }

    // Create method aliases using extension (WebGL1) or native if available (WebGL2)
    this.vertexAttribDivisor = this.getExtension(
      'ANGLE_instanced_arrays',
      'vertexAttribDivisor',
      'vertexAttribDivisorANGLE'
    )
    this.drawArraysInstanced = this.getExtension(
      'ANGLE_instanced_arrays',
      'drawArraysInstanced',
      'drawArraysInstancedANGLE'
    )
    this.drawElementsInstanced = this.getExtension(
      'ANGLE_instanced_arrays',
      'drawElementsInstanced',
      'drawElementsInstancedANGLE'
    )
    this.createVertexArray = this.getExtension(
      'OES_vertex_array_object',
      'createVertexArray',
      'createVertexArrayOES'
    )
    this.bindVertexArray = this.getExtension(
      'OES_vertex_array_object',
      'bindVertexArray',
      'bindVertexArrayOES'
    )
    this.deleteVertexArray = this.getExtension(
      'OES_vertex_array_object',
      'deleteVertexArray',
      'deleteVertexArrayOES'
    )
    this.drawBuffers = this.getExtension(
      'WEBGL_draw_buffers',
      'drawBuffers',
      'drawBuffersWEBGL'
    )

    this.parameters = {
      maxTextureUnits: this.gl.getParameter(
        this.gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS
      ),
      maxAnisotropy: this.getExtension('EXT_texture_filter_anisotropic')
        ? this.gl.getParameter(
            this.getExtension('EXT_texture_filter_anisotropic')
              .MAX_TEXTURE_MAX_ANISOTROPY_EXT
          )
        : 0
    }
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
    if (this.state[id] === true) return
    this.gl.enable(id)
    this.state[id] = true
  }

  /**
   * Disables specific WebGL capabilities for this context.
   * @param id - The ID of the capability to enable
   */
  disable(id: GLenum): void {
    if (this.state[id] === false) return
    this.gl.disable(id)
    this.state[id] = false
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
    srcAlpha: GLenum,
    dstAlpha: GLenum
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
    if (srcAlpha !== undefined)
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
  get cullFace() {
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
  get frontFace() {
    return this.state.frontFace
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
  get depthFunc() {
    return this.state.depthFunc
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
   * Finds and enables a webGL extension and, if it has a corresponding function, returns that.
   * @param extension - The extension identifier.
   * @param webgl2Func -The name of the webGL2 function to return.
   * @param extFunc - The name of the webGL1 functiont to return.
   * @returns - A WebGL function, bound to this renderer or null (if no function exists)
   */
  getExtension(extension: string, webgl2Func?: string, extFunc?: string): any {
    // if webgl2 function supported, return func bound to gl context
    if (webgl2Func && this.gl[webgl2Func])
      return this.gl[webgl2Func].bind(this.gl)

    // fetch extension once only
    if (!this.extensions[extension]) {
      this.extensions[extension] = this.gl.getExtension(extension)
    }

    // return extension if no function requested
    if (!webgl2Func) return this.extensions[extension]

    // Return null if extension not supported
    if (!this.extensions[extension]) return null

    // return extension function, bound to extension
    return this.extensions[extension][extFunc].bind(this.extensions[extension])
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
    } else if (a.program.id !== b.program.id) {
      return a.program.id - b.program.id
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
    } else if (a.program.id !== b.program.id) {
      return a.program.id - b.program.id
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
    camera: Camera
    frustumCull: boolean
    sort: boolean
  }): Drawable[] {
    let renderList = []

    if (camera && frustumCull) camera.updateFrustum()

    // Get visible
    scene.traverse((node: Obj): boolean | null => {
      if (!node.visible) return true
      if (!(node instanceof Drawable)) return

      if (frustumCull && node.frustumCulled && camera) {
        if (!camera.frustumIntersects(node)) return
      }

      renderList.push(node)
    })

    if (sort) {
      const opaque = []
      const transparent = [] // depthTest true
      const ui = [] // depthTest false

      renderList.forEach((node) => {
        // Split into the 3 render groups
        if (!node.program.transparent) {
          opaque.push(node)
        } else if (node.program.depthTest) {
          transparent.push(node)
        } else {
          ui.push(node)
        }

        // Only calculate z-depth if renderOrder unset and depthTest is true
        if (node.renderOrder !== 0 || !node.program.depthTest || !camera) return

        // update z-depth
        const translation = node.worldMatrix.translation()
        translation.transformByMat4(camera.projectionViewMatrix)
        node.zDepth = translation.z
      })

      opaque.sort(this.sortOpaque)
      transparent.sort(this.sortTransparent)
      ui.sort(this.sortUI)

      renderList = opaque.concat(transparent, ui)
    }

    return renderList
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
    clear
  }: {
    scene: Obj
    camera?: Camera
    target?: RenderTarget | null
    update?: boolean
    sort?: boolean
    frustumCull?: boolean
    clear?: boolean
  }) {
    if (target === null) {
      // make sure no render target bound so draws to canvas
      this.bindFramebuffer()
      this.setViewport(this.dimensions.scaleNew(this.dpr), new Vec2())
    } else {
      // bind supplied render target and update viewport

      this.bindFramebuffer(target)
      this.setViewport(new Vec2(target.width, target.height), new Vec2())
    }

    if (clear || (this.autoClear && clear !== false)) {
      // Ensure depth buffer writing is enabled so it can be cleared
      if (this.depth && (!target || target.depth)) {
        this.enable(this.gl.DEPTH_TEST)
        this.depthMask = true
      }
      this.gl.clear(
        (this.colour ? this.gl.COLOR_BUFFER_BIT : 0) |
          (this.depth ? this.gl.DEPTH_BUFFER_BIT : 0) |
          (this.stencil ? this.gl.STENCIL_BUFFER_BIT : 0)
      )
    }

    // updates all scene graph matrices
    if (update) scene.updateMatrixWorld()

    // Update camera separately, in case not in scene graph
    if (camera) camera.updateMatrixWorld()

    // Get render list - entails culling and sorting
    const renderList = this.getRenderList({ scene, camera, frustumCull, sort })

    renderList.forEach((node) => {
      node.draw({ camera })
    })
  }
}

export { Renderer }
