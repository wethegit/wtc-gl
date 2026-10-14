import { makeScene } from '../../utils.js'
import flowFrag from './flow.frag'

export const initFlow = ({ gl, scrollRenderer }) => {
  scrollRenderer.addScene(
    makeScene(gl, document.querySelector('.scene--flow'), flowFrag)
  )
}
