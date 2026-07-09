import {
  StrictMode,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createRoot } from 'react-dom/client'
import { Mesh, Program, Triangle } from 'wtc-gl'
import { ScrollRendererProvider, useScrollScene } from '@wethegit/react-wtc-gl'

import vert from '../fs.vert'
import plasmaFrag from '../scroll-renderer/hero.frag'
import ringsFrag from '../scroll-renderer/mid.frag'
import gridFrag from '../scroll-renderer/end.frag'
import wavesFrag from '../scroll-renderer-homepage/scenes/waves/waves.frag'
import voronoiFrag from '../react-drag-world/voronoi.frag'

import { useInfiniteDragWorld, wrapDelta } from './use-infinite-drag-world'

// ---------------------------------------------------------------------------
// The torus
// ---------------------------------------------------------------------------

// Wrap periods — the world repeats every WORLD_W × WORLD_H pixels. Each item
// exists once in the DOM and teleports across the seam while off-screen, so
// keep these comfortably larger than any viewport.
const WORLD_W = 4400
const WORLD_H = 3400

// Radius (px from viewport centre) within which a region counts as "active".
const ACTIVE_RADIUS = 420

// Inside this distance of the hub the compass fades out.
const COMPASS_HOME_RADIUS = 300

const GRID_SIZE = 56

interface Poi {
  id: string
  label: string
  tag: string
  title: string
  blurb: string
  /** World coordinates of the region's centre, relative to the world origin. */
  x: number
  y: number
  w: number
  h: number
  frag: string
  /** Tint colour for the decorative glow on the floor layer. */
  glow: string
}

const POIS: Poi[] = [
  {
    id: 'plasma',
    label: 'Plasma',
    tag: 'region 01 — plasma',
    title: 'Rect tracking',
    blurb:
      'Every ScrollScene reads its element’s bounding rect each frame, so scenes follow any movement — even an element teleporting around a torus.',
    x: -1150,
    y: -780,
    w: 640,
    h: 400,
    frag: plasmaFrag,
    glow: 'rgba(255, 120, 200, 0.35)'
  },
  {
    id: 'rings',
    label: 'Rings',
    tag: 'region 02 — rings',
    title: 'Viewport culling',
    blurb:
      'An IntersectionObserver pauses scenes that leave the screen, so however far you roam, only the regions near you are rendering.',
    x: 1150,
    y: -700,
    w: 540,
    h: 540,
    frag: ringsFrag,
    glow: 'rgba(120, 100, 255, 0.35)'
  },
  {
    id: 'voronoi',
    label: 'Voronoi',
    tag: 'region 03 — voronoi',
    title: 'Momentum',
    blurb:
      'Release mid-drag and the last pointer delta becomes velocity, decaying at 0.9 per frame — and with no edges, a hard throw just keeps going.',
    x: -1250,
    y: 640,
    w: 720,
    h: 440,
    frag: voronoiFrag,
    glow: 'rgba(60, 140, 255, 0.35)'
  },
  {
    id: 'waves',
    label: 'Waves',
    tag: 'region 04 — waves',
    title: 'Toroidal wrap',
    blurb:
      'There is no edge. Each element is one DOM node whose offset is folded into ±half the world, crossing the seam before you can see it.',
    x: 40,
    y: 1100,
    w: 620,
    h: 620,
    frag: wavesFrag,
    glow: 'rgba(160, 80, 255, 0.35)'
  },
  {
    id: 'grid',
    label: 'Grid',
    tag: 'region 05 — grid',
    title: 'Fly-to, the short way',
    blurb:
      'The map chips tween the pan to the nearest wrapped copy of a region — the shortest path around the torus, never the long way back.',
    x: 1280,
    y: 620,
    w: 660,
    h: 420,
    frag: gridFrag,
    glow: 'rgba(60, 255, 170, 0.3)'
  }
]

// ---------------------------------------------------------------------------
// A shader region — one wrapping element anchored to the viewport centre
// ---------------------------------------------------------------------------

