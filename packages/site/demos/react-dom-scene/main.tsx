import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Camera,
  DOMScene,
  Plane,
  ScrollRendererProvider
} from '@wethegit/react-wtc-gl'

import type { PlaneHandle } from '@wethegit/react-wtc-gl'

import wavesFrag from './waves.frag'
// This file's own source, for the per-scene code popovers - always in sync.
import source from './main.tsx?raw'

/** Source of scene N: the lines between its banner comment and the next. */
function sceneSource(n: number): string {
  const lines = source.split('\n')
  const title = lines.findIndex((l: string) => l.startsWith(`// Scene ${n}`))
  if (title === -1) return ''
  const end = lines.findIndex(
    (l: string, i: number) => i > title + 1 && l.startsWith('// ---')
  )
  return lines
    .slice(title + 2, end === -1 ? undefined : end)
    .join('\n')
    .trim()
}

function CodePopover({ code }: { code: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        className="code-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? '× close' : '{ } code'}
      </button>
      {open && (
        <div className="code-popover" role="dialog" aria-label="Scene source">
          <pre>
            <code>{code}</code>
          </pre>
        </div>
      )}
    </>
  )
}

// A flat-colour fragment shader, driven per-plane through a uniform.
const colorFrag = /* glsl */ `
precision highp float;

uniform vec3 u_color;
uniform float u_time;

varying vec2 v_uv;

void main() {
  float edge = smoothstep(0.0, 0.04, v_uv.x) * smoothstep(1.0, 0.96, v_uv.x) *
    smoothstep(0.0, 0.06, v_uv.y) * smoothstep(1.0, 0.94, v_uv.y);
  float pulse = 0.92 + 0.08 * sin(u_time * 20.0);
  gl_FragColor = vec4(u_color * pulse * (0.35 + 0.65 * edge), 1.0);
}
`

// Scene 1 — defaults and ref-driven animation
function DefaultsScene() {
  const handle = useRef<PlaneHandle>(null)

  // Per-frame imperative animation through the handle - no React re-renders.
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const rotation = handle.current?.rotation
      if (rotation) rotation.z += 0.005
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <section>
      <div className="section-head">
        <h2>1. Defaults, refs, resize</h2>
        <CodePopover code={sceneSource(1)} />
      </div>
      <p>
        The back plane is a bare <code>&lt;Plane /&gt;</code> - default debug
        shader, sized to the element at creation. The front plane is 300x200 CSS
        px with a custom fragment: move the pointer to drag it around (its
        position and <code>u_mouse</code> update through the ref, no React
        re-renders), and it spins via a rAF loop mutating{' '}
        <code>rotation.z</code>. Drag the corner handle to resize the element -
        the camera refits without stretching.
      </p>
      <DOMScene
        className="scene scene--resizable"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - rect.left - rect.width / 2
          const y = -(e.clientY - rect.top - rect.height / 2)
          handle.current?.position?.reset(x, y, 0)
          handle.current?.setUniform('u_mouse', [x, y])
        }}
      >
        <Plane />
        <Plane
          ref={handle}
          width={300}
          height={200}
          fragment={wavesFrag}
          uniforms={{ u_mouse: [0, 0] }}
        />
      </DOMScene>
    </section>
  )
}

