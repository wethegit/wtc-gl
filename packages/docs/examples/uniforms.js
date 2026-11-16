import { Renderer, Mesh, Program, Triangle, Uniform, Vec2 } from 'wtc-gl'

// Four kinds of uniform: a float, a vec2, an array of vec3s and an int.
// The program's uniforms are keyed by their names in the shader.
const vertex = /* glsl */ `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`

const fragment = /* glsl */ `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec3 u_colours[3];
uniform int u_count;
out vec4 colour;

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  colour = vec4(0.0);
  for (int i = 0; i < u_count; i++) {
    float a = u_time * 0.7 + float(i) * 2.094;
    float disc = 1.0 - smoothstep(0.19, 0.2, length(p - vec2(cos(a), sin(a)) * 0.22));
    colour = mix(colour, vec4(u_colours[i], 1.0), disc);
  }
}`

export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true,
    // The shader mixes colour and alpha together, so they're premultiplied
    premultipliedAlpha: true
  })
  const { gl } = renderer
  container.appendChild(gl.canvas)

  const u_time = new Uniform({ name: 'time', value: 0, kind: 'float' })
  const u_resolution = new Uniform({
    name: 'resolution',
    value: [1, 1],
    kind: 'float_vec2'
  })
  // An array uniform takes all its values in one flat array
  const u_colours = new Uniform({
    name: 'colours',
    value: [0.29, 0.62, 1, 0.95, 0.42, 0.26, 0.98, 0.78, 0.2],
    kind: 'float_vec3'
  })
  const u_count = new Uniform({ name: 'count', value: 3, kind: 'int' })

  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: { u_time, u_resolution, u_colours, u_count }
  })
  const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })

  return {
    frame(time) {
      u_time.value = time
      // Changing an array in place is seen: values are compared, not arrays
      u_colours.value[2] = 0.6 + 0.4 * Math.sin(time * 2)
      renderer.render({ scene: mesh })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      // In device pixels, to match gl_FragCoord
      u_resolution.value = [gl.canvas.width, gl.canvas.height]
    },
    dispose() {
      mesh.geometry.remove()
      program.remove()
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
