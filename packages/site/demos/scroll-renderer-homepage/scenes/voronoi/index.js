import { makeScene } from '../../utils.js'
import voronoiFrag from './voronoi.frag'

export const initVoronoi = ({ gl, scrollRenderer }) => {
  scrollRenderer.addScene(
    makeScene(gl, document.querySelector('.scene--voronoi'), voronoiFrag)
  )
}
