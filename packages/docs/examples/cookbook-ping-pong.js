import {
  Renderer,
  Framebuffer,
  Mesh,
  Program,
  Triangle,
  Uniform,
  Vec2
} from 'wtc-gl'

// A dot paints into a pair of render targets. Each frame reads the last one,
// turns it a little, fades it and draws the dot on top, leaving a trail.
const vertex = /* glsl */ `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`

const step = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D b_previous;
uniform vec2 u_dot;
uniform vec3 u_colour;
uniform float u_fade;
uniform float u_aspect;
in vec2 v_uv;
out vec4 colour;
void main() {
  // Turn and shrink the last frame about the centre, in square units
  vec2 p = (v_uv - 0.5) * vec2(u_aspect, 1.0);
  float a = 0.006;
  p = mat2(cos(a), sin(a), -sin(a), cos(a)) * p * 0.997;
  vec4 last = texture(b_previous, p / vec2(u_aspect, 1.0) + 0.5) * u_fade;

  vec2 d = (v_uv - u_dot) * vec2(u_aspect, 1.0);
  float spot = 1.0 - smoothstep(0.035, 0.045, length(d));
  colour = mix(last, vec4(u_colour, 1.0), spot);
}`

// The targets hold premultiplied colour, which the canvas expects
const show = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D b_result;
in vec2 v_uv;
out vec4 colour;
void main() {
  colour = texture(b_result, v_uv);
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

  // Sized in resize(). Half floats fade smoothly to nothing.
  const feedback = new Framebuffer(gl, {
    width: 1,
    height: 1,
    dpr: renderer.dpr,
    texdepth: Framebuffer.TEXTYPE_HALF_FLOAT,
    depth: false
  })

  const b_previous = new Uniform({
    name: 'previous',
    value: null,
    kind: 'texture'
  })
  const b_result = new Uniform({ name: 'result', value: null, kind: 'texture' })
  const u_dot = new Uniform({
    name: 'dot',
    value: [0.5, 0.5],
    kind: 'float_vec2'
  })
  const u_colour = new Uniform({
    name: 'colour',
    value: [1, 1, 1],
    kind: 'float_vec3'
  })
  const u_fade = new Uniform({ name: 'fade', value: 1, kind: 'float' })
  const u_aspect = new Uniform({ name: 'aspect', value: 1, kind: 'float' })

  const triangle = new Triangle(gl)
  const stepMesh = new Mesh(gl, {
    geometry: triangle,
    program: new Program(gl, {
      vertex,
      fragment: step,
      uniforms: { b_previous, u_dot, u_colour, u_fade, u_aspect }
    })
  })
  const showMesh = new Mesh(gl, {
    geometry: triangle,
    program: new Program(gl, { vertex, fragment: show, uniforms: { b_result } })
  })

  return {
    frame(time, delta) {
      u_dot.value = [
        0.5 + Math.sin(time * 1.3) * 0.32,
        0.5 + Math.sin(time * 1.9) * 0.3
      ]
      u_colour.value = [
        0.6 + 0.35 * Math.sin(time),
        0.5,
        0.65 - 0.35 * Math.sin(time)
      ]
      // The same fade per second at any frame rate
      u_fade.value = Math.pow(0.15, delta)

      // Read the latest frame, draw the next into the other target
      b_previous.value = feedback.read.texture
      feedback.render(renderer, { scene: stepMesh })
      // After the swap, read holds what was just drawn
      b_result.value = feedback.read.texture
      renderer.render({ scene: showMesh })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      u_aspect.value = width / height
      // New targets, so the trail starts again
      feedback.resize(width, height)
    },
    dispose() {
      triangle.remove()
      stepMesh.program.remove()
      showMesh.program.remove()
      feedback.remove()
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
