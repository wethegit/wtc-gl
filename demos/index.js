import { FragmentShader } from 'wtc-gl'
import fragment from './hero.frag'
import vertex from './fs.vert'

const fs = new FragmentShader({ fragment, vertex })
fs.gl.canvas.classList.add('hero-canvas')
