import {
  ScrollRenderer,
  ScrollImage,
  ScrollHTML,
  Program,
  Mesh,
  Plane,
  Drawable,
  Uniform
} from '../../src/lib'

import clothVert    from './cloth.vert'
import clothFrag    from './cloth.frag'
import htmlClothFrag from './html-cloth.frag'
import hueVert      from './hue.vert'
import hueFrag      from './hue.frag'

// ── Verlet cloth sim ─────────────────────────────────────────────────────────

class ClothSim {
  constructor(
    cols,
    rows,
    {
      gravity = 3.5e-5,
      damping = 0.985,
      compressFactor = 0.4,
      stretchFactor = 1.0,
      iterations = 10
    } = {}
  ) {
    this.cols = cols
    this.rows = rows
    this.gravity = gravity
    this.damping = damping
    this.iterations = iterations

    const n = (cols + 1) * (rows + 1)
    this.n = n

    this.pos    = new Float32Array(n * 2)
    this.prev   = new Float32Array(n * 2)
    this.pinned = new Uint8Array(n)
    this.grabbedIdx = -1
    this.grabX = 0
    this.grabY = 0

    for (let iy = 0; iy <= rows; iy++) {
      for (let ix = 0; ix <= cols; ix++) {
        const i = iy * (cols + 1) + ix
        const x = (ix / cols) * 2 - 1
        const y = 1 - (iy / rows) * 2
        this.pos[i * 2]     = x
        this.pos[i * 2 + 1] = y
        const j = iy > 0 ? 5e-4 : 0
        this.prev[i * 2]     = x + (Math.random() - 0.5) * j
        this.prev[i * 2 + 1] = y + (Math.random() - 0.5) * j
        this.pinned[i] = iy === 0 ? 1 : 0
      }
    }

    const hA = [], hB = [], hMin = [], hMax = []
    const dh = 2 / cols
    for (let iy = 0; iy <= rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        const a = iy * (cols + 1) + ix
        hA.push(a); hB.push(a + 1)
        hMin.push(dh * compressFactor); hMax.push(dh * stretchFactor)
      }
    }
    this.hA = new Uint32Array(hA); this.hB = new Uint32Array(hB)
    this.hMin = new Float32Array(hMin); this.hMax = new Float32Array(hMax)
    this.numH = hA.length

