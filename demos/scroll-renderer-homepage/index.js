import { ScrollRenderer } from '../../src/lib'
import { createSharedTextures } from './textures.js'

import { initHero }      from './scenes/hero'
import { initProblem }   from './scenes/problem'
import { initVoronoi }   from './scenes/voronoi'
import { initWaves }     from './scenes/waves'
import { initFlow }      from './scenes/flow'
import { initLayers }    from './scenes/layers'
import { initTerminal }  from './scenes/terminal'
import { initParticles } from './scenes/particles'

const scrollRenderer = new ScrollRenderer({
  rendererProps: { antialias: true, premultipliedAlpha: true }
})

scrollRenderer.canvas.classList.add('scroll-renderer-canvas')
document.body.appendChild(scrollRenderer.canvas)

const { gl } = scrollRenderer
const { noiseTex, envTex } = createSharedTextures(gl)

const ctx = { gl, scrollRenderer, noiseTex, envTex }

initHero(ctx)
initProblem(ctx)
initVoronoi(ctx)
initWaves(ctx)
initFlow(ctx)
initLayers(ctx)
initTerminal(ctx)
initParticles(ctx)

scrollRenderer.playing = true
