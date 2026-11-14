import { Renderer, Camera, Mesh, Program, Sphere, Uniform, Vec2 } from 'wtc-gl'

// A sphere with its own shaders: the vertex shader pushes each vertex out
// along its normal, and the fragment shader colours it by its normal.
const vertex = /* glsl */ `#version 300 es
in vec3 position;
in vec3 normal;

// Set by the mesh for every draw
uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;
// Ours
uniform float u_time;

out vec3 v_normal;
out float v_bump;

void main() {
  vec3 p = position * 5.0;
  float bump = sin(p.x + u_time * 2.0) * sin(p.y + u_time * 1.4) * sin(p.z);
  v_bump = bump;
  v_normal = u_normalMatrix * normal;
  vec3 displaced = position + normal * bump * 0.15;
  gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(displaced, 1.0);
}`

const fragment = /* glsl */ `#version 300 es
precision highp float;
in vec3 v_normal;
in float v_bump;
out vec4 colour;

void main() {
  vec3 n = normalize(v_normal);
  colour = vec4((n * 0.5 + 0.5) * (0.8 + 0.2 * v_bump), 1.0);
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
  camera.position.z = 5

  const u_time = new Uniform({ name: 'time', value: 0, kind: 'float' })
  const program = new Program(gl, { vertex, fragment, uniforms: { u_time } })
  const sphere = new Mesh(gl, {
    geometry: new Sphere(gl, {
      radius: 1,
      widthSegments: 96,
      heightSegments: 48
    }),
    program
  })

  return {
    frame(time) {
      u_time.value = time
      sphere.rotation.y = time * 0.3
      sphere.updateRotation()
      renderer.render({ scene: sphere, camera })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
    },
    dispose() {
      sphere.geometry.remove()
      program.remove()
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
