import { FragmentShader, Vec2 } from 'wtc-gl'

// A full-screen fragment shader: FragmentShader makes the renderer, a
// triangle that covers the canvas and the render loop, and keeps u_time and
// u_resolution up to date.
const vertex = /* glsl */ `#version 300 es
in vec3 position;
in vec2 uv;
out vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = vec4(position, 1.0);
}`

const fragment = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
in vec2 v_uv;
out vec4 colour;

void main() {
  // Centred, aspect-correct coordinates
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 20.0;
  float rings = sin(length(p) * 24.0 - t * 3.0);
  vec3 a = vec3(0.29, 0.62, 1.0);
  vec3 b = vec3(0.95, 0.42, 0.26);
  colour = vec4(mix(a, b, smoothstep(-0.3, 0.3, rings + p.x)), 1.0);
}`

export default function (container) {
  const shader = new FragmentShader({
    vertex,
    fragment,
    container,
    // Sized to the container below, rather than the window
    autoResize: false
  })
  // The page drives the frames, so it can pause off screen
  shader.playing = false

  return {
    frame(time) {
      shader.render(time * 1000)
    },
    resize(width, height) {
      shader.dimensions = new Vec2(width, height)
      shader.renderer.dimensions = shader.dimensions
      shader.u_resolution.value = shader.dimensions.scaleNew(
        shader.renderer.dpr
      ).array
    },
    dispose() {
      shader.destroy()
    }
  }
}
