import {
  ScrollRenderer,
  ScrollScene,
  Program,
  Mesh,
  Triangle,
  Drawable
} from 'wtc-gl'

import vert from './default.vert'
import voronoiFrag from './voronoi.frag'
import wavesFrag from './waves.frag'
import flowFrag from './flow.frag'

const scrollRenderer = new ScrollRenderer()

Object.assign(scrollRenderer.canvas.style, {
  position: 'fixed',
  inset: '0',
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  zIndex: '0'
})
document.body.appendChild(scrollRenderer.canvas)

const { gl } = scrollRenderer

const makeScene = (selector, frag) => {
  const element = document.querySelector(selector)
  const scene = new Drawable(gl)
  const scrollScene = new ScrollScene({ element, scene })
  new Mesh(gl, {
    geometry: new Triangle(gl),
    program: new Program(gl, {
      vertex: vert,
      fragment: frag,
      uniforms: { ...scrollScene.uniforms },
      transparent: true
    })
  }).setParent(scene)
  scrollRenderer.addScene(scrollScene)
}

makeScene('.scene--voronoi', voronoiFrag)
makeScene('.scene--waves', wavesFrag)
makeScene('.scene--flow', flowFrag)

scrollRenderer.playing = true