    const vA = [], vB = [], vMin = [], vMax = []
    const dv = 2 / rows
    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix <= cols; ix++) {
        const a = iy * (cols + 1) + ix
        vA.push(a); vB.push(a + cols + 1)
        vMin.push(dv * compressFactor); vMax.push(dv * stretchFactor)
      }
    }
    this.vA = new Uint32Array(vA); this.vB = new Uint32Array(vB)
    this.vMin = new Float32Array(vMin); this.vMax = new Float32Array(vMax)
    this.numV = vA.length
  }

  step(delta, time, scrollImpulse = 0) {
    const { pos, prev, pinned, n, gravity, damping, iterations, grabbedIdx, grabX, grabY } = this
    const s = time * 0.001

    if (grabbedIdx >= 0) {
      pos[grabbedIdx * 2]     = grabX
      pos[grabbedIdx * 2 + 1] = grabY
      prev[grabbedIdx * 2]    = grabX
      prev[grabbedIdx * 2 + 1] = grabY
    }

    for (let i = 0; i < n; i++) {
      if (pinned[i] === 1 || i === grabbedIdx) continue
      const px = pos[i * 2], py = pos[i * 2 + 1]
      const spatial =
        (Math.sin((px * 3 + py * 5) * Math.PI - s * 50000) +
          Math.cos(px * 5 + py + s * 10000)) * 0.0001
      const vx = (px - prev[i * 2]) * damping + spatial
      const vy = (py - (prev[i * 2 + 1] + scrollImpulse)) * damping
      prev[i * 2]     = px
      prev[i * 2 + 1] = py
      pos[i * 2]     = px + vx
      pos[i * 2 + 1] = py + vy - gravity * delta
    }

    const { hA, hB, hMin, hMax, numH, vA, vB, vMin, vMax, numV } = this
    for (let iter = 0; iter < iterations; iter++) {
      for (let ci = 0; ci < numH; ci++) {
        const a = hA[ci], b = hB[ci]
        const dx = pos[b * 2] - pos[a * 2], dy = pos[b * 2 + 1] - pos[a * 2 + 1]
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist === 0) continue
        let target = hMin[ci]
        if (dist > hMax[ci]) target = hMax[ci]
        else if (dist >= hMin[ci]) continue
        const pct = ((target - dist) / dist) * 0.5
        const ox = dx * pct, oy = dy * pct
        if (!pinned[a]) { pos[a * 2] -= ox; pos[a * 2 + 1] -= oy }
        if (!pinned[b]) { pos[b * 2] += ox; pos[b * 2 + 1] += oy }
      }
      for (let ci = 0; ci < numV; ci++) {
        const a = vA[ci], b = vB[ci]
        const dx = pos[b * 2] - pos[a * 2], dy = pos[b * 2 + 1] - pos[a * 2 + 1]
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist === 0) continue
        let target = vMin[ci]
        if (dist > vMax[ci]) target = vMax[ci]
        else if (dist >= vMin[ci]) continue
        const pct = ((target - dist) / dist) * 0.5
        const ox = dx * pct, oy = dy * pct
        if (!pinned[a]) { pos[a * 2] -= ox; pos[a * 2 + 1] -= oy }
        if (!pinned[b]) { pos[b * 2] += ox; pos[b * 2 + 1] += oy }
      }
      if (this.grabbedIdx >= 0) {
        pos[this.grabbedIdx * 2]     = this.grabX
        pos[this.grabbedIdx * 2 + 1] = this.grabY
      }
    }
    if (this.grabbedIdx >= 0) {
      pos[this.grabbedIdx * 2]      = this.grabX
      pos[this.grabbedIdx * 2 + 1]  = this.grabY
      prev[this.grabbedIdx * 2]     = this.grabX
      prev[this.grabbedIdx * 2 + 1] = this.grabY
    }
  }

  nearestParticle(mx, my, radius = 0.25) {
    const r2 = radius * radius
    let bestIdx = -1, bestD2 = r2
    for (let i = 0; i < this.n; i++) {
      if (this.pinned[i] === 1) continue
      const dx = this.pos[i * 2] - mx, dy = this.pos[i * 2 + 1] - my
      const d2 = dx * dx + dy * dy
      if (d2 < bestD2) { bestD2 = d2; bestIdx = i }
    }
    return bestIdx
  }

  grab(idx) {
    this.grabbedIdx = idx
    this.grabX = this.pos[idx * 2]
    this.grabY = this.pos[idx * 2 + 1]
  }

  moveGrabbed(x, y) { this.grabX = x; this.grabY = y }
  release() { this.grabbedIdx = -1 }

  writePositions(buf) {
    for (let i = 0; i < this.n; i++) {
      buf[i * 3]     = this.pos[i * 2]
      buf[i * 3 + 1] = this.pos[i * 2 + 1]
      buf[i * 3 + 2] = 0
    }
  }
}

// ── Renderer ─────────────────────────────────────────────────────────────────

const scrollRenderer = new ScrollRenderer({ rendererProps: { antialias: true } })
Object.assign(scrollRenderer.canvas.style, {
  position: 'fixed',
  top: '0', left: '0',
  width: '100%', height: '100%',
  pointerEvents: 'none',
  zIndex: '1'
})
document.body.appendChild(scrollRenderer.canvas)

const { gl } = scrollRenderer

// Cloth scenes that support pointer grab
const clothScenes = []

// Scroll velocity
let scrollAccum = 0
let prevScrollY = window.scrollY
window.addEventListener('scroll', () => {
  scrollAccum += window.scrollY - prevScrollY
  prevScrollY = window.scrollY
})

// Grab state
let grabSim = null, grabScene = null

