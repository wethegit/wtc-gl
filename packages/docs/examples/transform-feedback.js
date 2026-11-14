import {
  Renderer,
  Mesh,
  Program,
  Geometry,
  GeometryAttribute,
  TransformFeedback,
  Uniform,
  Vec2
} from 'wtc-gl'

// 4,096 points simulated on the GPU. Each step, the simulation's vertex
// shader reads every point's position and velocity, works out the next ones,
// and writes them back; nothing comes back to JavaScript.
const COUNT = 4096

const simulateVertex = /* glsl */ `#version 300 es
in vec2 a_position;
in vec2 a_velocity;
in float a_seed;
uniform float u_time;
uniform float u_dt;
out vec2 v_position;
out vec2 v_velocity;

void main() {
  vec2 p = a_position;
  // Pulled towards the centre, pushed around it, and stirred
  vec2 swirl = vec2(-p.y, p.x) / (length(p) + 0.05);
  vec2 stir = vec2(sin(p.y * 6.0 + u_time), cos(p.x * 6.0 - u_time * 1.3));
  vec2 force = -p * 1.5 + swirl * (0.3 + 0.3 * a_seed) + stir * 0.4;
  v_velocity = (a_velocity + force * u_dt) * (1.0 - 0.8 * u_dt);
  v_position = p + v_velocity * u_dt;
}`

// Nothing is drawn while simulating, but a program needs a fragment shader
const simulateFragment = /* glsl */ `#version 300 es
precision highp float;
out vec4 colour;
void main() { colour = vec4(0.0); }`

const drawVertex = /* glsl */ `#version 300 es
in vec2 position;
in vec2 velocity;
uniform float u_aspect;
uniform float u_pointSize;
out float v_speed;
void main() {
  v_speed = length(velocity);
  gl_PointSize = u_pointSize;
  gl_Position = vec4(position.x / u_aspect, position.y, 0.0, 1.0);
}`

const drawFragment = /* glsl */ `#version 300 es
precision highp float;
in float v_speed;
out vec4 colour;
void main() {
  if (length(gl_PointCoord - 0.5) > 0.5) discard;
  vec3 slow = vec3(0.29, 0.62, 1.0);
  vec3 fast = vec3(0.95, 0.42, 0.26);
  colour = vec4(mix(slow, fast, smoothstep(0.2, 0.8, v_speed)), 1.0);
}`

export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true
  })
  const { gl } = renderer
  container.appendChild(gl.canvas)

  // Starting values: scattered points, still, each with a random seed
  const positions = new Float32Array(COUNT * 2)
  const velocities = new Float32Array(COUNT * 2)
  const seeds = new Float32Array(COUNT)
  for (let i = 0; i < COUNT; i++) {
    positions[i * 2] = Math.random() * 2 - 1
    positions[i * 2 + 1] = Math.random() * 2 - 1
    seeds[i] = Math.random()
  }

  const u_time = new Uniform({ name: 'time', value: 0, kind: 'float' })
  const u_dt = new Uniform({ name: 'dt', value: 0, kind: 'float' })
  const simulation = new TransformFeedback(gl, {
    program: new Program(gl, {
      vertex: simulateVertex,
      fragment: simulateFragment,
      uniforms: { u_time, u_dt },
      transformFeedbackVaryings: ['v_position', 'v_velocity']
    }),
    attributes: {
      a_position: { size: 2, data: positions, varying: 'v_position' },
      a_velocity: { size: 2, data: velocities, varying: 'v_velocity' }
    },
    staticAttributes: {
      a_seed: new GeometryAttribute({ size: 1, data: seeds })
    }
  })

  // The points read the simulation's latest results
  const u_aspect = new Uniform({ name: 'aspect', value: 1, kind: 'float' })
  const u_pointSize = new Uniform({
    name: 'pointSize',
    value: 3,
    kind: 'float'
  })
  const points = new Mesh(gl, {
    mode: gl.POINTS,
    geometry: new Geometry(gl, {
      position: simulation.attribute('a_position'),
      velocity: simulation.attribute('a_velocity')
    }),
    program: new Program(gl, {
      vertex: drawVertex,
      fragment: drawFragment,
      uniforms: { u_aspect, u_pointSize },
      depthTest: false
    })
  })

  return {
    frame(time, delta) {
      u_time.value = time
      u_dt.value = Math.min(delta, 1 / 30)
      simulation.step()
      renderer.render({ scene: points })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      u_aspect.value = width / height
      u_pointSize.value = 3 * renderer.dpr
    },
    dispose() {
      simulation.remove()
      simulation.program.remove()
      points.geometry.remove()
      points.program.remove()
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
