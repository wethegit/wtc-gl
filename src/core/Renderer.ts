import { Vec2, Vec3 } from 'wtc-math'
import {
  WTCGLRendererState,
  WTCGLRenderingContext,
  WTCGLExtensions,
  WTCGLRendererParams
} from './types'
import { Camera } from './Camera'
import { RenderTarget } from './RenderTarget'
import { Obj } from './Object'
import { Drawable } from './Drawable'

// TODO: Handle context loss https://www.khronos.org/webgl/wiki/HandlingContextLost

// Not automatic - devs to use these methods manually
// gl.colorMask( colorMask, colorMask, colorMask, colorMask );
// gl.clearColor( r, g, b, a );
// gl.stencilMask( stencilMask );
// gl.stencilFunc( stencilFunc, stencilRef, stencilMask );
// gl.stencilOp( stencilFail, stencilZFail, stencilZPass );
// gl.clearStencil( stencil );

let ID = 1

class Renderer {
  id: number
  dpr: number
  #dimensions: Vec2

  alpha: boolean
  colour: boolean
  depth: boolean
  stencil: boolean
  premultipliedAlpha: boolean
  autoClear: boolean
  isWebgl2: boolean

  gl: WTCGLRenderingContext
  state: WTCGLRendererState
  extensions: WTCGLExtensions
  parameters: WTCGLRendererParams

  currentGeometry: string

  vertexAttribDivisor: (index: number, divisor: number) => void
  drawArraysInstanced: (
    mode: GLenum,
    first: number,
    count: number,
    instanceCound: number
  ) => void
  drawElementsInstanced: (
    mode: GLenum,
    count: number,
    type: GLenum,
    offset: GLintptr,
    instanceCount: number
  ) => void
  createVertexArray: () => WebGLVertexArrayObject
  bindVertexArray: (vertexArray: WebGLVertexArrayObject) => void
  deleteVertexArray: (vertexArray: WebGLVertexArrayObject) => void
  drawBuffers: (buffers: GLenum[]) => void

  currentProgram: number

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
    this.id = ID++

    // Attempt WebGL2 unless forced to 1, if not supported fallback to WebGL1
    if (webgl === 2)
      this.gl = canvas.getContext('webgl2', attributes) as WTCGLRenderingContext
    this.isWebgl2 = !!this.gl
    if (!this.gl) {
      this.gl =
        <WTCGLRenderingContext>canvas.getContext('webgl', attributes) ||
        <WTCGLRenderingContext>(
          canvas.getContext('experimental-webgl', attributes)
        )
    }
    if (!this.gl) console.error('unable to create webgl context')

    this.gl.renderer = this

    // initialise size values
    this.dimensions = new Vec2(width, height)

    // gl state stores to avoid redundant calls on methods used internally
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

    // Store device parameters
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

  enable(id: GLenum): void {
    if (this.state[id] === true) return
    this.gl.enable(id)
    this.state[id] = true
  }

  disable(id: GLenum): void {
    if (this.state[id] === false) return
    this.gl.disable(id)
    this.state[id] = false
  }

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

  set cullFace(value: GLenum) {
    if (this.state.cullFace === value) return
    this.state.cullFace = value
    this.gl.cullFace(value)
  }

  set frontFace(value: GLenum) {
    if (this.state.frontFace === value) return
    this.state.frontFace = value
    this.gl.frontFace(value)
  }

  set depthMask(value: boolean) {
    if (this.state.depthMask === value) return
    this.state.depthMask = value
    this.gl.depthMask(value)
  }

  set depthFunc(value: GLenum) {
    if (this.state.depthFunc === value) return
    this.state.depthFunc = value
    this.gl.depthFunc(value)
  }

  activeTexture(value: number): void {
    if (this.state.activeTextureUnit === value) return
    this.state.activeTextureUnit = value
    this.gl.activeTexture(this.gl.TEXTURE0 + value)
  }

  bindFramebuffer({
    target = this.gl.FRAMEBUFFER,
    buffer = null
  }: { target?: GLenum; buffer?: WebGLFramebuffer | null } = {}) {
    if (this.state.framebuffer === buffer) return
    this.state.framebuffer = buffer
    this.gl.bindFramebuffer(target, buffer)
  }

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

  sortUI(a: Drawable, b: Drawable) {
    if (a.renderOrder !== b.renderOrder) {
      return a.renderOrder - b.renderOrder
    } else if (a.program.id !== b.program.id) {
      return a.program.id - b.program.id
    } else {
      return b.id - a.id
    }
  }

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
    camera: Camera
    target: RenderTarget | null
    update: boolean
    sort: boolean
    frustumCull: boolean
    clear: boolean
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
