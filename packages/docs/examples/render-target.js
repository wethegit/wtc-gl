import {
  Renderer,
  Camera,
  Mesh,
  Box,
  Triangle,
  Program,
  NormalProgram,
  RenderTarget,
  Uniform,
  Vec2
} from 'wtc-gl'

// Two passes: a spinning box is drawn into a render target, then a
// full-screen triangle draws the target's texture with a wobble and an RGB
// split.
const vertex = /* glsl */ `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`

const fragment = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform float u_time;
in vec2 v_uv;
out vec4 colour;
void main() {
  vec2 uv = v_uv + vec2(sin(v_uv.y * 40.0 + u_time * 4.0) * 0.004, 0.0);
  vec2 split = vec2(0.008, 0.0);
  vec4 r = texture(u_scene, uv + split);
  vec4 g = texture(u_scene, uv);
  vec4 b = texture(u_scene, uv - split);
  colour = vec4(r.r, g.g, b.b, max(max(r.a, g.a), b.a));
}`

export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true
  })
  const { gl } = renderer
  container.appendChild(gl.canvas)

  const camera = new Camera({ fov: 35 })
  camera.position.z = 4
  const box = new Mesh(gl, {
    geometry: new Box(gl),
    program: new NormalProgram(gl)
  })

  // Sized to the canvas in resize()
  const target = new RenderTarget(gl)
  const u_time = new Uniform({ name: 'time', value: 0, kind: 'float' })
  const u_scene = new Uniform({
    name: 'scene',
    value: target.texture,
    kind: 'texture'
  })
  const post = new Mesh(gl, {
    geometry: new Triangle(gl),
    program: new Program(gl, {
      vertex,
      fragment,
      uniforms: { u_scene, u_time }
    })
  })

  return {
    frame(time) {
      box.rotation.x = time * 0.4
      box.rotation.y = time * 0.6
      box.updateRotation()
      u_time.value = time
      renderer.render({ scene: box, camera, target })
      renderer.render({ scene: post })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
      // In device pixels, the same as the canvas
      target.resize(gl.canvas.width, gl.canvas.height)
    },
    dispose() {
      for (const mesh of [box, post]) {
        mesh.geometry.remove()
        mesh.program.remove()
      }
      target.remove()
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
