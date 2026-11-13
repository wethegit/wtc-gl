import type { WTCGLRenderingContext } from '../types'
import { Texture } from './Texture'

const blanks = new WeakMap<WTCGLRenderingContext, Texture>()

/**
 * A white pixel per context, bound in place of a missing map: a sampler
 * always needs a texture, and white leaves a colour it multiplies unchanged.
 */
export function blankTexture(gl: WTCGLRenderingContext): Texture {
  let texture = blanks.get(gl)
  if (!texture) {
    texture = new Texture(gl, {
      data: new Uint8Array([255, 255, 255, 255]),
      width: 1,
      height: 1,
      generateMipmaps: false
    })
    blanks.set(gl, texture)
  }
  return texture
}
