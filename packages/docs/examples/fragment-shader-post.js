import {
  FragmentShader,
  Framebuffer,
  Mesh,
  Program,
  Uniform,
  Vec2
} from 'wtc-gl'

// Feedback with `post`: the shader draws into a Framebuffer instead of the
// canvas, reading its own last frame, and onAfterRender shows the result.
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
uniform sampler2D u_previous;
in vec2 v_uv;
out vec4 colour;

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 60.0;
  vec2 head = vec2(0.6 * sin(t * 1.1), 0.32 * sin(t * 1.7));
  float spot = smoothstep(0.045, 0.03, distance(p, head));
  vec3 tint = 0.5 + 0.5 * cos(t * 0.5 + vec3(0.0, 2.0, 4.0));

  // Last frame, drawn slightly larger so the trail drifts outwards, and faded
  vec4 last = texture(u_previous, 0.5 + (v_uv - 0.5) * 0.996);
  last = max(last * 0.985 - 0.002, 0.0);
  colour = mix(last, vec4(tint, 1.0), spot);
}`

const show = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_result;
in vec2 v_uv;
out vec4 colour;
void main() {
  colour = texture(u_result, v_uv);
}`

export default function (container) {
  const u_previous = new Uniform({
    name: 'previous',
    value: null,
    kind: 'texture'
  })
  const u_result = new Uniform({ name: 'result', value: null, kind: 'texture' })
  let display

  const shader = new FragmentShader({
    vertex,
    fragment,
    container,
    autoResize: false,
    uniforms: { u_previous },
    rendererProps: {
      dpr: Math.min(devicePixelRatio, 2),
      alpha: true,
      premultipliedAlpha: true,
      clearColour: [0, 0, 0, 0]
    },
    // Read the last frame while the shader draws into the other target
    onBeforeRender() {
      u_previous.value = shader.post.read.texture
    },
    // Draw the frame that was just made onto the canvas
    onAfterRender() {
      u_result.value = shader.post.read.texture
      shader.renderer.render({ scene: display })
    }
  })
  shader.playing = false

  const { gl } = shader
  shader.post = new Framebuffer(gl, { dpr: shader.renderer.dpr, depth: false })
  display = new Mesh(gl, {
    geometry: shader.mesh.geometry,
    program: new Program(gl, { vertex, fragment: show, uniforms: { u_result } })
  })

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
      shader.post.resize(width, height)
    },
    dispose() {
      display.program.remove()
      shader.post.remove()
      shader.destroy()
    }
  }
}