// Scene 2 — stacking and lifecycle
function StackingScene() {
  const [blueVisible, setBlueVisible] = useState(true)
  const [goldMounted, setGoldMounted] = useState(true)

  return (
    <section>
      <div className="section-head">
        <h2>2. Stacking &amp; lifecycle</h2>
        <CodePopover code={sceneSource(2)} />
      </div>
      <p>
        Later children stack on top, DOM-like - except the gold plane, which
        opts out with <code>renderOrder={'{-1}'}</code> and renders underneath
        despite being declared last. The buttons live inside the{' '}
        <code>&lt;DOMScene&gt;</code> as ordinary DOM children; they toggle the
        blue plane's <code>visible</code> prop and mount/unmount the gold one
        (exercising GL resource cleanup).
      </p>
      <DOMScene className="scene">
        <Plane
          width={340}
          height={340}
          position={[-120, 40, 0]}
          fragment={colorFrag}
          uniforms={{ u_color: [0.9, 0.32, 0.28] }}
        />
        <Plane
          width={340}
          height={340}
          position={[0, -40, 0]}
          visible={blueVisible}
          fragment={colorFrag}
          uniforms={{ u_color: [0.25, 0.55, 0.95] }}
        />
        {goldMounted && (
          <Plane
            width={340}
            height={340}
            position={[120, 40, 0]}
            renderOrder={-1}
            fragment={colorFrag}
            uniforms={{ u_color: [0.95, 0.75, 0.2] }}
          />
        )}
        <div className="scene__hud">
          <button
            aria-pressed={blueVisible}
            onClick={() => setBlueVisible((v) => !v)}
          >
            blue: {blueVisible ? 'visible' : 'hidden'}
          </button>
          <button
            aria-pressed={goldMounted}
            onClick={() => setGoldMounted((m) => !m)}
          >
            gold: {goldMounted ? 'mounted' : 'unmounted'}
          </button>
        </div>
      </DOMScene>
    </section>
  )
}

// Scene 3 — cameras
type CameraMode = 'dolly' | 'perspective' | 'default'