function WorldScene({
  poi,
  active,
  children
}: {
  poi: Poi
  active: boolean
  children?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useScrollScene(
    ref,
    ({ gl, scrollScene }) => {
      const geometry = new Triangle(gl)
      const program = new Program(gl, {
        vertex: vert,
        fragment: poi.frag,
        uniforms: { ...scrollScene.uniforms },
        transparent: true
      })
      new Mesh(gl, { geometry, program }).setParent(scrollScene.scene)

      return () => {
        geometry.remove()
        program.remove()
      }
    },
    // Wake scenes a little before they enter the viewport so fast pans don't
    // reveal blank frames.
    { margin: 300 }
  )

  return (
    <div
      ref={ref}
      className={`poi witem${active ? ' poi--active' : ''}`}
      data-world-x={poi.x}
      data-world-y={poi.y}
      style={{ width: poi.w, height: poi.h }}
    >
      <div className="poi__label">
        <span className="tag">{poi.tag}</span>
        <h2>{poi.title}</h2>
        <p>{children ?? poi.blurb}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const mod = (v: number, n: number) => ((v % n) + n) % n

function App() {
  const dragLayerRef = useRef<HTMLDivElement>(null)
  const floorLayerRef = useRef<HTMLDivElement>(null)
  const coordsRef = useRef<HTMLSpanElement>(null)
  const compassRef = useRef<HTMLDivElement>(null)
  const needleRef = useRef<HTMLSpanElement>(null)
  const distRef = useRef<HTMLSpanElement>(null)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [hintVisible, setHintVisible] = useState(false)

  const layerRefs = useMemo(() => [floorLayerRef, dragLayerRef], [])

  const { flyTo } = useInfiniteDragWorld(dragLayerRef, layerRefs, {
    worldWidth: WORLD_W,
    worldHeight: WORLD_H,
    onChange: (x, y) => {
      // The dot grid is endless already — just scroll its background.
      if (floorLayerRef.current)
        floorLayerRef.current.style.backgroundPosition = `${
          GRID_SIZE / 2 + mod(x, GRID_SIZE)
        }px ${GRID_SIZE / 2 + mod(y, GRID_SIZE)}px`

      // World coordinate currently under the viewport centre, wrapped.
      const cx = -wrapDelta(x, WORLD_W)
      const cy = -wrapDelta(y, WORLD_H)
      if (coordsRef.current)
        coordsRef.current.textContent = `x ${Math.round(cx)} · y ${Math.round(cy)}`

      // Compass: point at the nearest wrapped copy of the hub.
      const hx = wrapDelta(x, WORLD_W)
      const hy = wrapDelta(y, WORLD_H)
      const hubDist = Math.hypot(hx, hy)
      if (needleRef.current)
        needleRef.current.style.transform = `rotate(${Math.atan2(hy, hx)}rad)`
      if (distRef.current)
        distRef.current.textContent = `${Math.round(hubDist)}`
      compassRef.current?.classList.toggle(
        'compass--home',
        hubDist < COMPASS_HOME_RADIUS
      )

      // The region whose nearest wrapped copy is closest to the centre.
      let nearest: string | null = null
      let best = ACTIVE_RADIUS
      for (const poi of POIS) {
        const d = Math.hypot(
          wrapDelta(poi.x + x, WORLD_W),
          wrapDelta(poi.y + y, WORLD_H)
        )
        if (d < best) {
          best = d
          nearest = poi.id
        }
      }
      setActiveId((prev) => (prev === nearest ? prev : nearest))
    }
  })

  // Show the drag hint after a pause, hide it on any interaction.
  useEffect(() => {
    let timer = window.setTimeout(() => setHintVisible(true), 2000)
    const onActivity = () => {
      setHintVisible(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setHintVisible(true), 5000)
    }
    window.addEventListener('pointerdown', onActivity)
    window.addEventListener('keydown', onActivity)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
    }
  }, [])

  return (
    // Same sandwich as the bounded demo: floor (z0) under the canvas (z1)
    // under the drag layer (z2) — but there is no world element, only
    // individually wrapped items anchored to the viewport centre.
    <ScrollRendererProvider style={{ zIndex: 1 }}>
      {/* Decorative floor — endless dot grid plus wrapping glows and axes */}
      <div
        ref={floorLayerRef}
        className="layer layer--floor"
        aria-hidden="true"
      >
        {POIS.map((poi) => (
          <div
            key={poi.id}
            className="witem floor-glow"
            data-world-x={poi.x}
            data-world-y={poi.y}
            style={{
              background: `radial-gradient(closest-side, ${poi.glow}, transparent 70%)`
            }}
          />
        ))}
        {/* Axis lines through the hub: locked to one axis, wrapping on the
            other (no data attribute = that axis stays viewport-centred) */}
        <div className="witem floor-axis floor-axis--v" data-world-x="0" />
        <div className="witem floor-axis floor-axis--h" data-world-y="0" />
        <div className="witem floor-ring" data-world-x="0" data-world-y="0" />
      </div>

      {/* Interactive layer — receives the pointer, carries the regions */}
      <div ref={dragLayerRef} className="layer layer--drag">
        {POIS.map((poi) => (
          <WorldScene key={poi.id} poi={poi} active={activeId === poi.id} />
        ))}

        <div className="hub witem" data-world-x="0" data-world-y="0">
          <span className="tag">React DragWorld ∞</span>
          <h1>Drag forever</h1>
          <p>
            A {WORLD_W.toLocaleString()} × {WORLD_H.toLocaleString()}px world
            wrapped into a torus. Every region is a single DOM element with a{' '}
            <code>useScrollScene</code> shader — folded back around the seam
            while off-screen, so the world never ends in any direction.
          </p>
        </div>
      </div>

      <div className={`hint${hintVisible ? ' hint--visible' : ''}`}>
        <span className="hint__icon">✥</span> drag — it never ends
      </div>

      <div ref={compassRef} className="compass" aria-hidden="true">
        <span ref={needleRef} className="compass__needle">
          ➤
        </span>
        <span className="compass__dist">
          <span ref={distRef}>0</span> to hub
        </span>
      </div>

      <nav className="map" aria-label="World regions">
        <button
          className={`map__chip${activeId === null ? ' map__chip--active' : ''}`}
          onClick={() => flyTo(0, 0)}
        >
          ⌂ Hub
        </button>
        {POIS.map((poi) => (
          <button
            key={poi.id}
            className={`map__chip${activeId === poi.id ? ' map__chip--active' : ''}`}
            onClick={() => flyTo(poi.x, poi.y)}
          >
            {poi.label}
          </button>
        ))}
      </nav>

      <div className="coords">
        <span ref={coordsRef}>x 0 · y 0</span>
      </div>
    </ScrollRendererProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
