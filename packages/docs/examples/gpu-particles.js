import { Renderer, GPUSimulation, Uniform, Vec2 } from 'wtc-gl'

// 16,384 particles simulated on the GPU. Each has a position and a velocity,
// kept in two float textures that the step shader writes in one pass. They
// drift through a flow field and scatter away from the pointer.
const step = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D b_position;
uniform sampler2D b_velocity;
uniform float u_time;
uniform float u_delta;
uniform vec2 u_pointer;
uniform float u_pointerStrength;
in vec2 v_uv;
layout(location = 0) out vec4 position;
layout(location = 1) out vec4 velocity;

vec2 field(vec2 p, float t) {
  return vec2(
    sin(p.y * 3.1 + t * 0.7) + sin(p.y * 1.7 - t * 0.4),
    cos(p.x * 2.9 - t * 0.5) + cos(p.x * 1.3 + t * 0.3)
  );
}

void main() {
  vec2 p = texture(b_position, v_uv).xy;
  vec2 v = texture(b_velocity, v_uv).xy;

  vec2 force = field(p * 1.5, u_time) * 0.8 - p * 0.6;
  vec2 away = p - u_pointer;
  force += u_pointerStrength * normalize(away + 1e-5) * 0.15 / (0.01 + dot(away, away));

  v = (v + force * u_delta) * exp(-1.6 * u_delta);
  position = vec4(p + v * u_delta, 0.0, 1.0);
  velocity = vec4(v, 0.0, 0.0);
}`

const vertex = /* glsl */ `#version 300 es
in vec3 position;
in vec2 reference;
uniform sampler2D b_position;
uniform sampler2D b_velocity;
uniform vec2 u_scale;
uniform float u_pointSize;
out float v_speed;
void main() {
  vec2 p = texture(b_position, reference).xy;
  v_speed = length(texture(b_velocity, reference).xy);
  gl_PointSize = u_pointSize;
  gl_Position = vec4(p * u_scale, 0.0, 1.0);
}`

const fragment = /* glsl */ `#version 300 es
precision highp float;
in float v_speed;
out vec4 colour;
void main() {
  vec3 slow = vec3(0.29, 0.62, 1.0);
  vec3 fast = vec3(0.95, 0.42, 0.26);
  vec3 c = mix(slow, fast, smoothstep(0.2, 1.2, v_speed));
  colour = vec4(c, 1.0) * 0.8;
}`

export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true,
    premultipliedAlpha: true,
    clearColour: [0, 0, 0, 0]
  })
  const { gl } = renderer
  container.appendChild(gl.canvas)

  const pointer = new Uniform({
    name: 'pointer',
    value: [9, 9],
    kind: 'float_vec2'
  })
  const pointerStrength = new Uniform({
    name: 'pointerStrength',
    value: 0,
    kind: 'float'
  })
  const sim = new GPUSimulation(gl, {
    size: 128,
    state: ['position', 'velocity'],
    fragment: step,
    uniforms: { u_pointer: pointer, u_pointerStrength: pointerStrength },
    // Start spread over a disc, at rest
    initial: () => {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * 0.8
      return { position: [Math.cos(a) * r, Math.sin(a) * r, 0, 1] }
    }
  })

  const scale = new Uniform({
    name: 'scale',
    value: [1, 1],
    kind: 'float_vec2'
  })
  const pointSize = new Uniform({ name: 'pointSize', value: 2, kind: 'float' })
  const points = sim.points({
    vertex,
    fragment,
    uniforms: { u_scale: scale, u_pointSize: pointSize },
    transparent: true,
    depthTest: false
  })

  // The pointer, in the simulation's space: y from -1 to 1, x by the aspect
  const onMove = (e) => {
    const rect = gl.canvas.getBoundingClientRect()
    const aspect = rect.width / rect.height
    pointer.value = [
      ((e.clientX - rect.left) / rect.width) * 2 * aspect - aspect,
      1 - ((e.clientY - rect.top) / rect.height) * 2
    ]
    pointerStrength.value = 1
  }
  const onLeave = () => (pointerStrength.value = 0)
  gl.canvas.addEventListener('pointermove', onMove)
  gl.canvas.addEventListener('pointerleave', onLeave)

  return {
    frame(time, delta) {
      // A few small steps a frame keep it stable at any frame rate
      const steps = 2
      for (let i = 0; i < steps; i++) sim.step(Math.min(delta, 1 / 30) / steps)
      renderer.render({ scene: points })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      scale.value = [height / width, 1]
      pointSize.value = 1.5 * renderer.dpr
    },
    dispose() {
      gl.canvas.removeEventListener('pointermove', onMove)
      gl.canvas.removeEventListener('pointerleave', onLeave)
      sim.remove()
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