function CameraScene() {
  const [mode, setMode] = useState<CameraMode>('dolly')

  return (
    <section>
      <div className="section-head">
        <h2>3. Cameras</h2>
        <CodePopover code={sceneSource(3)} />
      </div>
      <p>
        Three planes fanned out in z. <code>dolly</code> mounts a{' '}
        <code>&lt;Camera type="dolly" /&gt;</code> - drag to orbit, wheel to
        zoom. <code>perspective</code> uses the pixel-fit distance, so the
        centre plane keeps its CSS-px size. <code>default</code> unmounts the{' '}
        <code>&lt;Camera&gt;</code> entirely, restoring the scene's orthographic
        camera.
      </p>
      <DOMScene className="scene">
        {mode !== 'default' && <Camera type={mode} />}
        <Plane
          width={280}
          height={280}
          position={[-170, 0, -80]}
          rotation={[0, 0.5, 0]}
          fragment={colorFrag}
          depthWrite={true}
          doubleSided
          uniforms={{ u_color: [0.9, 0.32, 0.28] }}
        />
        <Plane
          width={280}
          height={280}
          position={[0, 0, -40]}
          fragment={wavesFrag}
          depthWrite={true}
          doubleSided
          uniforms={{ u_mouse: [0, 0] }}
        />
        <Plane
          width={280}
          height={280}
          position={[170, 0, 0]}
          rotation={[0, -0.5, 0]}
          fragment={colorFrag}
          depthWrite={true}
          doubleSided
          uniforms={{ u_color: [0.25, 0.55, 0.95] }}
        />
        <div className="scene__hud">
          {(['dolly', 'perspective', 'default'] as const).map((m) => (
            <button
              key={m}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </DOMScene>
    </section>
  )
}

// Scene 4 — stress test: CPU particle planes
// Soft disc - alpha blending comes free with Plane's transparent default.
const particleFrag = /* glsl */ `
precision highp float;

uniform vec3 u_color;

varying vec2 v_uv;

void main() {
  float d = length(v_uv - 0.5) * 2.0;
  gl_FragColor = vec4(u_color, smoothstep(1.0, 0.55, d));
}
`

const PARTICLE_COUNTS = [50, 150, 300] as const

// Deterministic per-particle look, stable across re-renders.
const particleSize = (i: number) => 8 + ((i * 7919) % 23)
const particleColor = (i: number): [number, number, number] => {
  const t = (i * 0.618034) % 1
  return [
    0.5 + 0.5 * Math.sin(6.2832 * t),
    0.5 + 0.5 * Math.sin(6.2832 * (t + 0.33)),
    0.5 + 0.5 * Math.sin(6.2832 * (t + 0.67))
  ]
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  spin: number
}

const randomParticle = (): Particle => ({
  x: (Math.random() - 0.5) * 400,
  y: Math.random() * 200,
  vx: (Math.random() - 0.5) * 300,
  vy: (Math.random() - 0.5) * 200,
  spin: (Math.random() - 0.5) * 5
})

function StressScene() {
  const [count, setCount] = useState<number>(150)
  const handles = useRef<(PlaneHandle | null)[]>([])
  const particles = useRef<Particle[]>([])
  const fpsRef = useRef<HTMLSpanElement>(null)
  const fpsAvg = useRef(60)

  // Seed or trim the simulation when the particle count changes; existing
  // particles keep their motion.
  useEffect(() => {
    const sim = particles.current
    while (sim.length < count) sim.push(randomParticle())
    sim.length = count
    handles.current.length = count
  }, [count])

  return (
    <section>
      <div className="section-head">
        <h2>4. Stress test - CPU particle planes</h2>
        <CodePopover code={sceneSource(4)} />
      </div>
      <p>
        Every particle is a full <code>&lt;Plane&gt;</code> - its own mesh, its
        own compiled program, its own draw call. That's the deliberate worst
        case for this API. A CPU simulation in the scene's{' '}
        <code>onBeforeRender</code> moves each one through its handle; React
        only re-renders when the count changes, and the sim pauses when the
        scene scrolls off screen. Instanced rendering is the planned fix - see{' '}
        <code>FEATURE-dom-scene.md</code>.
      </p>
      <DOMScene
        className="scene"
        onBeforeRender={(delta, rect) => {
          const dt = Math.min(delta, 50) / 1000
          const hw = rect.width / 2
          const hh = rect.height / 2
          const sim = particles.current

          for (let i = 0; i < sim.length; i++) {
            const p = sim[i]
            const handle = handles.current[i]
            if (!handle) continue

            p.vy -= 220 * dt // gravity (+Y is up)
            p.x += p.vx * dt
            p.y += p.vy * dt

            // Elastic bounce off the element bounds.
            const r = particleSize(i) / 2
            if (p.x < -hw + r) {
              p.x = -hw + r
              p.vx = Math.abs(p.vx)
            } else if (p.x > hw - r) {
              p.x = hw - r
              p.vx = -Math.abs(p.vx)
            }
            if (p.y < -hh + r) {
              p.y = -hh + r
              p.vy = Math.abs(p.vy)
            } else if (p.y > hh - r) {
              p.y = hh - r
              p.vy = -Math.abs(p.vy)
            }

            handle.position?.reset(p.x, p.y, 0)
            const rotation = handle.rotation
            if (rotation) rotation.z += p.spin * dt
          }

          // FPS meter written straight to the DOM - no React re-renders.
          fpsAvg.current += (1000 / Math.max(delta, 1) - fpsAvg.current) * 0.05
          if (fpsRef.current) {
            fpsRef.current.textContent = `${fpsAvg.current.toFixed(0)} fps · ${sim.length} planes`
          }
        }}
      >
        {Array.from({ length: count }, (_, i) => (
          <Plane
            key={i}
            ref={(h) => {
              handles.current[i] = h
            }}
            width={particleSize(i)}
            height={particleSize(i)}
            fragment={particleFrag}
            uniforms={{ u_color: particleColor(i) }}
          />
        ))}
        <div className="scene__hud">
          {PARTICLE_COUNTS.map((n) => (
            <button
              key={n}
              aria-pressed={count === n}
              onClick={() => setCount(n)}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => {
              // Re-randomise in place - the sim writes the new state through
              // the handles on the next frame, no React re-render needed.
              const sim = particles.current
              for (let i = 0; i < sim.length; i++) sim[i] = randomParticle()
            }}
          >
            reset
          </button>
          <span ref={fpsRef} />
        </div>
      </DOMScene>
    </section>
  )
}

function App() {
  return (
    <ScrollRendererProvider>
      <main>
        <div className="intro">
          <h1>React DOMScene</h1>
          <p>
            Declarative WebGL scenes anchored to DOM elements:{' '}
            <code>&lt;DOMScene&gt;</code> renders a div tracked on one shared
            canvas, <code>&lt;Plane&gt;</code> children become meshes sized in
            CSS pixels, and <code>&lt;Camera&gt;</code> swaps the projection.
            Scroll: off-screen scenes pause rendering.
          </p>
        </div>
        <DefaultsScene />
        <StackingScene />
        <CameraScene />
        <StressScene />
      </main>
    </ScrollRendererProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
