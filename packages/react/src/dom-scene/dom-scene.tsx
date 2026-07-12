import { useRef, useState } from 'react'
import { Camera } from 'wtc-gl'

import type { HTMLAttributes, ReactNode } from 'react'
import type { ScrollSceneOptions } from 'wtc-gl'

import { useScrollScene } from '../scroll-renderer/use-scroll-scene'
import { DOMSceneContext } from './dom-scene-context'

import type {
  DOMSceneContextValue,
  DOMSceneFrameCallback
} from './dom-scene-context'

/**
 * Props for {@link DOMScene}. Everything a `<div>` accepts, plus the
 * `ScrollScene` options that make sense here (`camera` and `useViewport` are
 * owned by the component).
 */
export interface DOMSceneProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'children'
> {
  children?: ReactNode
  /** `IntersectionObserver` rootMargin in px - forwarded to the scene. */
  margin?: ScrollSceneOptions['margin']
  clipToViewport?: ScrollSceneOptions['clipToViewport']
  clearOnRender?: ScrollSceneOptions['clearOnRender']
  initializedClass?: ScrollSceneOptions['initializedClass']
  onBeforeRender?: ScrollSceneOptions['onBeforeRender']
  onAfterRender?: ScrollSceneOptions['onAfterRender']
}

/**
 * A DOM element whose bounds host a declaratively-described WebGL scene.
 *
 * Renders a real `<div>` (className/style/etc. pass straight through),
 * registers a `ScrollScene` tracking it with the nearest
 * `ScrollRendererProvider`, and provides context so children like
 * {@link Plane} and {@link Camera} attach GL content to it. Non-GL children
 * render inside the div as normal DOM.
 *
 * Coordinates are CSS pixels: the default camera is orthographic with the
 * element's rect as its extents - origin at the element centre, +Y up,
 * 1 world unit = 1 CSS px. Mount a `<Camera>` child to replace it.
 *
 * @example
 * <DOMScene className="hero">
 *   <Plane width={300} height={200} position={[100, 0, 0]} />
 * </DOMScene>
 */
export function DOMScene({
  children,
  margin,
  clipToViewport,
  clearOnRender,
  initializedClass,
  onBeforeRender,
  onAfterRender,
  ...divProps
}: DOMSceneProps) {
  const divRef = useRef<HTMLDivElement>(null)
  const [ctx, setCtx] = useState<DOMSceneContextValue | null>(null)

  const frameSubs = useRef(new Set<DOMSceneFrameCallback>())
  const orderCounter = useRef(0)
  const defaultCameraRef = useRef<Camera | null>(null)
  const customCameraRef = useRef<Camera | null>(null)
  // Last rect size the default camera was fitted to; 0x0 forces a refit.
  const fittedSize = useRef({ width: 0, height: 0 })

  useScrollScene(
    divRef,
    ({ gl, renderer, scrollScene }) => {
      // Zero-size guard (display:none / pre-layout): 1x1 extents keep the
      // camera orthographic (zero left/right would make it perspective);
      // the per-frame refit corrects on the first visible frame.
      const rect = scrollScene.element.getBoundingClientRect()
      const width = Math.max(rect.width, 1)
      const height = Math.max(rect.height, 1)

      const camera = new Camera({
        left: -width / 2,
        right: width / 2,
        top: height / 2,
        bottom: -height / 2,
        near: 0.1,
        far: 100
      })
      // Plane z=0 sits at -1 in camera space, inside [near, far].
      camera.position.z = 1

      defaultCameraRef.current = camera
      fittedSize.current = { width, height }
      scrollScene.camera = camera
      orderCounter.current = 0

      setCtx({
        gl,
        renderer,
        scrollScene,
        camera,
        subscribeFrame: (callback) => {
          frameSubs.current.add(callback)
          return () => frameSubs.current.delete(callback)
        },
        nextRenderOrder: () => orderCounter.current++,
        setCamera: (custom) => {
          if (custom) {
            if (customCameraRef.current && customCameraRef.current !== custom) {
              console.warn(
                'DOMScene: a <Camera> is already mounted on this scene - the newest one wins.'
              )
            }
            customCameraRef.current = custom
            scrollScene.camera = custom
          } else {
            customCameraRef.current = null
            scrollScene.camera = camera
            // Force a refit next frame in case the element resized while the
            // custom camera was active.
            fittedSize.current = { width: 0, height: 0 }
          }
        }
      })

      return () => {
        customCameraRef.current = null
        defaultCameraRef.current = null
        setCtx(null)
      }
    },
    {
      margin,
      clipToViewport,
      clearOnRender,
      initializedClass,
      // useScrollScene always re-reads the latest option callbacks, so these
      // inline closures never go stale.
      onBeforeRender: (delta, rect) => {
        const camera = defaultCameraRef.current
        if (camera && !customCameraRef.current) {
          const { width, height } = rect
          const fitted = fittedSize.current
          if (
            width > 0 &&
            height > 0 &&
            (width !== fitted.width || height !== fitted.height)
          ) {
            camera.orthographic({
              left: -width / 2,
              right: width / 2,
              top: height / 2,
              bottom: -height / 2
            })
            fittedSize.current = { width, height }
          }
        }

        // Planes sync Euler rotations and dolly cameras ease here - before
        // the renderer updates world matrices, so changes land this frame.
        frameSubs.current.forEach((callback) => callback(delta, rect))

        onBeforeRender?.(delta, rect)
      },
      onAfterRender
    }
  )

  return (
    <div ref={divRef} {...divProps}>
      <DOMSceneContext.Provider value={ctx}>
        {children}
      </DOMSceneContext.Provider>
    </div>
  )
}
