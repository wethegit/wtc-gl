import {
  Renderer,
  Camera,
  Obj,
  Mesh,
  Program,
  Plane,
  Uniform,
  GLTFLoader,
  Lights,
  Shadow,
  shadowShading,
  Vec2,
  Vec3
} from 'wtc-gl'

// The floating island casts onto itself, and onto a shadow catcher below it:
// a plane that draws only the shadow, so the island hangs over the page.
const vertex = /* glsl */ `#version 300 es
in vec3 position;
in vec3 normal;
uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat4 u_shadowMatrix;
uniform float u_shadowNormalBias;
out vec4 v_shadowCoord;
void main() {
  vec4 world = u_modelMatrix * vec4(position, 1.0);
  vec3 worldNormal = normalize(mat3(u_modelMatrix) * normal);
  v_shadowCoord = u_shadowMatrix * vec4(world.xyz + worldNormal * u_shadowNormalBias, 1.0);
  gl_Position = u_projectionMatrix * u_viewMatrix * world;
}`

const fragment = /* glsl */ `#version 300 es
precision highp float;
${shadowShading}
in vec4 v_shadowCoord;
out vec4 colour;
void main() {
  float dark = (1.0 - shadowFactor(v_shadowCoord)) * 0.3;
  colour = vec4(0.0, 0.0, 0.0, dark);
}`

export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
    clearColour: [0, 0, 0, 0]
  })
  const { gl } = renderer
  container.appendChild(gl.canvas)

  const camera = new Camera({ fov: 35 })
  camera.position.reset(8, 2.5, 11)
  camera.lookAt(new Vec3(0, -1.4, 0))
  const scene = new Obj()
  const lights = new Lights({ direction: [-0.3, 1, 0.4], ambient: 0.08 })
  const shadow = new Shadow(gl, { lights, mapSize: 2048 })

  // Not a caster: it only receives
  const catcher = new Mesh(gl, {
    geometry: new Plane(gl, { width: 16, height: 16 }),
    program: new Program(gl, {
      vertex,
      fragment,
      uniforms: { ...shadow.uniforms },
      transparent: true,
      depthWrite: false
    })
  })
  catcher.rotation.x = -Math.PI / 2
  catcher.updateRotation()
  catcher.position.y = -3.8
  catcher.setParent(scene)

  let gltf = null
  let disposed = false
  let elapsed = 0
  const draw = () => {
    if (!gltf) return
    gltf.scene.rotation.y = elapsed * 0.15
    gltf.scene.updateRotation()
    // The shadow map, then the scene that reads it
    shadow.render({ scene })
    renderer.render({ scene, camera })
  }
  const abort = new AbortController()
  const url = new URL('./assets/island.glb', import.meta.url).href

  GLTFLoader.load(gl, url, { lights, shadow, signal: abort.signal })
    .then((loaded) => {
      if (disposed) return loaded.remove()
      gltf = loaded
      gltf.scene.setParent(scene)
      // Fit the map to the island alone; the catcher's shadow lies inside it
      scene.updateMatrixWorld()
      shadow.add(gltf.scene).fit(gltf.scene)
      shadow.size *= 1.1
      draw()
    })
    .catch((error) => {
      if (!disposed) console.error(error)
    })

  return {
    frame(time) {
      elapsed = time
      draw()
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
    },
    dispose() {
      disposed = true
      abort.abort()
      gltf?.remove()
      catcher.geometry.remove()
      catcher.program.remove()
      shadow.remove()
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
