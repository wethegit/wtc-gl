import { createContext, useContext } from 'react'

import type {
  Camera,
  ScrollRenderer,
  ScrollScene,
  WTCGLRenderingContext
} from 'wtc-gl'

/** A per-frame callback registered via {@link DOMSceneContextValue.subscribeFrame}. */
export type DOMSceneFrameCallback = (delta: number, rect: DOMRect) => void

/**
 * Internals of the nearest {@link DOMScene}, for building custom scene
 * children. `null` while the scene is being created (the provider's renderer
 * arrives after first paint) or when no `DOMScene` is present.
 */
export interface DOMSceneContextValue {
  /** WebGL context. */
  gl: WTCGLRenderingContext
  /** The renderer from the nearest `ScrollRendererProvider`. */
  renderer: ScrollRenderer
  /** The scene tracking the DOMScene's element. */
  scrollScene: ScrollScene
  /**
   * The scene's default orthographic camera - extents follow the element's
   * CSS-pixel rect, so 1 world unit = 1 CSS px, origin at the element centre,
   * +Y up. A mounted `<Camera>` replaces it on the scene but this reference
   * always points at the default.
   */
  camera: Camera
  /**
   * Register a callback run every frame before the scene renders (and before
   * scene-graph matrices update, so transform changes made here land in the
   * same frame). Returns an unsubscribe function.
   */
  subscribeFrame: (callback: DOMSceneFrameCallback) => () => void
  /** Next default `renderOrder` - later registrations stack on top. */
  nextRenderOrder: () => number
  /**
   * Install a custom camera on the scene (used by `<Camera>`); pass `null`
   * to restore the default orthographic camera.
   */
  setCamera: (camera: Camera | null) => void
}

export const DOMSceneContext = createContext<DOMSceneContextValue | null>(null)

/**
 * The internals of the nearest {@link DOMScene}, or `null` while it
 * initializes or when no `DOMScene` is present. An escape hatch for building
 * custom scene children beyond `<Plane>`.
 */
export function useDOMSceneContext(): DOMSceneContextValue | null {
  return useContext(DOMSceneContext)
}
