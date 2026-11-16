import {
  Renderer,
  Camera,
  Obj,
  Mesh,
  Lights,
  LitProgram,
  Box,
  Cylinder,
  toManifold,
  fromManifold,
  Vec2,
  Vec3
} from 'wtc-gl'
import Module from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'

let loading = null
const loadManifold = () =>
  (loading ??= Module({ locateFile: () => wasmUrl }).then((wasm) => {
    wasm.setup()
    return wasm
  }))

const properties = { normal: 3, colour: 3 }

// Three arched windows and a round one, cut through a wall once, when
// manifold-3d has loaded. The window reveals take the cutters' colour.
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
  camera.position.reset(0, 0.6, 7)
  camera.lookAt(new Vec3(0, 0, 0))
  const scene = new Obj()
  const program = new LitProgram(gl, {
    lights: new Lights({ direction: [0.5, 0.8, 1] }),
    vertexColours: true
  })
  let wall = null
  let disposed = false
  let elapsed = 0
  const draw = () => {
    if (!wall) return
    wall.rotation.y = Math.sin(elapsed * 0.5) * 0.6
    wall.updateRotation()
    renderer.render({ scene, camera })
  }

  loadManifold().then((wasm) => {
    if (disposed) return
    // The manifolds made along the way, to free at the end
    const made = []
    const keep = (manifold) => (made.push(manifold), manifold)
    const make = (geometry, colour) => {
      const manifold = toManifold(wasm, geometry, {
        properties,
        fill: { colour }
      })
      geometry.remove()
      return keep(manifold)
    }
    const cream = [0.93, 0.91, 0.87]
    const orange = [0.95, 0.42, 0.26]

    const slab = make(new Box(gl, { width: 4, height: 2.4, depth: 0.3 }), cream)
    // Deeper than the wall, so they cut right through. A cylinder stands on
    // its end, so it's turned to face along z.
    const pane = make(
      new Box(gl, { width: 0.6, height: 0.8, depth: 1 }),
      orange
    )
    const round = make(
      new Cylinder(gl, {
        radiusTop: 0.3,
        radiusBottom: 0.3,
        radialSegments: 40
      }),
      orange
    )
    const disc = keep(round.rotate([90, 0, 0]))

    // An arch is a pane with a disc on top
    const cutters = [-1.2, 0, 1.2].flatMap((x) => [
      pane.translate([x, -0.35, 0]),
      disc.translate([x, 0.05, 0])
    ])
    // And a smaller disc for a porthole
    cutters.push(keep(disc.scale([0.6, 0.6, 1])).translate([0, 0.85, 0]))
    const holes = keep(wasm.Manifold.union(cutters))
    const carved = keep(slab.subtract(holes))

    wall = new Mesh(gl, {
      geometry: fromManifold(gl, carved, { properties }),
      program
    })
    wall.setParent(scene)
    // fromManifold copied what it needed, so free them all
    for (const m of [...made, ...cutters]) m.delete()
    draw()
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
      wall?.geometry.remove()
      program.remove()
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
