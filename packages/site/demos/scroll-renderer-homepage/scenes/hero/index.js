import { Uniform } from 'wtc-gl'
import { makeScene } from '../../utils.js'
import heroFrag from './hero.frag'

export const initHero = ({ gl, scrollRenderer, noiseTex, envTex }) => {
  const u_mouse = new Uniform({ name: 'u_mouse', value: [0, 0], kind: 'float_vec2' })

  const heroScene = makeScene(gl, document.querySelector('.scene--hero'), heroFrag, {
    u_noise:       new Uniform({ name: 'u_noise',       value: noiseTex, kind: 'texture' }),
    u_environment: new Uniform({ name: 'u_environment', value: envTex,   kind: 'texture' }),
    u_mouse
  })

  window.addEventListener('mousemove', (e) => {
    const w = scrollRenderer.canvas.clientWidth
    const h = scrollRenderer.canvas.clientHeight
    const minD = Math.min(w, h)
    u_mouse.value = [(e.clientX - w * 0.5) / minD, -(e.clientY - h * 0.5) / minD]
  })

  scrollRenderer.addScene(heroScene)
}