document.addEventListener('pointerdown', (e) => {
  if (grabSim) { grabSim.release(); grabSim = null; grabScene = null }

  for (const { scene, sim, captureCanvas, htmlEl, proxies } of clothScenes) {
    const r = scene.element.getBoundingClientRect()
    if (e.clientX < r.left || e.clientX > r.right ||
        e.clientY < r.top  || e.clientY > r.bottom) continue

    const mx = ((e.clientX - r.left) / r.width)  * 2 - 1
    const my = 1 - ((e.clientY - r.top)  / r.height) * 2

    if (captureCanvas && htmlEl) {
      // Element positions must be normalised against htmlEl (the texture source),
      // not the panel — the texture is htmlEl-sized but the mesh covers the panel,
      // so the two heights differ by a ~1.54× stretch factor.
      const htmlElRect = htmlEl.getBoundingClientRect()
      const hw = htmlEl.offsetWidth
      const hh = htmlEl.offsetHeight
      for (const el of htmlEl.querySelectorAll('input, textarea, button, select')) {
        const er = el.getBoundingClientRect()
        const ixMin = Math.floor((er.left   - htmlElRect.left) / hw * COLS)
        const ixMax = Math.ceil( (er.right  - htmlElRect.left) / hw * COLS)
        const iyMin = Math.floor((er.top    - htmlElRect.top)  / hh * ROWS)
        const iyMax = Math.ceil( (er.bottom - htmlElRect.top)  / hh * ROWS)
        let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
        for (let iy = iyMin; iy <= Math.min(iyMax, ROWS); iy++) {
          for (let ix = ixMin; ix <= Math.min(ixMax, COLS); ix++) {
            const i = iy * (COLS + 1) + ix
            xMin = Math.min(xMin, sim.pos[i * 2])
            xMax = Math.max(xMax, sim.pos[i * 2])
            yMin = Math.min(yMin, sim.pos[i * 2 + 1])
            yMax = Math.max(yMax, sim.pos[i * 2 + 1])
          }
        }
        if (mx >= xMin && mx <= xMax && my >= yMin && my <= yMax) {
          const proxy = proxies?.get(el)
          if (proxy) { proxy.value = el.value; proxy.focus() }
          break
        }
      }
      e.preventDefault()
      return
    }

    const idx = sim.nearestParticle(mx, my)
    if (idx >= 0) {
      sim.grab(idx)
      sim.moveGrabbed(mx, my)
      grabSim = sim
      grabScene = scene
      e.preventDefault()
    }
    break
  }
})

document.addEventListener('pointermove', (e) => {
  if (!grabSim) return
  const rect = grabScene.element.getBoundingClientRect()
  grabSim.moveGrabbed(
    ((e.clientX - rect.left) / rect.width)  * 2 - 1,
    1 - ((e.clientY - rect.top)  / rect.height) * 2
  )
})

function releaseGrab() {
  if (grabSim) grabSim.release()
  grabSim = null; grabScene = null
}
document.addEventListener('pointerup', releaseGrab)
document.addEventListener('pointercancel', releaseGrab)

// ── Scene 1: ScrollImage — hue cycling ───────────────────────────────────────

const COLS = 60, ROWS = 44

;(function () {
  const imgEl = document.querySelector('img.hue-target')
  if (!imgEl) return

  const drawable = new Drawable(gl)
  const scene = new ScrollImage({ gl, element: imgEl, scene: drawable })

  const u_mouse = new Uniform({ name: 'u_mouse', value: [-2, -2], kind: 'float_vec2' })
  scene.uniforms.u_mouse = u_mouse

  new Mesh(gl, {
    geometry: new Plane(gl, { width: 2, height: 2 }),
    program: new Program(gl, {
      vertex: hueVert,
      fragment: hueFrag,
      uniforms: { ...scene.uniforms },
      depthTest: false
    })
  }).setParent(drawable)

  // img has pointer-events:none; listen on the visible panel div instead.
  const panel = document.getElementById('scene1-panel')
  panel.addEventListener('mousemove', (e) => {
    const r = panel.getBoundingClientRect()
    u_mouse.value = [
      (e.clientX - r.left) / r.width,
      1 - (e.clientY - r.top) / r.height
    ]
  })
  panel.addEventListener('mouseleave', () => { u_mouse.value = [-2, -2] })

  scrollRenderer.addScene(scene)
})()

// ── Scene 2: ScrollImage — verlet cloth ──────────────────────────────────────

