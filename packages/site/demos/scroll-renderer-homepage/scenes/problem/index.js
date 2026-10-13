import { Uniform } from 'wtc-gl'
import { makeScene, scrollProgress } from '../../utils.js'
import problemFrag from './problem.frag'

export const initProblem = ({ gl, scrollRenderer, noiseTex }) => {
  const u_cp = new Uniform({ name: 'u_cp', value: [0, 0, 500], kind: 'float_vec3' })

  const problemScene = makeScene(gl, document.querySelector('.scene--problem'), problemFrag, {
    u_cp,
    s_noise: new Uniform({ name: 's_noise', value: noiseTex, kind: 'texture' }),
    u_mouse: new Uniform({ name: 'u_mouse', value: [0, 0],   kind: 'float_vec2' })
  })

  problemScene.onBeforeRender = (_, rect) => {
    const progress = scrollProgress(rect)
    const angle = progress * Math.PI * 1.5 - Math.PI * 0.5
    const radius = 350
    u_cp.value = [Math.sin(angle) * radius, 100 - progress * 200, Math.cos(angle) * radius]
  }

  scrollRenderer.addScene(problemScene)
}
