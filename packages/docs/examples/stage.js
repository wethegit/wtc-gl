import { Stage } from 'wtc-gl'

// A Stage sets up the renderer, an orbiting camera, lights, a shadow and a
// render loop. load() adds a glTF model lit and shadowed, and frames it.
export default function (container) {
  const stage = new Stage({
    container,
    // The page drives the frames here, so it can pause off screen
    autoplay: false,
    cameraPosition: [6, 4, 7]
  })
  stage.lights.direction = [-0.4, 0.8, 0.5]

  let island = null
  stage
    .load(new URL('./assets/island.glb', import.meta.url).href)
    .then((gltf) => {
      island = gltf.scene
      stage.render()
    })

  return {
    frame(time) {
      if (island) {
        island.rotation.y = time * 0.15
        island.updateRotation()
      }
      stage.render()
    },
    resize() {
      stage.resize()
    },
    dispose() {
      stage.destroy()
    }
  }
}
