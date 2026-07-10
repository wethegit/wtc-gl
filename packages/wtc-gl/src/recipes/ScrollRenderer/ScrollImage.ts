import type { WTCGLRenderingContext } from '../../types'
import { Uniform } from '../../core/Uniform'
import { Texture } from '../../core/Texture'
import { ScrollScene, type ScrollSceneOptions } from './ScrollScene'

/** Options passed to the {@link ScrollImage} constructor. */
export interface ScrollImageOptions extends ScrollSceneOptions {
  /** The GL rendering context from the parent {@link ScrollRenderer}. */
  gl: WTCGLRenderingContext
  /**
   * The image element to upload as `u_image`. When omitted, `element` must be
   * an `HTMLImageElement` and is used directly.
   */
  image?: HTMLImageElement
}

/**
 * A {@link ScrollScene} variant that automatically loads an `HTMLImageElement`
 * into a GPU texture and exposes it as two additional auto-managed uniforms:
 *
 * | Uniform       | Type        | Description |
 * |---------------|-------------|-------------|
 * | `u_image`     | `sampler2D` | The image texture. |
 * | `u_imageSize` | `vec2`      | Natural pixel dimensions of the source image. |
 *
 * If the image has not yet loaded when the constructor runs, both uniforms are
 * updated automatically once the `load` event fires.
 *
 * @example
 * const imgEl = document.querySelector('img.hero')
 * const drawable = new Drawable(gl)
 * const scene = new ScrollImage({ gl, element: imgEl, scene: drawable })
 * new Mesh(gl, {
 *   geometry: new Plane(gl, { widthSegments: 30, heightSegments: 22 }),
 *   program: new Program(gl, {
 *     vertex: clothVert,
 *     fragment: clothFrag,
 *     uniforms: { ...scene.uniforms },
 *   }),
 * }).setParent(drawable)
 * renderer.addScene(scene)
 */
export class ScrollImage extends ScrollScene {
  /** The `sampler2D` uniform pointing at the image texture. */
  u_image: Uniform
  /** The `vec2` uniform containing the image's natural pixel dimensions. */
  u_imageSize: Uniform
  /** The underlying {@link Texture} wrapping the source image element. */
  texture: Texture

  constructor({ gl, image, element, ...rest }: ScrollImageOptions) {
    super({ element, ...rest })

    const imgEl = image ?? (element as HTMLImageElement)

    this.texture = new Texture(gl, {
      generateMipmaps: false,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE
    })

    this.u_image = new Uniform({
      name: 'u_image',
      value: this.texture,
      kind: 'texture'
    })
    this.u_imageSize = new Uniform({
      name: 'u_imageSize',
      value: [0, 0],
      kind: 'float_vec2'
    })

    this.uniforms.u_image = this.u_image
    this.uniforms.u_imageSize = this.u_imageSize

    const applyImage = () => {
      this.texture.image = imgEl
      this.texture.needsUpdate = true
      this.u_imageSize.value = [imgEl.naturalWidth, imgEl.naturalHeight]
    }

    if (imgEl.complete && imgEl.naturalWidth > 0) {
      applyImage()
    } else {
      imgEl.addEventListener('load', applyImage, { once: true })
    }
  }
}
