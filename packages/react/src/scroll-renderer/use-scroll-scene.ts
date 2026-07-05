import { useEffect, useRef, type RefObject } from 'react'
import {
  Drawable,
  ScrollRenderer,
  ScrollScene,
  type ScrollSceneOptions,
  type WTCGLRenderingContext
} from 'wtc-gl'

import { useScrollRenderer } from './scroll-renderer-provider'

/** Context passed to a {@link ScrollSceneSetup} function. */
export interface ScrollSceneSetupContext<S extends ScrollScene = ScrollScene> {
  /** The GL rendering context. */
  gl: WTCGLRenderingContext
  /** The renderer from the nearest {@link ScrollRendererProvider}. */
  renderer: ScrollRenderer
  /**
   * The scene, constructed and ready: attach meshes to `scrollScene.scene`
   * and spread `scrollScene.uniforms` into your programs.
   */
  scrollScene: S
}

/**
 * Builds the GL content for a scene. Runs once when the scene is created -
 * after the `ScrollScene` is constructed (so its auto-managed uniforms are
 * available) and before it is registered with the renderer.
 *
 * Like a `useEffect` callback, it may return a cleanup function, which is
 * called when the scene is removed - free any GL resources you created there.
 */
export type ScrollSceneSetup<S extends ScrollScene = ScrollScene> = (
  context: ScrollSceneSetupContext<S>
) => void | (() => void)

/**
 * Options for {@link useScrollScene}. Everything from `ScrollSceneOptions`
 * except `element` (taken from the ref) and `scene` (a root `Drawable` is
 * created for you).
 *
 * `onBeforeRender`/`onAfterRender` may change between renders - the latest
 * ones are always called. All other options are captured when the scene is
 * created.
 */
export type UseScrollSceneOptions = Omit<
  ScrollSceneOptions,
  'element' | 'scene'
>

/**
 * Registers a {@link ScrollScene} anchored to a DOM element with the nearest
 * {@link ScrollRendererProvider}.
 *
 * The scene is created once the renderer and element are available, and
 * removed (and destroyed) on unmount.
 *
 * @example
 * function HeroSection() {
 *   const ref = useRef<HTMLDivElement>(null)
 *
 *   useScrollScene(ref, ({ gl, scrollScene }) => {
 *     const program = new Program(gl, {
 *       vertex,
 *       fragment,
 *       uniforms: { ...scrollScene.uniforms }
 *     })
 *     new Mesh(gl, { geometry: new Triangle(gl), program }).setParent(
 *       scrollScene.scene
 *     )
 *   })
 *
 *   return <div ref={ref} className="hero" />
 * }
 *
 * @param elementRef - Ref to the DOM element the scene tracks.
 * @param setup - Builds the scene's GL content; may return a cleanup function.
 * @param options - Forwarded to the `ScrollScene` constructor.
 * @returns A ref holding the live `ScrollScene`, or `null` before creation.
 */
export function useScrollScene(
  elementRef: RefObject<HTMLElement | null>,
  setup?: ScrollSceneSetup,
  options: UseScrollSceneOptions = {}
): RefObject<ScrollScene | null> {
  const renderer = useScrollRenderer()
  const sceneRef = useRef<ScrollScene | null>(null)

  // Latest-value refs: the scene is only created once, but per-frame
  // callbacks should never go stale.
  const setupRef = useRef(setup)
  const optionsRef = useRef(options)
  useEffect(() => {
    setupRef.current = setup
    optionsRef.current = options
  })

  useEffect(() => {
    const element = elementRef.current
    if (!renderer || !element) return

    const scrollScene = new ScrollScene({
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
