import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ScrollRendererProvider } from '@wethegit/react-wtc-gl'

import { ManifoldDivider, PALETTES } from './manifold-divider'

function App() {
  const [playing, setPlaying] = useState(true)
  const [showLast, setShowLast] = useState(true)
  const [chaos, setChaos] = useState(0.35)
  const [clip, setClip] = useState(false)

  return (
    // premultiplied, so unclipped dividers blend over their neighbours
    <ScrollRendererProvider rendererProps={{ premultipliedAlpha: true }}>
      <div className="content">
        <section className="copy">
          <span className="tag">React · ScrollRenderer</span>
          <h1>Manifold divider</h1>
          <p>
            Box modules from the manifold mandala, strung on helices that coil
            around a line and flow along it. Each divider is a scene on the
            page&apos;s shared ScrollRenderer: it renders a G-buffer offscreen,
            then composites outlines, ambient occlusion and fog into its own
            strip of the canvas.
          </p>
        </section>

        <ManifoldDivider
          playing={playing}
          chaos={chaos}
          heroes={0.5}
          clip={clip}
          seed={7}
          speed={0}
        />

        <section className="copy">
          <h2>Three strands, flowing left</h2>
          <p>
            Strands, coil, radius and direction are props. Modules shrink in and
            out at either end, and every few seconds one strand folds away and
            unfolds as a new shape - sometimes as a hero, with oversized modules
            and a slow swell. This one always clips to its element.
          </p>
        </section>

        <ManifoldDivider
          playing={playing}
          chaos={chaos}
          palette={PALETTES.lagoon}
          strands={3}
          turns={4}
          radius={0.5}
          speed={-0.3}
          heroes={0.3}
          seed={21}
        />

        <section className="copy copy--dark">
          <h2>Transparent by design</h2>
          <p>
            Empty pixels stay transparent and fog fades alpha rather than mixing
            to a sky, so the band sits on whatever is behind it - and with clip
            off, it can spill past its own bounds.
          </p>
          <ManifoldDivider
            playing={playing}
            chaos={chaos}
            palette={PALETTES.lilac}
            strands={1}
            turns={7}
            radius={0.35}
            heroes={0.6}
            clip={clip}
            seed={3}
            className="manifold-divider--tall"
          />
        </section>

        <section className="copy">
          <h2>Unmount me</h2>
          <p>
            The toggle below removes the last divider; its scene, programs,
            geometry and render target are freed while the shared context lives
            on.
          </p>
        </section>

        {showLast && (
          <ManifoldDivider
            playing={playing}
            chaos={chaos}
            palette={PALETTES.ember}
            strands={2}
            turns={3}
            axis={false}
            clip={clip}
            seed={99}
          />
        )}

        <section className="copy copy--end" />
      </div>

      <div className="controls">
        <label>
          Chaos
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={chaos}
            onChange={(e) => setChaos(Number(e.target.value))}
          />
        </label>
        <button onClick={() => setClip((c) => !c)}>
          {clip ? 'Clip: on' : 'Clip: off'}
        </button>
        <button onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button onClick={() => setShowLast((s) => !s)}>
          {showLast ? 'Remove last' : 'Add last'}
        </button>
      </div>
    </ScrollRendererProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
