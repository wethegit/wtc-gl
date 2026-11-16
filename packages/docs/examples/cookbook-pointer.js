import { Renderer, Mesh, Program, Triangle, Uniform, Vec2 } from 'wtc-gl'

// A grid of dots that swell towards the pointer. The pointer, time and
// resolution reach the shader as uniforms, all in device pixels.
const vertex = /* glsl */ `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`

const fragment = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 u_resolution; // the canvas, in device pixels
uniform vec2 u_pointer; // smoothed, in device pixels, y up
uniform float u_hover; // 0 to 1, eased in and out
uniform float u_time;
out vec4 colour;

void main() {
  // Centred, aspect-correct: y from -0.5 to 0.5, x as wide as it needs
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  vec2 m = (u_pointer - 0.5 * u_resolution) / u_resolution.y;

  vec2 cell = p * 22.0;
  vec2 centre = (floor(cell) + 0.5) / 22.0;
  float d = length(centre - m);
  float glow = exp(-d * 6.0) * u_hover;
  float pulse = 0.5 + 0.5 * sin(u_time * 4.0 - d * 30.0);
  float r = 0.1 + 0.3 * glow * (0.7 + 0.3 * pulse);
  float disc = 1.0 - smoothstep(r - 0.05, r + 0.05, length(fract(cell) - 0.5));

  vec3 tint = mix(vec3(0.29, 0.62, 1.0), vec3(0.95, 0.42, 0.26), glow);
  float alpha = disc * (0.35 + 0.65 * glow);
  colour = vec4(tint * alpha, alpha); // premultiplied
}`

export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true,
    premultipliedAlpha: true,
    clearColour: [0, 0, 0, 0]
  })
  const { gl } = renderer
  const canvas = gl.canvas
  container.appendChild(canvas)

  const u_resolution = new Uniform({
    name: 'resolution',
    value: [1, 1],
    kind: 'float_vec2'
  })
  const u_pointer = new Uniform({
    name: 'pointer',
    value: [0, 0],
    kind: 'float_vec2'
  })
  const u_hover = new Uniform({ name: 'hover', value: 0, kind: 'float' })
  const u_time = new Uniform({ name: 'time', value: 0, kind: 'float' })
  const mesh = new Mesh(gl, {
    geometry: new Triangle(gl),
    program: new Program(gl, {
      vertex,
      fragment,
      uniforms: { u_resolution, u_pointer, u_hover, u_time }
    })
  })

  // Where the pointer is, in device pixels with y up, like gl_FragCoord
  const target = [0, 0]
  let inside = false
  const onMove = (e) => {
    const rect = canvas.getBoundingClientRect()
    target[0] = (e.clientX - rect.left) * (canvas.width / rect.width)
    target[1] = (rect.bottom - e.clientY) * (canvas.height / rect.height)
    inside = true
  }
  const onLeave = () => (inside = false)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerdown', onMove)
  canvas.addEventListener('pointerleave', onLeave)

  return {
    frame(time, delta) {
      // Ease towards the target, the same amount per second at any frame rate
      const follow = 1 - Math.exp(-delta * 10)
      const p = u_pointer.value
      p[0] += (target[0] - p[0]) * follow
      p[1] += (target[1] - p[1]) * follow
      u_hover.value +=
        ((inside ? 1 : 0) - u_hover.value) * (1 - Math.exp(-delta * 4))
      u_time.value = time
      renderer.render({ scene: mesh })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      u_resolution.value = [canvas.width, canvas.height]
      if (!inside) {
        target[0] = canvas.width / 2
        target[1] = canvas.height / 2
      }
    },
    dispose() {
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerdown', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      mesh.geometry.remove()
      mesh.program.remove()
      renderer.dispose()
      canvas.remove()
    }
  }
}
