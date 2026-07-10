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
import voronoiFrag from './voronoi.frag'

import { useDragWorld } from './use-drag-world'

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

const WORLD_W = 4400
const WORLD_H = 3400

// Radius (px from viewport centre) within which a region counts as "active".
const ACTIVE_RADIUS = 420

interface Poi {
  id: string
  label: string
  tag: string
  title: string
  blurb: string
  /** World coordinates of the region's centre, relative to the world centre. */
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
      'Every ScrollScene reads its element’s bounding rect each frame, so scenes follow any movement — page scroll, CSS transforms, or this drag.',
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
      'An IntersectionObserver pauses scenes that leave the screen, so only the regions near you are rendering right now.',
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
      'Release mid-drag and the last pointer delta becomes velocity, decaying at 0.9 per frame — the same friction as the Odyssey map.',
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
    title: 'Elastic bounds',
    blurb:
      'Drag past the edge of the world: resistance ramps up over 300px, then a spring eases you back when you let go.',
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
    title: 'Fly-to',
    blurb:
      'The map chips below tween the pan with an eased duration proportional to distance. A region lights up within 420px of centre.',
    x: 1280,
    y: 620,
    w: 660,
    h: 420,
    frag: gridFrag,
    glow: 'rgba(60, 255, 170, 0.3)'
  }
]

// ---------------------------------------------------------------------------
// A shader region anchored to a world-positioned element
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
      className={`poi${active ? ' poi--active' : ''}`}
      style={{
        left: WORLD_W / 2 + poi.x - poi.w / 2,
        top: WORLD_H / 2 + poi.y - poi.h / 2,
        width: poi.w,
        height: poi.h
      }}
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

function App() {
  const dragLayerRef = useRef<HTMLDivElement>(null)
  const floorWorldRef = useRef<HTMLDivElement>(null)
  const mainWorldRef = useRef<HTMLDivElement>(null)
  const coordsRef = useRef<HTMLSpanElement>(null)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [hintVisible, setHintVisible] = useState(false)

  const layerRefs = useMemo(() => [floorWorldRef, mainWorldRef], [])

  const { flyTo } = useDragWorld(dragLayerRef, layerRefs, {
    worldWidth: WORLD_W,
    worldHeight: WORLD_H,
    onChange: (x, y) => {
      if (coordsRef.current)
        coordsRef.current.textContent = `x ${Math.round(-x)} · y ${Math.round(-y)}`

      // The region whose centre is nearest the viewport centre, if close
      // enough. `-pos` is the world point currently under the centre.
      let nearest: string | null = null
      let best = ACTIVE_RADIUS
      for (const poi of POIS) {
        const d = Math.hypot(poi.x + x, poi.y + y)
        if (d < best) {
          best = d
          nearest = poi.id
        }
      }
      setActiveId((prev) => (prev === nearest ? prev : nearest))
    }
  })

  // Show the drag hint after 5s of inactivity, hide it on any interaction.
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
    // Lift the canvas above the floor layer (z0) but below the drag layer
    // (z2): the shaders paint over the decorative floor, and the frames and
    // labels paint over the shaders.
    <ScrollRendererProvider style={{ zIndex: 1 }}>
      {/* Decorative floor — dots, axes and glows that pan under the canvas */}
      <div className="world-layer world-layer--floor" aria-hidden="true">
        <div ref={floorWorldRef} className="world world--floor">
          {POIS.map((poi) => (
            <div
              key={poi.id}
              className="world__glow"
              style={{
                left: WORLD_W / 2 + poi.x,
                top: WORLD_H / 2 + poi.y,
                background: `radial-gradient(closest-side, ${poi.glow}, transparent 70%)`
              }}
            />
          ))}
          <div className="world__axis world__axis--x" />
          <div className="world__axis world__axis--y" />
          <div className="world__rings" />
        </div>
      </div>

      {/* Interactive layer — receives the pointer, carries the regions */}
      <div ref={dragLayerRef} className="world-layer world-layer--drag">
        <div ref={mainWorldRef} className="world">
          {POIS.map((poi) => (
            <WorldScene key={poi.id} poi={poi} active={activeId === poi.id} />
          ))}

          <div className="hub">
            <span className="tag">React DragWorld</span>
            <h1>Drag to explore</h1>
            <p>
              A {WORLD_W.toLocaleString()} × {WORLD_H.toLocaleString()}px world
              on one fixed canvas. Each region is a DOM element with a shader
              scene registered via <code>useScrollScene</code> — the renderer
              tracks their rects while the whole world moves under a CSS
              transform.
            </p>
          </div>
        </div>
      </div>

      <div className={`hint${hintVisible ? ' hint--visible' : ''}`}>
        <span className="hint__icon">✥</span> drag to explore
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
            onClick={() => flyTo(-poi.x, -poi.y)}
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
