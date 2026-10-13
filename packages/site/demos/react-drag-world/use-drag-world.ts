import { useCallback, useEffect, useRef, type RefObject } from 'react'

export interface DragWorldOptions {
  /** World width in CSS pixels. */
  worldWidth: number
  /** World height in CSS pixels. */
  worldHeight: number
  /** Per-frame velocity decay while coasting. */
  friction?: number
  /**
   * Distance (px) over which edge resistance ramps up while dragging past a
   * bound; the spring-back force while coasting is `overshoot / (elasticity/4)`.
   */
  elasticity?: number
  /** Pointer travel (px) before a press becomes a drag. */
  dragThreshold?: number
  /**
   * Called every time the pan position changes. `(0, 0)` means the world is
   * centred in the viewport; the values are the translate applied to the
   * world layers. Called from rAF/pointer handlers — keep it cheap and avoid
   * unconditional React state updates.
   */
  onChange?: (x: number, y: number) => void
}

/**
 * Click-and-drag panning for a large "world" element centred in a fixed
 * viewport-sized container, in the style of the Super Mario Odyssey site map:
 *
 * - pointer delta is applied directly to a CSS translate while dragging
 * - on release the last frame's delta becomes the velocity, decaying by
 *   `friction` per frame until it drops below rest
 * - past the world bounds, drag resistance ramps over `elasticity` px and a
 *   spring eases the world back while coasting
 *
 * The same translate is written to every element in `layerRefs`, so multiple
 * fixed layers (e.g. a decorative floor below the canvas and an interactive
 * layer above it) pan in lockstep.
 *
 * @param containerRef - Fixed, viewport-filling element that receives pointer events.
 * @param layerRefs - The world-sized elements to translate.
 * @returns `flyTo(x, y)` — tween the pan position (eased, duration ∝ distance).
 */
export function useDragWorld(
  containerRef: RefObject<HTMLElement | null>,
  layerRefs: RefObject<HTMLElement | null>[],
  options: DragWorldOptions
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
    const bounds = { x: 0, y: 0 } // symmetric: pos.x ∈ [-bounds.x, bounds.x]

    let pointerDown = false
    let dragging = false
    let wasDrag = false
    let coastRaf = 0
    let flyRaf = 0

    const clamp = (v: number, lim: number) =>
      Math.min(lim, Math.max(-lim, v))

    // Signed distance past the bound, 0 while inside.
    const overshoot = (v: number, lim: number) =>
      v > lim ? v - lim : v < -lim ? v + lim : 0

    const apply = () => {
      const t = `translate3d(${pos.x}px, ${pos.y}px, 0)`
      for (const ref of layersRef.current) {
        if (ref.current) ref.current.style.transform = t
      }
      optionsRef.current.onChange?.(pos.x, pos.y)
    }

    const computeBounds = () => {
      const { worldWidth, worldHeight } = optionsRef.current
      bounds.x = Math.max(0, (worldWidth - container.clientWidth) / 2)
      bounds.y = Math.max(0, (worldHeight - container.clientHeight) / 2)
    }

    const stopAnimations = () => {
      if (coastRaf) cancelAnimationFrame(coastRaf)
      if (flyRaf) cancelAnimationFrame(flyRaf)
      coastRaf = flyRaf = 0
    }

    // Momentum + edge spring, run per frame after release.
    const coast = () => {
      coastRaf = 0
      const { friction = 0.9, elasticity = 300 } = optionsRef.current

      vel.x *= friction
      vel.y *= friction
      pos.x += vel.x
      pos.y += vel.y

      const ox = overshoot(pos.x, bounds.x)
      const oy = overshoot(pos.y, bounds.y)
      if (ox) vel.x -= ox / (elasticity / 4)
      if (oy) vel.y -= oy / (elasticity / 4)

      apply()

      if (Math.hypot(vel.x, vel.y) > 0.1 || Math.abs(ox) > 0.5 || Math.abs(oy) > 0.5) {
        coastRaf = requestAnimationFrame(coast)
      } else {
        pos.x = clamp(pos.x, bounds.x)
        pos.y = clamp(pos.y, bounds.y)
        apply()
      }
    }

    const flyTo = (x: number, y: number) => {
      stopAnimations()
      const to = { x: clamp(x, bounds.x), y: clamp(y, bounds.y) }
      const from = { x: pos.x, y: pos.y }
      const dist = Math.hypot(to.x - from.x, to.y - from.y)
      if (dist < 1) return
      // Duration proportional to distance, like the original map's navigate.
      const duration = Math.min(1500, Math.max(400, dist * 0.4))
      let t0 = 0

      const step = (t: number) => {
        flyRaf = 0
        if (!t0) t0 = t
        const p = Math.min(1, (t - t0) / duration)
        const e = 1 - (1 - p) * (1 - p) // quadratic ease-out
        pos.x = from.x + (to.x - from.x) * e
        pos.y = from.y + (to.y - from.y) * e
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

      // Past a bound, apply only a fraction of the delta — resistance grows
      // linearly with overshoot until the world stops following at
      // `elasticity` px out.
      const { elasticity = 300 } = optionsRef.current
      const resist = (o: number) =>
        Math.max(0, Math.min(1, 1 - Math.abs(o) / elasticity))
      pos.x += dx * resist(overshoot(pos.x + dx, bounds.x))
      pos.y += dy * resist(overshoot(pos.y + dy, bounds.y))
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

    const onResize = () => {
      computeBounds()
      if (!pointerDown && !coastRaf && !flyRaf) {
        pos.x = clamp(pos.x, bounds.x)
        pos.y = clamp(pos.y, bounds.y)
        apply()
      }
    }

    computeBounds()
    apply()

    container.addEventListener('pointerdown', onPointerDown)
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerup', onPointerUp)
    container.addEventListener('pointercancel', onPointerUp)
    container.addEventListener('click', onClickCapture, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onResize)

    return () => {
      stopAnimations()
      flyToRef.current = () => {}
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', onPointerUp)
      container.removeEventListener('pointercancel', onPointerUp)
      container.removeEventListener('click', onClickCapture, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onResize)
      container.classList.remove('is-grabbing')
    }
  }, [containerRef])

  const flyTo = useCallback((x: number, y: number) => flyToRef.current(x, y), [])
  return { flyTo }
}
