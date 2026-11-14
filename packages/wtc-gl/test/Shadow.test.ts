import { describe, expect, it, vi } from 'vitest'
import { Vec3 } from 'wtc-math'

import { InstancedMesh } from '../src/core/InstancedMesh'
import { Mesh } from '../src/core/Mesh'
import { Obj } from '../src/core/Object'
import { Program } from '../src/core/Program'
import { Box } from '../src/geometry/Box'
import { Lights } from '../src/lighting/Lights'
import { Shadow } from '../src/lighting/Shadow'
import { createMockRenderer } from './mockGL'

function setup(options = {}) {
  const { gl, renderer } = createMockRenderer()
  const lights = new Lights({ direction: [0, 1, 0] })
  const shadow = new Shadow(gl, { lights, size: 4, ...options })
  const program = new Program(gl, { vertex: '', fragment: '' })
  const mesh = (parent: Obj, x = 0) => {
    const m = new Mesh(gl, { geometry: new Box(gl), program })
    m.position.x = x
    m.setParent(parent)
    return m
  }
  return { gl, renderer, lights, shadow, program, mesh }
}

/** Record which program each mesh draws with. */
function recordDraws(...meshes: Mesh[]) {
  const draws: { mesh: Mesh; program: Program }[] = []
  for (const m of meshes) {
    const draw = m.draw.bind(m)
    vi.spyOn(m, 'draw').mockImplementation((props) => {
      draws.push({ mesh: m, program: m.program })
      draw(props)
    })
  }
  return draws
}

/** The shadow matrix (column-major) applied to a world point. */
function toShadow(shadow: Shadow, p: [number, number, number]) {
  const m = shadow.uniforms.u_shadowMatrix.value as Float32Array
  const out = [0, 0, 0, 0]
  for (let r = 0; r < 4; r++) {
    out[r] = m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]
  }
  return out.map((v) => v / out[3])
}

