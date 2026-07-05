import { useEffect, useRef, type RefObject } from 'react'
import { Drawable, ScrollImage, type ScrollImageOptions } from 'wtc-gl'

import { useScrollRenderer } from './scroll-renderer-provider'
import type { ScrollSceneSetup } from './use-scroll-scene'

/**
 * Options for {@link useScrollImage}. Everything from `ScrollImageOptions`
 * except `gl` (taken from the provider), `element` (taken from the ref) and
 * `scene` (a root `Drawable` is created for you).
 *
 * `onBeforeRender`/`onAfterRender` may change between renders - the latest
 * ones are always called. All other options are captured when the scene is
 * created.
 */
export type UseScrollImageOptions = Omit<
  ScrollImageOptions,
  'gl' | 'element' | 'scene'
>

/**
 * Registers a {@link ScrollImage} scene with the nearest
 * {@link ScrollRendererProvider}: the referenced `<img>` is uploaded to a GPU
 * texture and exposed to your programs via the `u_image` / `u_imageSize`
 * uniforms, alongside the standard `ScrollScene` uniforms.
 *
 * Pass a ref to an `<img>` element, or a ref to any element plus an `image`
 * in `options`.
 *
 * @example
 * function ClothImage({ src }: { src: string }) {
 *   const ref = useRef<HTMLImageElement>(null)
 *
 *   useScrollImage(ref, ({ gl, scrollScene }) => {
 *     const program = new Program(gl, {
 *       vertex,
 *       fragment,
 *       uniforms: { ...scrollScene.uniforms }
 *     })
 *     new Mesh(gl, {
 *       geometry: new Plane(gl, { widthSegments: 30, heightSegments: 22 }),
 *       program
 *     }).setParent(scrollScene.scene)
 *   })
 *
 *   return <img ref={ref} src={src} alt="" />
 * }
 *
 * @param elementRef - Ref to the tracked element - an `<img>` unless `options.image` is set.
 * @param setup - Builds the scene's GL content; may return a cleanup function.
 * @param options - Forwarded to the `ScrollImage` constructor.
 * @returns A ref holding the live `ScrollImage`, or `null` before creation.
 */
export function useScrollImage(
  elementRef: RefObject<HTMLElement | null>,
  setup?: ScrollSceneSetup<ScrollImage>,
  options: UseScrollImageOptions = {}
): RefObject<ScrollImage | null> {
  const renderer = useScrollRenderer()
  const sceneRef = useRef<ScrollImage | null>(null)

  const setupRef = useRef(setup)
  const optionsRef = useRef(options)
  useEffect(() => {
    setupRef.current = setup
    optionsRef.current = options
  })

  useEffect(() => {
    const element = elementRef.current
    if (!renderer || !element) return

    const scrollScene = new ScrollImage({
      gl: renderer.gl,
      element,
      scene: new Drawable(renderer.gl),
      ...optionsRef.current,
      onBeforeRender: (delta, rect) =>
        optionsRef.current.onBeforeRender?.(delta, rect),
      onAfterRender: (delta, rect) =>
        optionsRef.current.onAfterRender?.(delta, rect)
    })

    const cleanup = setupRef.current?.({
      gl: renderer.gl,
      renderer,
      scrollScene
    })

    renderer.addScene(scrollScene)
    sceneRef.current = scrollScene

    return () => {
      renderer.removeScene(scrollScene)
      scrollScene.destroy()
      cleanup?.()
      sceneRef.current = null
    }
  }, [renderer, elementRef])

  return sceneRef
}
