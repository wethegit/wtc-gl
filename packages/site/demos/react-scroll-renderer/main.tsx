import { StrictMode, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Geometry,
  GeometryAttribute,
  Mesh,
  Program,
  TransformFeedback,
  Triangle,
  Uniform
} from 'wtc-gl'
import { ScrollRendererProvider, useScrollScene } from '@wethegit/react-wtc-gl'

import vert from '../fs.vert'
import heroFrag from '../scroll-renderer/hero.frag'
import midFrag from '../scroll-renderer/mid.frag'
import endFrag from '../scroll-renderer/end.frag'
import particlesVert from '../scroll-renderer/particles.vert'
import particlesFrag from '../scroll-renderer/particles.frag'
import simulateVert from '../scroll-renderer/simulate.vert'
import simulateFrag from '../scroll-renderer/simulate.frag'

// ---------------------------------------------------------------------------
// A full-element fragment shader scene
// ---------------------------------------------------------------------------

function ShaderSection({
  frag,
  className,
  playing,
  children
}: {
  frag: string
  className: string
  playing: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  const playingRef = useRef(playing)
  playingRef.current = playing
  const frozenTimeRef = useRef(0)

  const sceneRef = useScrollScene(
    ref,
    ({ gl, scrollScene }) => {
      const geometry = new Triangle(gl)
      const program = new Program(gl, {
        vertex: vert,
        fragment: frag,
        uniforms: { ...scrollScene.uniforms },
        transparent: true
      })
      new Mesh(gl, { geometry, program }).setParent(scrollScene.scene)

      // Free the GL resources when the section unmounts — the provider (and
      // its context) may outlive this scene.
      return () => {
        geometry.remove()
        program.remove()
      }
    },
    {
      // The renderer advances u_time before this runs; while paused, write
      // the frozen value back so time stands still but rendering continues.
      onBeforeRender: () => {
        const scrollScene = sceneRef.current
        if (!scrollScene) return
        if (playingRef.current)
          frozenTimeRef.current = scrollScene.u_time.value as number
        else scrollScene.u_time.value = frozenTimeRef.current
      }
    }
  )

  return (
    <section ref={ref} className={className}>
      <div className="scene__label">{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Transform feedback particles, built inside a setup function
// ---------------------------------------------------------------------------

const N = 10000

function ParticlePanel({ playing }: { playing: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const deltaRef = useRef<Uniform | null>(null)
  const simulationRef = useRef<TransformFeedback | null>(null)
  const playingRef = useRef(playing)
  playingRef.current = playing
  const frozenTimeRef = useRef(0)

  const sceneRef = useScrollScene(
    ref,
    ({ gl, scrollScene }) => {
      const u_delta = new Uniform({
        name: 'u_delta',
        value: 0.016,
        kind: 'float'
      })
      deltaRef.current = u_delta

      const posData = new Float32Array(N * 2)
      const velData = new Float32Array(N * 2)
      const lifeData = new Float32Array(N)
      const seedData = new Float32Array(N)

      for (let i = 0; i < N; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 0.002 + Math.random() * 0.004
        velData[i * 2] = Math.cos(angle) * speed
        velData[i * 2 + 1] = Math.sin(angle) * speed
        lifeData[i] = Math.random()
        seedData[i] = Math.random()
      }
      const seed = new GeometryAttribute({ size: 1, data: seedData })

      // The simulation advances every particle on the GPU each frame...
      const simulation = new TransformFeedback(gl, {
        program: new Program(gl, {
          vertex: simulateVert,
          fragment: simulateFrag,
          uniforms: { ...scrollScene.uniforms, u_delta },
          transformFeedbackVaryings: ['v_position', 'v_velocity', 'v_life']
        }),
        attributes: {
          a_position: { data: posData, size: 2, varying: 'v_position' },
          a_velocity: { data: velData, size: 2, varying: 'v_velocity' },
          a_life: { data: lifeData, size: 1, varying: 'v_life' }
        },
        staticAttributes: { a_seed: seed }
      })
      simulationRef.current = simulation

      // ...and the points are drawn from its latest results
      const geometry = new Geometry(gl, {
        a_position: simulation.attribute('a_position'),
        a_life: simulation.attribute('a_life'),
        a_seed: seed
      })
      const program = new Program(gl, {
        vertex: particlesVert,
        fragment: particlesFrag,
        uniforms: { ...scrollScene.uniforms },
        transparent: true
      })

      new Mesh(gl, {
        mode: gl.POINTS,
        geometry,
        program
      }).setParent(scrollScene.scene)

      return () => {
        geometry.remove()
        simulation.remove()
        simulation.program.remove()
        program.remove()
        simulationRef.current = null
        deltaRef.current = null
      }
    },
    {
      // Render beyond the element's bounds (no scissor) so the particle
      // field can bleed left of the panel; margin keeps the scene alive
      // while the panel is near the viewport edge.
      clipToViewport: false,
      useViewport: false,
      margin: 400,
      onBeforeRender: (delta) => {
        const scrollScene = sceneRef.current
        if (playingRef.current) {
          if (scrollScene)
            frozenTimeRef.current = scrollScene.u_time.value as number
          if (deltaRef.current)
            deltaRef.current.value = Math.min(delta * 0.001, 0.05)
          simulationRef.current?.step()
        } else {
          // Freeze u_time and stop stepping the simulation so the particles
          // hold still while the loop keeps rendering.
          if (scrollScene) scrollScene.u_time.value = frozenTimeRef.current
        }
      }
    }
  )

  return <div ref={ref} className="scene__right scene--particles" />
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const DEMO_CODE = `function ShaderSection({ frag }) {
  const ref = useRef(null)

  useScrollScene(ref, ({ gl, scrollScene }) => {
    const geometry = new Triangle(gl)
    const program = new Program(gl, {
      vertex,
      fragment: frag,
      uniforms: { ...scrollScene.uniforms }
    })
    new Mesh(gl, { geometry, program }).setParent(scrollScene.scene)

    return () => {
      geometry.remove()
      program.remove()
    }
  })

  return <section ref={ref} className="scene" />
}

createRoot(root).render(
  <ScrollRendererProvider>
    <ShaderSection frag={plasma} />
    <ShaderSection frag={rings} />
  </ScrollRendererProvider>
)`

// Append ?layout=absolute to try the compositor-synced layout (better on touch)
const layout =
  new URLSearchParams(location.search).get('layout') === 'absolute'
    ? 'absolute'
    : 'fixed'

function App() {
  const [playing, setPlaying] = useState(true)

  return (
    <ScrollRendererProvider layout={layout}>
      <div className="content">
        <ShaderSection
          frag={heroFrag}
          className="scene scene--hero"
          playing={playing}
        >
          <span className="tag">Scene 1 - plasma</span>
          <h1>React ScrollRenderer</h1>
          <p>
            The ScrollRenderer recipe as React components. A provider owns the
            fixed canvas and render loop; each section registers its scene with
            a hook and cleans up on unmount.
          </p>
        </ShaderSection>

        <ShaderSection
          frag={midFrag}
          className="scene scene--mid"
          playing={playing}
        >
          <span className="tag">Scene 2 - rings</span>
          <h2>useScrollScene</h2>
          <p>
            The hook constructs the ScrollScene, then hands it to a setup
            function - so its auto-managed uniforms are ready to spread into
            your programs, exactly like the vanilla recipe.
          </p>
        </ShaderSection>

        <ShaderSection
          frag={endFrag}
          className="scene scene--end"
          playing={playing}
        >
          <span className="tag">Scene 3 - grid</span>
          <h2>StrictMode safe</h2>
          <p>
            This page runs in React StrictMode: every scene is mounted,
            destroyed and remounted in development, exercising the cleanup paths
            on every load.
          </p>
        </ShaderSection>

        <section id="particles" className="scene scene--split">
          <div className="scene__left">
            <div className="scene__label">
              <span className="tag">Scene 4 - particles</span>
              <h2>Setup functions</h2>
              <p>
                A GPU particle system - TransformFeedback ping-pong buffers -
                built inside a setup callback, with per-frame uniform updates
                via the onBeforeRender option. Pause with the button below -
                u_time freezes but the loop keeps running, so scenes still track
                scroll.
              </p>
            </div>
          </div>
          <ParticlePanel playing={playing} />
        </section>

        <section id="code" className="scene scene--code">
          <div className="scene__label scene__label--wide">
            <span className="tag">The code</span>
            <h2>A scene in ~20 lines</h2>
            <p>
              Register a scene with useScrollScene, build your GL content in the
              setup function, and return a cleanup that frees it - the provider
              and its context may outlive any one section.
            </p>
            <pre>
              <code>{DEMO_CODE}</code>
            </pre>
          </div>
        </section>
      </div>

      <button className="playpause" onClick={() => setPlaying((p) => !p)}>
        {playing ? 'Pause' : 'Play'}
      </button>
    </ScrollRendererProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