describe('Shadow', () => {
  it('has sensible defaults', () => {
    const { gl } = createMockRenderer()
    const shadow = new Shadow(gl, { lights: new Lights() })
    expect(shadow.size).toBe(5)
    expect(shadow.mapSize).toBe(1024)
    expect(shadow.bias).toBe(0.001)
    expect(shadow.normalBias).toBe(1)
    expect(shadow.softness).toBe(1)
    expect([...shadow.target]).toEqual([0, 0, 0])
  })

  it('renders depth into a comparing depth texture', () => {
    const { gl, shadow } = setup({ mapSize: 512 })
    expect(shadow.renderTarget.textures).toHaveLength(0)
    expect(shadow.renderTarget.width).toBe(512)
    const depth = shadow.depthTexture
    expect(shadow.renderTarget.depthTexture).toBe(depth)
    expect(depth.format).toBe(gl.DEPTH_COMPONENT)
    expect(depth.internalFormat).toBe(gl.DEPTH_COMPONENT24)
    expect(depth.compareFunc).toBe(gl.LEQUAL)
    expect(depth.minFilter).toBe(gl.LINEAR)
    expect(depth.magFilter).toBe(gl.LINEAR)
    expect(shadow.uniforms.u_shadowMap.value).toBe(depth)
  })

  it('places an orthographic light camera along the light direction', () => {
    const { lights, shadow } = setup()
    shadow.target = new Vec3(1, 0, 2)
    lights.direction = [0, 0, 1]
    shadow.update()
    const camera = shadow.camera
    expect(camera.type).toBe('orthographic')
    expect([camera.left, camera.right, camera.bottom, camera.top]).toEqual([
      -4, 4, -4, 4
    ])
    expect(camera.near).toBe(0)
    expect(camera.far).toBe(16)
    expect(camera.worldPosition.x).toBeCloseTo(1)
    expect(camera.worldPosition.y).toBeCloseTo(0)
    expect(camera.worldPosition.z).toBeCloseTo(10)

    // Straight down works too, which needs another up vector
    lights.direction = [0, 1, 0]
    shadow.update()
    expect(camera.worldPosition.y).toBeCloseTo(8)
    expect(Number.isFinite(camera.viewMatrix.a11)).toBe(true)
  })

  it('maps world space into the shadow map', () => {
    const { lights, shadow } = setup()
    lights.direction = [0.3, 0.8, -0.5]
    shadow.target = new Vec3(2, 1, -1)
    shadow.update()
    const [x, y, z] = toShadow(shadow, [2, 1, -1])
    expect(x).toBeCloseTo(0.5)
    expect(y).toBeCloseTo(0.5)
    expect(z).toBeCloseTo(0.5)

    // The point nearest the light is in front
    const d = lights.direction
    const near = toShadow(shadow, [2 + d[0] * 3, 1 + d[1] * 3, -1 + d[2] * 3])
    expect(near[2]).toBeLessThan(0.5)
  })

  it('sets the bias uniforms in texels and world units', () => {
    const { shadow } = setup({ mapSize: 256, normalBias: 2, softness: 1.5 })
    shadow.update()
    const u = shadow.uniforms
    expect(u.u_shadowBias.value).toBe(0.001)
    expect(u.u_shadowSoftness.value).toBe(1.5)
    expect(u.u_shadowTexel.value).toBeCloseTo(1 / 256)
    // 2 texels of a map 8 world units across
    expect(u.u_shadowNormalBias.value).toBeCloseTo((2 * 8) / 256)
  })

  it('draws only the casters, with the depth program, into its target', () => {
    const { gl, renderer, shadow, program, mesh } = setup()
    const scene = new Obj()
    const casters = new Obj()
    casters.setParent(scene)
    const a = mesh(casters)
    const b = mesh(casters, 1)
    const other = mesh(scene)
    const draws = recordDraws(a, b, other)

    shadow.add(casters)
    shadow.render({ scene })

    expect(draws.map((d) => d.mesh)).toEqual([a, b])
    expect(draws[0].program).not.toBe(program)
    expect(draws[0].program).toBe(draws[1].program)
    expect(draws[0].program.cullFace).toBe(0)
    // Swapped back afterwards
    expect(a.program).toBe(program)
    expect(b.program).toBe(program)

    expect(gl.bindFramebuffer).toHaveBeenCalledWith(
      gl.FRAMEBUFFER,
      shadow.renderTarget.buffer
    )
    expect(gl.clear).toHaveBeenCalledWith(gl.DEPTH_BUFFER_BIT)
    // The canvas is bound again
    expect(renderer.state.framebuffer).toBe(null)
  })

  it('skips hidden casters and those outside the light camera', () => {
    const { shadow, mesh } = setup()
    const scene = new Obj()
    const near = mesh(scene)
    const far = mesh(scene, 100)
    const hidden = mesh(scene, 1)
    hidden.visible = false
    const hiddenParent = new Obj()
    hiddenParent.visible = false
    hiddenParent.setParent(scene)
    const underHidden = mesh(hiddenParent)
    const draws = recordDraws(near, far, hidden, underHidden)

    shadow.add(near)
    shadow.add(far)
    shadow.add(hidden)
    shadow.add(underHidden)
    shadow.render({ scene })
    expect(draws.map((d) => d.mesh)).toEqual([near])
  })

  it('uses an instanced depth program for an InstancedMesh', () => {
    const { gl, shadow, mesh, program } = setup()
    const scene = new Obj()
    const plain = mesh(scene)
    const instanced = new InstancedMesh(gl, {
      geometry: new Box(gl),
      program,
      count: 3
    })
    instanced.setParent(scene)
    const draws = recordDraws(plain, instanced)
    shadow.add(scene)
    shadow.render({ scene })
    expect(draws).toHaveLength(2)
    expect(draws[1].program).not.toBe(draws[0].program)
    expect(draws[1].program.vertex).not.toBe(draws[0].program.vertex)
  })

  it('uses a custom depth program, and can stop casting', () => {
    const { gl, shadow, mesh } = setup()
    const scene = new Obj()
    const a = mesh(scene)
    const b = mesh(scene, 1)
    const custom = new Program(gl, { vertex: '', fragment: '' })
    const draws = recordDraws(a, b)
    shadow.add(a, { program: custom })
    shadow.add(b)
    shadow.render({ scene })
    expect(draws[0].program).toBe(custom)

    draws.length = 0
    shadow.delete(b)
    shadow.render({ scene })
    expect(draws.map((d) => d.mesh)).toEqual([a])
  })

  it('skips lines and points', () => {
    const { gl, shadow, mesh } = setup()
    const scene = new Obj()
    const lines = mesh(scene)
    lines.mode = gl.LINES
    const draws = recordDraws(lines)
    shadow.add(scene)
    shadow.render({ scene })
    expect(draws).toHaveLength(0)
  })

  it('restores programs when a draw throws', () => {
    const { shadow, mesh, program } = setup()
    const scene = new Obj()
    const a = mesh(scene)
    vi.spyOn(a, 'draw').mockImplementation(() => {
      throw new Error('boom')
    })
    shadow.add(a)
    expect(() => shadow.render({ scene })).toThrow('boom')
    expect(a.program).toBe(program)
  })

  it('fits itself around a model', () => {
    const { shadow, mesh } = setup()
    const scene = new Obj()
    const group = new Obj()
    group.position.y = 2
    group.setParent(scene)
    mesh(group, -3)
    mesh(group, 3)
    scene.updateMatrixWorld()

    shadow.fit(group)
    expect(shadow.target.x).toBeCloseTo(0)
    expect(shadow.target.y).toBeCloseTo(2)
    expect(shadow.target.z).toBeCloseTo(0)
    // Two unit boxes 6 apart: 3 plus a box's bounding radius
    expect(shadow.size).toBeCloseTo(3 + Math.sqrt(3) / 2)
  })

  it('frees its target, depth texture and depth programs', () => {
    const { gl, shadow, mesh } = setup()
    const scene = new Obj()
    mesh(scene)
    shadow.add(scene)
    shadow.render({ scene })
    shadow.remove()
    expect(gl.deleteFramebuffer).toHaveBeenCalledWith(
      shadow.renderTarget.buffer
    )
    expect(gl.deleteTexture).toHaveBeenCalledWith(shadow.depthTexture.texture)
    expect(gl.deleteProgram).toHaveBeenCalled()
  })

  it("doesn't change world matrices when update is false", () => {
    const { shadow, mesh } = setup()
    const scene = new Obj()
    const a = mesh(scene, 2)
    shadow.add(a)
    shadow.render({ scene, update: false })
    expect(a.worldMatrix.a41).toBe(0)
    shadow.render({ scene })
    expect(a.worldMatrix.a41).toBe(2)
  })
})
