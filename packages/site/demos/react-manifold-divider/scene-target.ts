import { RenderTarget } from 'wtc-gl'
import type { WTCGLRenderingContext } from 'wtc-gl'

export interface SceneTarget {
  target: RenderTarget
  depth: WebGLRenderbuffer
}

// Scene G-buffer:
//   textures[0]: rgb lit colour, a linear view depth (0 = empty)
//   textures[1]: xyz view-space normal
// RenderTarget attaches a 16-bit depth texture, which z-fights on coplanar
// faces, so it's swapped for a 24-bit depth renderbuffer.
// Needs EXT_color_buffer_float.
export function createSceneTarget(
  gl: WTCGLRenderingContext,
  width: number,
  height: number
): SceneTarget {
  const target = new RenderTarget(gl, {
    width,
    height,
    colour: 2,
    type: gl.FLOAT,
    format: gl.RGBA,
    internalFormat: gl.RGBA32F,
    minFilter: gl.NEAREST,
    magFilter: gl.NEAREST
  })

  target.depthTexture?.remove()
  target.depthTexture = null
  const depth = gl.createRenderbuffer()!
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth)
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height)
  gl.renderer.bindFramebuffer({ buffer: target.buffer })
  gl.framebufferRenderbuffer(
    gl.FRAMEBUFFER,
    gl.DEPTH_ATTACHMENT,
    gl.RENDERBUFFER,
    depth
  )
  gl.renderer.bindFramebuffer()

  return { target, depth }
}

export function disposeSceneTarget(
  gl: WTCGLRenderingContext,
  { target, depth }: SceneTarget
) {
  target.remove()
  gl.deleteRenderbuffer(depth)
}
