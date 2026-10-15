import {
  Renderer,
  Obj,
  Mesh,
  Program,
  Uniform,
  TransformFeedback,
  Geometry,
  GeometryAttribute,
  Vec2
} from 'wtc-gl'

import simulateVertex from './simulate.vert'
import simulateFragment from './simulate.frag'
import agentVertex from './agent.vert'
import agentFragment from './agent.frag'
import glowVertex from './glow.vert'
import glowFragment from './glow.frag'

// Thousands of agents simulated on the GPU with a TransformFeedback, then
// drawn twice from the same results:
//
// - The simulation runs on its own. step() advances every agent without
//   drawing anything, so it can run several times a frame (the substeps
//   control) independently of rendering.
// - Position and velocity are captured interleaved into one buffer per side,
//   and each agent's seed is a static attribute, uploaded once.
// - The arrows are an instanced triangle, using the simulated position and
//   velocity as per-instance attributes. The glow is a point per agent, read
//   from the same buffers by a different program.
// - Reset scatters the agents and starts the simulation again with reset().

const COUNT = 8192

const renderer = new Renderer({
  dpr: Math.min(window.devicePixelRatio, 2),
  clearColour: [0.03, 0.03, 0.07, 1]
})
const { gl } = renderer
document.body.appendChild(gl.canvas)

const u_time = new Uniform({ name: 'u_time', value: 0, kind: 'float' })
const u_dt = new Uniform({ name: 'u_dt', value: 0, kind: 'float' })
const u_aspect = new Uniform({ name: 'u_aspect', value: 1, kind: 'float' })
const u_target = new Uniform({
  name: 'u_target',
  value: [0, 0],
  kind: 'float_vec2'
})
const u_pointSize = new Uniform({
  name: 'u_pointSize',
  value: 24,
  kind: 'float'
})

// Starting state. reset() re-uploads these, so scatter() refills them first.
const positions = new Float32Array(COUNT * 2)
const velocities = new Float32Array(COUNT * 2)
const seeds = new Float32Array(COUNT)
for (let i = 0; i < COUNT; i++) seeds[i] = Math.random()

const scatter = () => {
  const aspect = u_aspect.value
  for (let i = 0; i < COUNT; i++) {
    positions[i * 2] = (Math.random() * 2 - 1) * aspect
    positions[i * 2 + 1] = Math.random() * 2 - 1
    velocities[i * 2] = 0
    velocities[i * 2 + 1] = 0
  }
}

const simulation = new TransformFeedback(gl, {
  program: new Program(gl, {
    vertex: simulateVertex,
    fragment: simulateFragment,
    uniforms: { u_target, u_time, u_dt, u_aspect },
    transformFeedbackVaryings: ['v_position', 'v_velocity'],
    transformFeedbackBufferMode: 'interleaved'
  }),
  attributes: {
    a_position: { data: positions, size: 2, varying: 'v_position' },
    a_velocity: { data: velocities, size: 2, varying: 'v_velocity' }
  },
  staticAttributes: {
    a_seed: new GeometryAttribute({ size: 1, data: seeds })
  }
})

const scene = new Obj()

// Glow: a point per agent, blended additively so dense parts of the swarm
// bloom
const glowProgram = new Program(gl, {
  vertex: glowVertex,
  fragment: glowFragment,
  uniforms: { u_aspect, u_pointSize },
  transparent: true,
  depthTest: false
})
glowProgram.setBlendFunc(gl.SRC_ALPHA, gl.ONE)
new Mesh(gl, {
  mode: gl.POINTS,
  geometry: new Geometry(gl, {
    a_position: simulation.attribute('a_position')
  }),
  program: glowProgram
}).setParent(scene)

// Arrows: one instanced triangle per agent
const arrowProgram = new Program(gl, {
  vertex: agentVertex,
  fragment: agentFragment,
  uniforms: { u_aspect },
  transparent: true,
  depthTest: false
})
new Mesh(gl, {
  geometry: new Geometry(gl, {
    position: new GeometryAttribute({
      size: 2,
      data: new Float32Array([1, 0, -0.6, 0.5, -0.6, -0.5])
    }),
    a_position: simulation.attribute('a_position', { instanced: 1 }),
    a_velocity: simulation.attribute('a_velocity', { instanced: 1 })
  }),
  program: arrowProgram
}).setParent(scene)

// Controls
const substepsInput = document.getElementById('substeps')
const substepsValue = document.getElementById('substeps-value')
let substeps = Number(substepsInput.value)
substepsInput.addEventListener('input', () => {
  substeps = Number(substepsInput.value)
  substepsValue.textContent = substeps
})

document.getElementById('reset').addEventListener('click', () => {
  scatter()
  simulation.reset()
})

// The pointer leads the swarm; when it's idle, the target wanders
const pointer = { x: 0, y: 0, lastMoved: -Infinity }
gl.canvas.addEventListener('pointermove', (event) => {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1
  pointer.y = 1 - (event.clientY / window.innerHeight) * 2
  pointer.lastMoved = performance.now()
})

const resize = () => {
  renderer.dimensions = new Vec2(window.innerWidth, window.innerHeight)
  u_aspect.value = window.innerWidth / window.innerHeight
  u_pointSize.value = 24 * renderer.dpr
}
window.addEventListener('resize', resize)
resize()
scatter()
simulation.reset()

const target = [0, 0]
let last = performance.now()
const run = (now) => {
  requestAnimationFrame(run)
  // Cap the step so a backgrounded tab doesn't fling the swarm on return
  const delta = Math.min((now - last) / 1000, 1 / 30)
  last = now

  const aspect = u_aspect.value
  const t = now / 1000
  if (now - pointer.lastMoved < 2000) {
    target[0] = pointer.x * aspect
    target[1] = pointer.y
  } else {
    target[0] = Math.sin(t * 0.37) * aspect * 0.6
    target[1] = Math.sin(t * 0.61) * 0.55
  }
  u_target.value = target

  // Substeps split the frame's time, so the swarm moves at the same speed
  // but each step is smaller and smoother
  u_dt.value = delta / substeps
  for (let i = 0; i < substeps; i++) {
    u_time.value += u_dt.value
    simulation.step()
  }

  renderer.render({ scene, sort: false })
}
requestAnimationFrame(run)
