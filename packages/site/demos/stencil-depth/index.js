import {
  Renderer,
  RenderTarget,
  DollyCamera,
  Obj,
  Mesh,
  Program,
  Uniform,
  Box,
  Sphere,
  Plane,
  Triangle,
  Vec2,
  Vec3
} from 'wtc-gl'

import sceneVert from './scene.vert'
import sceneFrag from './scene.frag'
import portalFrag from './portal.frag'
import screenVert from './screen.vert'
import depthResetFrag from './depth-reset.frag'
import postFrag from './post.frag'

// One render target holds colour plus a shared DEPTH24_STENCIL8 texture.
// Each frame:
//   1. Draw the outside world (boxes) and the portal's ring.
//   2. Draw the portal disc into the stencil only, depth tested so anything
//      in front of the portal still hides it.
//   3. Where the stencil is set, push depth back to the far plane.
//   4. Draw the inside world (spheres), only where the stencil is set.
//   5. Post pass: sample the depth texture for fog and outlines.

const FAR = 40
const NEAR = 0.1
const FOG = [0.05, 0.06, 0.1]

const renderer = new Renderer({
  dpr: Math.min(window.devicePixelRatio, 2),
  clearColour: [...FOG, 1]
})
const { gl } = renderer
document.body.appendChild(gl.canvas)

const camera = new DollyCamera(
  {
    element: gl.canvas,
    target: new Vec3(0, 1.2, 0),
    autoRotate: true,
    autoRotateSpeed: 0.4,
    minDistance: 3,
    maxDistance: 16,
    maxPolarAngle: Math.PI * 0.48
  },
  { fov: 50, near: NEAR, far: FAR }
)
camera.setPosition(0, 2.4, 8)

// Shared by every program so the view buttons switch everything at once
const u_mode = new Uniform({ name: 'mode', value: 0, kind: 'int' })

const sceneProgram = (low, high, inside, options = {}) =>
  new Program(gl, {
    vertex: sceneVert,
    fragment: sceneFrag,
    uniforms: {
      u_low: new Uniform({ name: 'low', value: low, kind: 'float_vec3' }),
      u_high: new Uniform({ name: 'high', value: high, kind: 'float_vec3' }),
      u_inside: new Uniform({ name: 'inside', value: inside, kind: 'float' }),
      u_mode
    },
    ...options
  })

// ── Outside: a field of boxes ─────────────────────────────────────────────
const outside = new Obj()
const boxProgram = sceneProgram([0.16, 0.2, 0.32], [0.55, 0.62, 0.8], 0)
const boxGeometry = new Box(gl)
for (let x = -6; x <= 6; x += 1.2) {
  for (let z = -6; z <= 6; z += 1.2) {
    // Leave room around the portal
    if (Math.abs(x) < 1.5 && Math.abs(z) < 1.5) continue
    const height = 0.3 + Math.random() * 1.8
    const box = new Mesh(gl, { geometry: boxGeometry, program: boxProgram })
    box.position.reset(x, height / 2, z)
    box.scale.reset(0.8, height, 0.8)
    box.setParent(outside)
  }
}
const floor = new Mesh(gl, {
  geometry: new Box(gl, { width: 16, height: 0.1, depth: 16 }),
  program: sceneProgram([0.08, 0.1, 0.16], [0.08, 0.1, 0.16], 0)
})
floor.position.reset(0, -0.05, 0)
floor.setParent(outside)

// ── The portal: a disc for the stencil, and a ring around it ─────────────
const portal = new Obj()
portal.position.reset(0, 1.4, 0)
const portalGeometry = new Plane(gl, { width: 2.4, height: 2.4 })
const portalProgram = (ring, options) =>
  new Program(gl, {
    vertex: sceneVert,
    fragment: portalFrag,
    uniforms: {
      u_ring: new Uniform({ name: 'ring', value: ring, kind: 'float' })
    },
    cullFace: null,
    ...options
  })
const ring = new Mesh(gl, {
  geometry: portalGeometry,
  program: portalProgram(1)
})
ring.setParent(portal)
outside.addChild(portal)

const maskScene = new Obj()
const disc = new Mesh(gl, {
  geometry: portalGeometry,
  // Tested against the outside world's depth, but doesn't write any
  program: portalProgram(0, { depthWrite: false })
})
maskScene.addChild(disc)

// A full-screen triangle that sets depth to the far plane wherever it draws
const depthReset = new Mesh(gl, {
  geometry: new Triangle(gl),
  program: new Program(gl, {
    vertex: screenVert,
    fragment: depthResetFrag,
    depthFunc: gl.ALWAYS,
    cullFace: null
  })
})
depthReset.frustumCulled = false

