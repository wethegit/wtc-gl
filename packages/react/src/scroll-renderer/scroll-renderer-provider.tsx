import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ScrollRenderer, type ScrollRendererOptions } from 'wtc-gl'

const ScrollRendererContext = createContext<ScrollRenderer | null>(null)

/** Props for {@link ScrollRendererProvider}. */
export interface ScrollRendererProviderProps {
  children?: ReactNode
  /**
   * Props forwarded to the underlying `Renderer`. `canvas` is always the
   * provider's own canvas element and cannot be overridden.
   *
   * Captured once on mount - changing this prop after mount has no effect.
   */
  rendererProps?: Omit<
    NonNullable<ScrollRendererOptions['rendererProps']>,
    'canvas'
  >
  onBeforeRender?: (delta: number) => void
  onAfterRender?: (delta: number) => void
  /**
   * Whether the render loop runs.
   *
   * @default true
   */
  playing?: boolean
  /**
   * Class applied to the canvas element. When set, the default
   * fixed-fullscreen inline styles are *not* applied - the class is expected
   * to position the canvas itself.
   */
  className?: string
  /** Inline styles merged over the default fixed-fullscreen canvas styles. */
  style?: CSSProperties
}

const defaultCanvasStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  zIndex: 0
}

/**
 * Owns a {@link ScrollRenderer} and its fixed, full-viewport `<canvas>`.
 *
 * Mount one per page (typically at the layout level) and register scenes from
 * descendant components with {@link useScrollScene} / {@link useScrollImage}.
 *
 * The renderer is created in an effect after first paint, so descendants
 * receive `null` from {@link useScrollRenderer} on the first render pass -
 * scene hooks handle this by waiting for the renderer before registering.
 *
 * @example
 * <ScrollRendererProvider>
 *   <HeroSection />
 *   <FeatureSection />
 * </ScrollRendererProvider>
 */
export function ScrollRendererProvider({
  children,
  rendererProps,
  onBeforeRender,
  onAfterRender,
  playing = true,
  className,
  style
}: ScrollRendererProviderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [renderer, setRenderer] = useState<ScrollRenderer | null>(null)

  // Callback props change identity on every consumer render. The renderer is created once and
  // holds stable wrappers that read these refs at call time, so each frame runs the latest
  // callback (fresh closures) without tearing down the renderer.
  const onBeforeRenderRef = useRef(onBeforeRender)
  const onAfterRenderRef = useRef(onAfterRender)
  useEffect(() => {
    onBeforeRenderRef.current = onBeforeRender
    onAfterRenderRef.current = onAfterRender
  })

  const rendererPropsRef = useRef(rendererProps)

  useEffect(() => {
    const scrollRenderer = new ScrollRenderer({
      rendererProps: {
        ...rendererPropsRef.current,
        canvas: canvasRef.current!
      },
      onBeforeRender: (delta) => onBeforeRenderRef.current?.(delta),
      onAfterRender: (delta) => onAfterRenderRef.current?.(delta)
    })
    setRenderer(scrollRenderer)

    return () => {
      scrollRenderer.destroy()
      setRenderer(null)
    }
  }, [])

  useEffect(() => {
    if (renderer) renderer.playing = playing
  }, [renderer, playing])

  return (
    <ScrollRendererContext.Provider value={renderer}>
      <canvas
        ref={canvasRef}
        className={className}
        style={className ? style : { ...defaultCanvasStyle, ...style }}
      />
      {children}
    </ScrollRendererContext.Provider>
  )
}

/**
 * The {@link ScrollRenderer} owned by the nearest {@link ScrollRendererProvider},
 * or `null` while it is being created (first render pass) or when no provider
 * is present.
 */
export function useScrollRenderer(): ScrollRenderer | null {
  return useContext(ScrollRendererContext)
}