document.querySelectorAll('img.cloth-target').forEach((imgEl) => {
  const sim = new ClothSim(COLS, ROWS)
  const drawable = new Drawable(gl)

  const scene = new ScrollImage({
    gl,
    element: imgEl,
    scene: drawable,
    useViewport: false,
    clipToViewport: false,
    elementSpace: true
  })

  const geo = new Plane(gl, { width: 2, height: 2, widthSegments: COLS, heightSegments: ROWS })
  const posAttr = geo.attributes.position

  new Mesh(gl, {
    geometry: geo,
    program: new Program(gl, {
      vertex: clothVert,
      fragment: clothFrag,
      uniforms: { ...scene.uniforms },
      depthTest: false,
      cullFace: false
    })
  }).setParent(drawable)

  scene.onBeforeRender = (delta) => {
    const scrollImpulse = scrollAccum * 2e-5
    scrollAccum = 0
    sim.step(Math.min(delta, 32), scene.u_time.value, scrollImpulse)
    sim.writePositions(posAttr.data)
    posAttr.needsUpdate = true
  }

  clothScenes.push({ scene, sim })
  scrollRenderer.addScene(scene)
})

// ── Scene 3: ScrollHTML — live HTML cloth ─────────────────────────────────────

;(function () {
  const panelEl = document.getElementById('scene3-panel')
  const htmlEl  = document.getElementById('html-target')
  if (!panelEl || !htmlEl) return

  const sim = new ClothSim(COLS, ROWS)
  const drawable = new Drawable(gl)

  const scene = new ScrollHTML({
    gl,
    element: panelEl,
    htmlElement: htmlEl,
    scene: drawable,
    useViewport: false,
    clipToViewport: false,
    elementSpace: true
  })

  // htmlEl was moved into the capture canvas, leaving panelEl empty. At narrow
  // viewports (single-column grid) panelEl collapses to zero height. Restore its
  // intrinsic size with a hidden placeholder that matches htmlEl's aspect ratio.
  const panelPlaceholder = document.createElement('div')
  Object.assign(panelPlaceholder.style, {
    width: '100%',
    aspectRatio: '4 / 3',
    visibility: 'hidden',
    pointerEvents: 'none'
  })
  panelEl.appendChild(panelPlaceholder)

  // Position the capture canvas over the cloth panel so the form receives
  // pointer events (WebGL canvas has pointer-events:none, so clicks fall through).
  const cc = scene.captureCanvas
  Object.assign(cc.style, {
    zIndex: '0',
    opacity: '0.001', // composited but invisible — keeps paint events firing
    pointerEvents: 'auto'
  })

  const syncCaptureCanvas = () => {
    const r = panelEl.getBoundingClientRect()
    Object.assign(cc.style, {
      top:    `${r.top}px`,
      left:   `${r.left}px`,
      width:  `${r.width}px`,
      height: `${r.height}px`
    })
  }
  syncCaptureCanvas()
  window.addEventListener('resize', syncCaptureCanvas)

  const geo = new Plane(gl, { width: 2, height: 2, widthSegments: COLS, heightSegments: ROWS })
  const posAttr = geo.attributes.position

  new Mesh(gl, {
    geometry: geo,
    program: new Program(gl, {
      vertex: clothVert,
      fragment: htmlClothFrag,
      uniforms: { ...scene.uniforms },
      depthTest: false,
      cullFace: false
    })
  }).setParent(drawable)

  scene.onBeforeRender = (delta) => {
    syncCaptureCanvas()
    const scrollImpulse = scrollAccum * 2e-5
    sim.step(Math.min(delta, 32), scene.u_time.value, scrollImpulse)
    sim.writePositions(posAttr.data)
    posAttr.needsUpdate = true
  }

  // Elements inside <canvas layoutsubtree> can't be focused programmatically.
  // Create an off-screen proxy per input/textarea; focus the proxy on click and
  // sync its value back to the layoutsubtree element so drawElementImage picks it up.
  const proxies = new Map()
  for (const el of htmlEl.querySelectorAll('input, textarea')) {
    const proxy = document.createElement(el.tagName.toLowerCase())
    if (el.tagName === 'INPUT' && el.type) proxy.type = el.type
    Object.assign(proxy.style, {
      position: 'fixed', left: '-9999px', top: '0',
      width: '1px', height: '1px', opacity: '0', pointerEvents: 'none'
    })
    document.body.appendChild(proxy)
    proxy.addEventListener('input', () => {
      el.value = proxy.value
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    proxy.addEventListener('focus', () => {
      el.classList.add('proxy-focus')
      el.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    })
    proxy.addEventListener('blur', () => {
      el.classList.remove('proxy-focus')
      el.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    })
    proxies.set(el, proxy)
  }

  clothScenes.push({ scene, sim, captureCanvas: cc, htmlEl, proxies })
  scrollRenderer.addScene(scene)
})()

scrollRenderer.playing = true