// ── Inside: floating spheres under a warm sky ─────────────────────────────
const inside = new Obj()
const sphereProgram = sceneProgram([0.9, 0.35, 0.45], [1.0, 0.8, 0.45], 1)
const sphereGeometry = new Sphere(gl, { radius: 0.5, widthSegments: 32 })
const spheres = []
for (let i = 0; i < 9; i++) {
  const sphere = new Mesh(gl, {
    geometry: sphereGeometry,
    program: sphereProgram
  })
  sphere.setParent(inside)
  spheres.push(sphere)
}
const sky = new Mesh(gl, {
  geometry: new Sphere(gl, { radius: 18, widthSegments: 24 }),
  // Seen from inside, so draw the back faces
  program: sceneProgram([0.35, 0.15, 0.3], [0.95, 0.55, 0.35], 1, {
    cullFace: gl.FRONT
  })
})
sky.setParent(inside)
const insideFloor = new Mesh(gl, {
  geometry: new Box(gl, { width: 40, height: 0.1, depth: 40 }),
  program: sceneProgram([0.3, 0.12, 0.2], [0.3, 0.12, 0.2], 1)
})
insideFloor.position.reset(0, -0.05, 0)
insideFloor.setParent(inside)

// ── Post pass ────────────────────────────────────────────────────────────
const post = {
  u_colour: new Uniform({ name: 'colour', value: null, kind: 'texture' }),
  u_depth: new Uniform({ name: 'depth', value: null, kind: 'texture' }),
  u_texel: new Uniform({ name: 'texel', value: [0, 0], kind: 'float_vec2' }),
  u_near: new Uniform({ name: 'near', value: NEAR, kind: 'float' }),
  u_far: new Uniform({ name: 'far', value: FAR, kind: 'float' }),
  u_fog: new Uniform({ name: 'fog', value: FOG, kind: 'float_vec3' }),
  u_mode
}
const postMesh = new Mesh(gl, {
  geometry: new Triangle(gl),
  program: new Program(gl, {
    vertex: screenVert,
    fragment: postFrag,
    uniforms: post,
    depthTest: false,
    cullFace: null
  })
})

// ── Render target ────────────────────────────────────────────────────────
let target

const resize = () => {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.dimensions = new Vec2(width, height)
  camera.perspective({ aspect: width / height })

  // RenderTarget has no resize, so make a new one
  target?.remove()
  target = new RenderTarget(gl, {
    width: width * renderer.dpr,
    height: height * renderer.dpr,
    // Depth and stencil share one DEPTH24_STENCIL8 texture
    stencil: true
  })
  post.u_colour.value = target.texture
  post.u_depth.value = target.depthTexture
  post.u_texel.value = [1 / target.width, 1 / target.height]
}
window.addEventListener('resize', resize)
resize()

// ── View buttons (also keys 1, 2, 3) ──────────────────────────────────────
const buttons = [...document.querySelectorAll('[data-mode]')]
const setMode = (mode) => {
  u_mode.value = mode
  buttons.forEach((b) =>
    b.setAttribute('aria-pressed', String(Number(b.dataset.mode) === mode))
  )
}
buttons.forEach((b) =>
  b.addEventListener('click', () => setMode(Number(b.dataset.mode)))
)
window.addEventListener('keydown', (e) => {
  if (['1', '2', '3'].includes(e.key)) setMode(Number(e.key) - 1)
})

// ── Loop ─────────────────────────────────────────────────────────────────
const run = (t) => {
  requestAnimationFrame(run)
  const time = t * 0.001

  camera.update()

  portal.rotation.y = time * 0.3
  portal.updateRotation()
  disc.position.resetToVector(portal.position)
  disc.quaternion = portal.quaternion

  spheres.forEach((sphere, i) => {
    const a = (i / spheres.length) * Math.PI * 2 + time * 0.4
    sphere.position.reset(
      Math.cos(a) * 3,
      1.2 + Math.sin(time * 1.3 + i) * 0.6,
      Math.sin(a) * 3
    )
  })

  // 1. Outside world. Clears colour, depth and stencil.
  gl.disable(gl.STENCIL_TEST)
  renderer.render({ scene: outside, camera, target })

  // 2. Mark the visible part of the portal in the stencil
  gl.enable(gl.STENCIL_TEST)
  gl.stencilFunc(gl.ALWAYS, 1, 0xff)
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE)
  gl.colorMask(false, false, false, false)
  renderer.render({ scene: maskScene, camera, target, clear: false })

  // 3. Reset depth inside the portal
  gl.stencilFunc(gl.EQUAL, 1, 0xff)
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP)
  renderer.render({ scene: depthReset, camera, target, clear: false })

  // 4. The inside world, only through the portal
  gl.colorMask(true, true, true, true)
  renderer.render({ scene: inside, camera, target, clear: false })

  // 5. To the canvas
  gl.disable(gl.STENCIL_TEST)
  renderer.render({ scene: postMesh })
}
requestAnimationFrame(run)
