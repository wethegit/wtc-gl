import { useCallback, useEffect, useRef, type RefObject } from 'react'

export interface InfiniteDragWorldOptions {
  /** Wrap period on the x axis, in CSS pixels. */
  worldWidth: number
  /** Wrap period on the y axis, in CSS pixels. */
  worldHeight: number
  /** Per-frame velocity decay while coasting. */
  friction?: number
  /** Pointer travel (px) before a press becomes a drag. */
  dragThreshold?: number
  /**
   * Called every time the pan position changes, with the *unbounded* pan.
   * Wrap deltas yourself with {@link wrapDelta} for world-space math.
   * Called from rAF/pointer handlers — keep it cheap.
   */
  onChange?: (x: number, y: number) => void
}

/** Folds an offset into `[-period/2, period/2)` — the toroidal short way. */
export const wrapDelta = (v: number, period: number) => {
  const half = period / 2
  return ((((v + half) % period) + period) % period) - half
}

/**
 * Click-and-drag panning over a toroidal, endless world. Same momentum feel
 * as `useDragWorld` (release velocity = last frame's pointer delta, decaying
 * by `friction` per frame) but with no bounds, no elastic edges — the pan
 * grows without limit in any direction.
 *
 * Instead of translating one big world element, every element carrying a
 * `data-world-x` / `data-world-y` attribute (world coordinates relative to
 * the world origin) inside the given layers is positioned individually each
 * frame: its screen offset from the viewport centre is
 * `wrapDelta(worldCoord + pan, period)`, so items teleport across the seam
 * while off-screen — the classic infinite-carousel trick. Omit one of the
 * attributes to lock that axis to the viewport centre (useful for
 * viewport-spanning axis lines that wrap only in the other direction).
 *
 * Items must be anchored at `left: 50%; top: 50%` — the hook writes
 * `transform: translate(calc(<x>px - 50%), calc(<y>px - 50%))`.
 *
 * Each item can appear on screen at most once, so the wrap periods must be
 * comfortably larger than the viewport (roughly 2× to be safe).
 *
 * @param containerRef - Fixed, viewport-filling element that receives pointer events.
 * @param layerRefs - Layers scanned once on mount for `[data-world-*]` items.
 * @returns `flyTo(x, y)` — tween the pan so the world point `(x, y)` reaches
 *   the viewport centre, taking the shortest path around the torus.
 */
