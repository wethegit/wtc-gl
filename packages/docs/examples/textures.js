import {
  Renderer,
  Camera,
  Mesh,
  Plane,
  Program,
  Texture,
  Uniform,
  Vec2
} from 'wtc-gl'

// A canvas drawn each frame and used as a repeating texture on a floor.
// Mipmaps and anisotropic filtering keep it clean as it recedes.
const vertex = /* glsl */ `#version 300 es
in vec3 position;
in vec2 uv;
uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
out vec2 v_uv;
void main() {
  v_uv = uv * 6.0;
  gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(position, 1.0);
}`

const fragment = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_map;
in vec2 v_uv;
out vec4 colour;
void main() {
  colour = texture(u_map, v_uv);
}`

export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true,
    antialias: true
  })
  const { gl } = renderer
  container.appendChild(gl.canvas)

  const camera = new Camera({ fov: 35 })
  camera.position.z = 3

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  const map = new Texture(gl, {
    image: canvas,
    wrapS: gl.REPEAT,
    wrapT: gl.REPEAT,
    minFilter: gl.LINEAR_MIPMAP_LINEAR,
    anisotropy: 8
  })
  const u_map = new Uniform({ name: 'map', value: map, kind: 'texture' })

  const program = new Program(gl, { vertex, fragment, uniforms: { u_map } })
  const floor = new Mesh(gl, {
    geometry: new Plane(gl, { width: 8, height: 8 }),
    program
  })
  floor.rotation.x = -1.15
  floor.updateRotation()

  return {
    frame(time) {
      ctx.fillStyle = '#4a9eff'
      ctx.fillRect(0, 0, 128, 128)
      ctx.fillStyle = '#f26b42'
      ctx.fillRect(0, 0, 64, 64)
      ctx.fillRect(64, 64, 64, 64)
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(64 + Math.cos(time) * 40, 64 + Math.sin(time) * 40, 14, 0, 7)
      ctx.fill()
      // Same canvas, new pixels: ask for another upload
      map.needsUpdate = true
      renderer.render({ scene: floor, camera })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
    },
    dispose() {
      floor.geometry.remove()
      program.remove()
      map.remove()
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
