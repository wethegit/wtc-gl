import { makeScene } from '../../utils.js'
import wavesFrag from './waves.frag'

export const initWaves = ({ gl, scrollRenderer }) => {
  scrollRenderer.addScene(
    makeScene(gl, document.querySelector('.scene--waves'), wavesFrag)
  )
}