export function useInfiniteDragWorld(
  containerRef: RefObject<HTMLElement | null>,
  layerRefs: RefObject<HTMLElement | null>[],
  options: InfiniteDragWorldOptions
): { flyTo: (x: number, y: number) => void } {
  // Latest-value refs so the single effect never needs to re-run.
  const optionsRef = useRef(options)
  const layersRef = useRef(layerRefs)
  useEffect(() => {
    optionsRef.current = options
    layersRef.current = layerRefs
  })

  const flyToRef = useRef<(x: number, y: number) => void>(() => {})

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const pos = { x: 0, y: 0 }
    const vel = { x: 0, y: 0 }
    const start = { x: 0, y: 0 }
    const then = { x: 0, y: 0 }

    let pointerDown = false
    let dragging = false
    let wasDrag = false
    let coastRaf = 0
    let flyRaf = 0

    interface Item {
      el: HTMLElement
      x: number | null
      y: number | null
    }

    const items: Item[] = []
    for (const ref of layersRef.current) {
      const layer = ref.current
      if (!layer) continue
      for (const el of layer.querySelectorAll<HTMLElement>(
        '[data-world-x], [data-world-y]'
      )) {
        const x = el.dataset.worldX
        const y = el.dataset.worldY
        items.push({
          el,
          x: x === undefined ? null : parseFloat(x),
          y: y === undefined ? null : parseFloat(y)
        })
      }
    }

    const apply = () => {
      const { worldWidth, worldHeight } = optionsRef.current
      for (const item of items) {
        const x = item.x === null ? 0 : wrapDelta(item.x + pos.x, worldWidth)
        const y = item.y === null ? 0 : wrapDelta(item.y + pos.y, worldHeight)
        item.el.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%))`
      }
      optionsRef.current.onChange?.(pos.x, pos.y)
    }

    const stopAnimations = () => {
      if (coastRaf) cancelAnimationFrame(coastRaf)
      if (flyRaf) cancelAnimationFrame(flyRaf)
      coastRaf = flyRaf = 0
    }

    // Momentum, run per frame after release. No bounds — just friction.
    const coast = () => {
      coastRaf = 0
      const { friction = 0.9 } = optionsRef.current
      vel.x *= friction
      vel.y *= friction
      pos.x += vel.x
      pos.y += vel.y
      apply()
      if (Math.hypot(vel.x, vel.y) > 0.1) coastRaf = requestAnimationFrame(coast)
    }

    const flyTo = (x: number, y: number) => {
      stopAnimations()
      const { worldWidth, worldHeight } = optionsRef.current
      // Shortest wrapped path that brings world point (x, y) to the centre.
      const dx = -wrapDelta(x + pos.x, worldWidth)
      const dy = -wrapDelta(y + pos.y, worldHeight)
      const dist = Math.hypot(dx, dy)
      if (dist < 1) return
      const from = { x: pos.x, y: pos.y }
      const duration = Math.min(1500, Math.max(400, dist * 0.4))
      let t0 = 0

      const step = (t: number) => {
        flyRaf = 0
        if (!t0) t0 = t
        const p = Math.min(1, (t - t0) / duration)
        const e = 1 - (1 - p) * (1 - p) // quadratic ease-out
        pos.x = from.x + dx * e
        pos.y = from.y + dy * e
        apply()
        if (p < 1) flyRaf = requestAnimationFrame(step)
      }
      flyRaf = requestAnimationFrame(step)
    }
    flyToRef.current = flyTo

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      if (e.target instanceof Element && e.target.closest('a, button')) return
      stopAnimations()
      pointerDown = true
      dragging = false
      wasDrag = false
      start.x = then.x = e.clientX
      start.y = then.y = e.clientY
      vel.x = vel.y = 0
      container.setPointerCapture(e.pointerId)
      container.classList.add('is-grabbing')
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!pointerDown) return
      const dx = e.clientX - then.x
      const dy = e.clientY - then.y
      then.x = e.clientX
      then.y = e.clientY

      // The last single-frame delta is the release velocity.
      vel.x = dx
      vel.y = dy

      if (!dragging) {
        const { dragThreshold = 10 } = optionsRef.current
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > dragThreshold)
          dragging = wasDrag = true
      }
      if (!dragging) return
      e.preventDefault()
      pos.x += dx
      pos.y += dy
      apply()
    }

    const onPointerUp = () => {
      if (!pointerDown) return
      pointerDown = false
      container.classList.remove('is-grabbing')
      if (dragging) {
        dragging = false
        coastRaf = requestAnimationFrame(coast)
      }
    }

    // A drag that ends over a link/button shouldn't activate it.
    const onClickCapture = (e: MouseEvent) => {
      if (!wasDrag) return
      wasDrag = false
      e.preventDefault()
      e.stopPropagation()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (
        e.target instanceof HTMLElement &&
        /^(input|textarea|select)$/i.test(e.target.tagName)
      )
        return
      const impulse = 30
      let hit = true
      if (e.key === 'ArrowLeft') vel.x += impulse
      else if (e.key === 'ArrowRight') vel.x -= impulse
      else if (e.key === 'ArrowUp') vel.y += impulse
      else if (e.key === 'ArrowDown') vel.y -= impulse
      else hit = false
      if (!hit) return
      e.preventDefault()
      if (flyRaf) cancelAnimationFrame(flyRaf)
      flyRaf = 0
      if (!coastRaf) coastRaf = requestAnimationFrame(coast)
    }

    apply()

    container.addEventListener('pointerdown', onPointerDown)
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerup', onPointerUp)
    container.addEventListener('pointercancel', onPointerUp)
    container.addEventListener('click', onClickCapture, true)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      stopAnimations()
      flyToRef.current = () => {}
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', onPointerUp)
      container.removeEventListener('pointercancel', onPointerUp)
      container.removeEventListener('click', onClickCapture, true)
      window.removeEventListener('keydown', onKeyDown)
      container.classList.remove('is-grabbing')
    }
  }, [containerRef])

  const flyTo = useCallback((x: number, y: number) => flyToRef.current(x, y), [])
  return { flyTo }
}
