import { makeScene } from '../../utils.js'
import terminalFrag from './terminal.frag'

export const initTerminal = ({ gl, scrollRenderer }) => {
  scrollRenderer.addScene(
    makeScene(gl, document.querySelector('.scene--terminal'), terminalFrag)
  )
}
