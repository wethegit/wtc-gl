import {
  Renderer,
  Camera,
  Obj,
  GLTFLoader,
  Lights,
  Shadow,
  Vec2,
  Vec3
} from 'wtc-gl'

// A small island made in Blender, loaded with GLTFLoader. Its materials
// become LitPrograms sharing one Lights, and it casts a Shadow onto itself.
export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true
  })
  const { gl } = renderer
  container.appendChild(gl.canvas)

  const camera = new Camera({ fov: 35 })
  camera.position.reset(6, 4, 7)
  camera.lookAt(new Vec3(0, -0.4, 0))

  const scene = new Obj()
  const lights = new Lights({ direction: [-0.4, 0.8, 0.5], ambient: 0.08 })
  const shadow = new Shadow(gl, { lights, mapSize: 2048 })

  let gltf = null
  let disposed = false
  let elapsed = 0
  const draw = () => {
    // Nothing to draw until it's loaded
    if (!gltf) return
    gltf.scene.rotation.y = elapsed * 0.15
    gltf.scene.updateRotation()
    shadow.render({ scene })
    renderer.render({ scene, camera })
  }
  const abort = new AbortController()
  // Through import.meta.url, so the bundler copies the file
  const url = new URL('./assets/island.glb', import.meta.url).href

  GLTFLoader.load(gl, url, { lights, shadow, signal: abort.signal })
    .then((loaded) => {
      if (disposed) return loaded.remove()
      gltf = loaded
      gltf.scene.setParent(scene)
      // The loader doesn't add casters. Fit the map around the island,
      // with a little room as it spins.
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
      shadow.remove()
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
