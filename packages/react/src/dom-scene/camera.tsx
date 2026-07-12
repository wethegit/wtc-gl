import { forwardRef, useEffect, useRef } from 'react'
import { Camera as WTCCamera, DollyCamera, Vec3 } from 'wtc-gl'

import type { DollyCameraOptions } from 'wtc-gl'

import { useDOMSceneContext } from './dom-scene-context'

/** Props for {@link Camera}. */
export interface CameraProps {
  /**
   * Bring your own camera (including a `DollyCamera`). Takes precedence over
   * every construction prop - the caller owns its configuration and (for a
   * dolly) its event-handler lifecycle; the component only installs it on the
   * scene and, for dollys, drives `update()` each frame.
   */
  instance?: WTCCamera
  /** @default 'perspective' */
  type?: 'perspective' | 'orthographic' | 'dolly'
  near?: number
  far?: number
  /** Perspective/dolly field of view in degrees. @default 45 */
  fov?: number
  /**
   * Perspective aspect ratio. By default it tracks the element's aspect and
   * updates on resize; setting an explicit value opts out of the sync.
   */
  aspect?: number
  /**
   * Orthographic extents in CSS px. By default they track the element's rect
   * (matching the scene's default camera); explicit values opt out.
   */
  left?: number
  right?: number
  top?: number
  bottom?: number
  zoom?: number
  /**
   * Camera position in scene units. Perspective/dolly cameras default to the
   * "pixel-fit" distance - `z = (elementHeight / 2) / tan(fov / 2)` - so
   * 1 unit ≈ 1 CSS px at z=0. Computed once at creation.
   */
  position?: [number, number, number]
  /** Point the camera at a scene position (also the dolly orbit target). */
  lookAt?: [number, number, number]
  /**
   * `type="dolly"` only: forwarded to the `DollyCamera` constructor.
   * `element` (where pointer/wheel handlers attach) defaults to the
   * DOMScene's own div.
   */
  dolly?: Partial<DollyCameraOptions>
}

/**
 * Replaces the default camera of the nearest {@link DOMScene} while mounted;
 * unmounting restores the default CSS-px orthographic camera. One `<Camera>`
 * per scene. Renders nothing to the DOM.
 *
 * The ref receives the raw camera instance for imperative control.
 *
 * @example
 * <DOMScene className="hero">
 *   <Camera type="dolly" />
 *   <Plane width={300} height={200} />
 * </DOMScene>
 */
export const Camera = forwardRef<WTCCamera, CameraProps>(function Camera(
  {
    instance,
    type = 'perspective',
    near,
    far,
    fov = 45,
    aspect,
    left,
    right,
    top,
    bottom,
    zoom,
    position,
    lookAt,
    dolly
  },
  ref
) {
  const ctx = useDOMSceneContext()

  // Construction props are captured when the camera is created; changing
  // them without changing `type`/`instance` does not recreate it - use the
  // ref for live tweaks.
  const latest = useRef({
    near,
    far,
    fov,
    aspect,
    left,
    right,
    top,
    bottom,
    zoom,
    position,
    lookAt,
    dolly
  })
  useEffect(() => {
    latest.current = {
      near,
      far,
      fov,
      aspect,
      left,
      right,
      top,
      bottom,
      zoom,
      position,
      lookAt,
      dolly
    }
  })

  useEffect(() => {
    if (!ctx) return
    const { scrollScene } = ctx
    const props = latest.current

    const rect = scrollScene.element.getBoundingClientRect()
    const elWidth = Math.max(rect.width, 1)
    const elHeight = Math.max(rect.height, 1)

    const autoAspect = props.aspect === undefined
    const autoExtents =
      props.left === undefined &&
      props.right === undefined &&
      props.top === undefined &&
      props.bottom === undefined

    let camera: WTCCamera
    let ownsDolly = false

    if (instance) {
      camera = instance
    } else if (type === 'orthographic') {
      camera = new WTCCamera({
        near: props.near ?? 0.1,
        far: props.far ?? 100,
        left: props.left ?? -elWidth / 2,
        right: props.right ?? elWidth / 2,
        top: props.top ?? elHeight / 2,
        bottom: props.bottom ?? -elHeight / 2,
        zoom: props.zoom
      })
      camera.position.z = 1
    } else {
      // Zero extents select the perspective projection.
      const cameraOptions = {
        near: props.near ?? 0.1,
        far: props.far ?? 10000,
        fov: props.fov,
        aspect: props.aspect ?? elWidth / elHeight,
        zoom: props.zoom,
        left: 0,
        right: 0,
        top: 0,
        bottom: 0
      }
      if (type === 'dolly') {
        camera = new DollyCamera(
          {
            element: scrollScene.element,
            ...(props.lookAt ? { target: new Vec3(...props.lookAt) } : {}),
            ...props.dolly
          },
          cameraOptions
        )
        ownsDolly = true
      } else {
        camera = new WTCCamera(cameraOptions)
      }
      // Pixel-fit: at this distance, 1 scene unit ≈ 1 CSS px at z=0.
      camera.position.z =
        elHeight / 2 / Math.tan(((props.fov ?? 45) / 2) * (Math.PI / 180))
    }

    if (!instance) {
      if (props.position) camera.position.reset(...props.position)
      if (camera instanceof DollyCamera) {
        // Re-derive the orbit spherical coords from the final position.
        camera.forcePosition()
      } else if (props.lookAt) {
        camera.lookAt(new Vec3(...props.lookAt))
      }
    }

    ctx.setCamera(camera)

    let lastFit = { width: elWidth, height: elHeight }
    const unsubscribe = ctx.subscribeFrame((_delta, frameRect) => {
      // Dolly easing/inertia - nothing else drives it.
      if (camera instanceof DollyCamera) camera.update()

      if (instance) return
      const { width, height } = frameRect
      if (width <= 0 || height <= 0) return
      if (type === 'orthographic' && autoExtents) {
        if (width !== lastFit.width || height !== lastFit.height) {
          camera.orthographic({
            left: -width / 2,
            right: width / 2,
            top: height / 2,
            bottom: -height / 2
          })
          lastFit = { width, height }
        }
      } else if (type !== 'orthographic' && autoAspect) {
        if (width !== lastFit.width || height !== lastFit.height) {
          camera.perspective({ aspect: width / height })
          lastFit = { width, height }
        }
      }
    })

    if (typeof ref === 'function') ref(camera)
    else if (ref) ref.current = camera

    return () => {
      if (typeof ref === 'function') ref(null)
      else if (ref) ref.current = null
      unsubscribe()
      ctx.setCamera(null)
      if (ownsDolly) (camera as DollyCamera).removeHandlers()
    }
    // `ref` is deliberately not a dependency: an inline callback ref would
    // otherwise tear down and rebuild the camera on every render.
  }, [ctx, instance, type])

  return null
})
