import { describe, expect, it, type Mock } from 'vitest'

import { Texture } from '../src/core/Texture'
import { blankTexture } from '../src/core/blankTexture'
import { Lights } from '../src/lighting/Lights'
import { LitProgram, litShading } from '../src/lighting/LitProgram'
import { Shadow, shadowShading } from '../src/lighting/Shadow'
import { createMockRenderer, type MockGL } from './mockGL'

const length = (v: ArrayLike<number>) => Math.hypot(v[0], v[1], v[2])

type LightUniform = keyof Lights['uniforms']
const lightUniforms = (lights: Lights) =>
  Object.keys(lights.uniforms) as LightUniform[]

/** The vertex and fragment sources of the last program compiled on `gl`. */
function sources(gl: MockGL) {
  const shaderSource = gl.shaderSource as unknown as Mock
  const calls = shaderSource.mock.calls.map((c) => c[1] as string)
  const last = (match: (s: string) => boolean) =>
    calls.filter(match)[calls.filter(match).length - 1]
  const vertex = last((s) => s.includes('gl_Position'))
  const fragment = last((s) => !s.includes('gl_Position'))
  return { vertex, fragment }
}

describe('Lights', () => {
  it('has a light from the upper left front, a hemisphere and ambient', () => {
    const lights = new Lights()
    const d = lights.uniforms.u_lightDirection.value as number[]
    expect(length(d)).toBeCloseTo(1)
    expect(d[1]).toBeGreaterThan(0)
    expect(lights.uniforms.u_lightColour.value).toEqual([1, 1, 1])
    for (const name of [
      'u_lightIntensity',
      'u_skyColour',
      'u_groundColour',
      'u_ambient'
    ] as const) {
      expect(lights.uniforms[name]).toBeDefined()
    }
  })

  it('takes its values from the options', () => {
    const lights = new Lights({
      direction: [0, 2, 0],
      colour: [1, 0.5, 0],
      intensity: 2,
      sky: [0.1, 0.2, 0.3],
      ground: [0.3, 0.2, 0.1],
      ambient: 0.25
    })
    expect(lights.uniforms.u_lightDirection.value).toEqual([0, 1, 0])
    expect(lights.uniforms.u_lightColour.value).toEqual([1, 0.5, 0])
    expect(lights.uniforms.u_lightIntensity.value).toBe(2)
    expect(lights.uniforms.u_skyColour.value).toEqual([0.1, 0.2, 0.3])
    expect(lights.uniforms.u_groundColour.value).toEqual([0.3, 0.2, 0.1])
    expect(lights.uniforms.u_ambient.value).toBe(0.25)
  })

  it('normalises the direction', () => {
    const lights = new Lights()
    lights.direction = [3, 0, 4]
    expect(lights.direction).toEqual([0.6, 0, 0.8])
  })

  it('writes colours and directions into the same arrays', () => {
    const lights = new Lights()
    const direction = lights.uniforms.u_lightDirection.value
    const colour = lights.uniforms.u_lightColour.value
    const sky = lights.uniforms.u_skyColour.value
    const ground = lights.uniforms.u_groundColour.value
    lights.direction = [0, 0, 1]
    lights.colour = [0.5, 0.5, 0.5]
    lights.sky = [1, 0, 0]
    lights.ground = [0, 1, 0]
    expect(lights.uniforms.u_lightDirection.value).toBe(direction)
    expect(lights.uniforms.u_lightColour.value).toBe(colour)
    expect(lights.uniforms.u_skyColour.value).toBe(sky)
    expect(lights.uniforms.u_groundColour.value).toBe(ground)
    expect(lights.colour).toEqual([0.5, 0.5, 0.5])
  })

  it('sets the intensity and ambient', () => {
    const lights = new Lights()
    lights.intensity = 3
    lights.ambient = 0.5
    expect(lights.uniforms.u_lightIntensity.value).toBe(3)
    expect(lights.uniforms.u_ambient.value).toBe(0.5)
  })
})

describe('LitProgram', () => {
  it('shares the uniforms of the lights it is given', () => {
    const { gl } = createMockRenderer()
    const lights = new Lights()
    const a = new LitProgram(gl, { lights })
    const b = new LitProgram(gl, { lights, colour: [1, 0, 0] })
    for (const name of lightUniforms(lights)) {
      expect(a.uniforms[name]).toBe(lights.uniforms[name])
      expect(b.uniforms[name]).toBe(lights.uniforms[name])
    }
    expect(a.lights).toBe(lights)
  })

  it('makes its own lights when none are given', () => {
    const { gl } = createMockRenderer()
    const a = new LitProgram(gl)
    const b = new LitProgram(gl)
    expect(a.lights).toBeInstanceOf(Lights)
    expect(a.lights).not.toBe(b.lights)
  })

  it('sets the material uniforms from the options', () => {
    const { gl } = createMockRenderer()
    const program = new LitProgram(gl, {
      colour: [1, 0.5, 0.25],
      opacity: 0.5,
      specular: 0.4,
      shininess: 64,
      alphaTest: 0.1
    })
    expect(program.uniforms.u_colour.value).toEqual([1, 0.5, 0.25])
    expect(program.uniforms.u_opacity.value).toBe(0.5)
    expect(program.uniforms.u_specular.value).toBe(0.4)
    expect(program.uniforms.u_shininess.value).toBe(64)
    expect(program.uniforms.u_alphaTest.value).toBe(0.1)
  })

  it('has setters for the material', () => {
    const { gl } = createMockRenderer()
    const program = new LitProgram(gl)
    const colour = program.uniforms.u_colour.value
    program.colour = [0, 1, 0]
    program.opacity = 0.3
    program.specular = 1
    program.shininess = 8
    expect(program.uniforms.u_colour.value).toBe(colour)
    expect(program.colour).toEqual([0, 1, 0])
    expect(program.uniforms.u_opacity.value).toBe(0.3)
    expect(program.uniforms.u_specular.value).toBe(1)
    expect(program.uniforms.u_shininess.value).toBe(8)
  })

  it('binds the blank texture without a map, and swaps maps', () => {
    const { gl } = createMockRenderer()
    const program = new LitProgram(gl)
    expect(program.uniforms.u_map.value).toBe(blankTexture(gl))
    expect(program.uniforms.u_useMap.value).toBe(0)
    expect(program.map).toBeNull()

    const map = new Texture(gl)
    program.map = map
    expect(program.uniforms.u_map.value).toBe(map)
    expect(program.uniforms.u_useMap.value).toBe(1)
    expect(program.map).toBe(map)

    program.map = null
    expect(program.uniforms.u_map.value).toBe(blankTexture(gl))
    expect(program.uniforms.u_useMap.value).toBe(0)
  })

  it('adds emissive light, with an optional map', () => {
    const { gl } = createMockRenderer()
    const program = new LitProgram(gl, { emissive: [1, 0.5, 0] })
    expect(program.uniforms.u_emissive.value).toEqual([1, 0.5, 0])
    expect(program.uniforms.u_emissiveMap.value).toBe(blankTexture(gl))
    expect(program.uniforms.u_useEmissiveMap.value).toBe(0)
    expect(program.emissiveMap).toBeNull()

    const map = new Texture(gl)
    program.emissiveMap = map
    program.emissive = [0, 0, 1]
    expect(program.uniforms.u_emissiveMap.value).toBe(map)
    expect(program.uniforms.u_useEmissiveMap.value).toBe(1)
    expect(program.emissive).toEqual([0, 0, 1])
    expect(program.emissiveMap).toBe(map)

    expect(new LitProgram(gl).uniforms.u_emissive.value).toEqual([0, 0, 0])
  })

  it('is transparent by default only below full opacity', () => {
    const { gl } = createMockRenderer()
    expect(new LitProgram(gl).transparent).toBe(false)
    expect(new LitProgram(gl, { opacity: 0.5 }).transparent).toBe(true)
    expect(
      new LitProgram(gl, { opacity: 0.5, transparent: false }).transparent
    ).toBe(false)
  })

  it('premultiplies when the renderer does', () => {
    const { gl } = createMockRenderer()
    expect(new LitProgram(gl).uniforms.u_premultiplied.value).toBe(0)
    gl.renderer.premultipliedAlpha = true
    expect(new LitProgram(gl).uniforms.u_premultiplied.value).toBe(1)
  })

  it('compiles the shading snippet into its fragment shader', () => {
    const { gl } = createMockRenderer()
    new LitProgram(gl)
    const { vertex, fragment } = sources(gl)
    expect(vertex.startsWith('#version 300 es\n')).toBe(true)
    expect(fragment.startsWith('#version 300 es\n')).toBe(true)
    expect(fragment).toContain(litShading)
    expect(vertex).not.toContain('#define')
    expect(fragment).not.toContain('#define')
  })

  it.each([
    ['flatShading', 'FLAT_SHADING'],
    ['vertexColours', 'VERTEX_COLOURS'],
    ['doubleSided', 'DOUBLE_SIDED'],
    ['instanced', 'INSTANCED']
  ] as const)('%s adds #define %s to both shaders', (option, define) => {
    const { gl } = createMockRenderer()
    new LitProgram(gl, { [option]: true })
    const { vertex, fragment } = sources(gl)
    expect(vertex).toContain(`#define ${define}\n`)
    expect(fragment).toContain(`#define ${define}\n`)
  })

  it('turns face culling off when double sided', () => {
    const { gl } = createMockRenderer()
    expect(new LitProgram(gl).cullFace).toBe(gl.BACK)
    expect(new LitProgram(gl, { doubleSided: true }).cullFace).toBe(0)
  })

  it.each([
    ['flatShading', 'FLAT_SHADING'],
    ['vertexColours', 'VERTEX_COLOURS'],
    ['doubleSided', 'DOUBLE_SIDED'],
    ['instanced', 'INSTANCED']
  ] as const)('recompiles when %s is changed', (option, define) => {
    const { gl } = createMockRenderer()
    const program = new LitProgram(gl)
    const before = program.program
    program[option] = true
    expect(program[option]).toBe(true)
    expect(program.program).not.toBe(before)
    expect(sources(gl).fragment).toContain(`#define ${define}\n`)
    expect(program.fragment).toContain(`#define ${define}\n`)

    program[option] = false
    expect(sources(gl).fragment).not.toContain(`#define ${define}\n`)
  })

  it('updates face culling with doubleSided', () => {
    const { gl } = createMockRenderer()
    const program = new LitProgram(gl)
    program.doubleSided = true
    expect(program.cullFace).toBe(0)
    program.doubleSided = false
    expect(program.cullFace).toBe(gl.BACK)
  })

  it('doesn’t recompile for an unchanged option', () => {
    const { gl } = createMockRenderer()
    const program = new LitProgram(gl, { flatShading: true })
    const calls = (gl.shaderSource as unknown as Mock).mock.calls.length
    program.flatShading = true
    program.doubleSided = false
    expect((gl.shaderSource as unknown as Mock).mock.calls.length).toBe(calls)
  })
})

describe('LitProgram shadow', () => {
  const shadowUniforms = (shadow: Shadow) =>
    Object.keys(shadow.uniforms) as (keyof Shadow['uniforms'])[]

  it('receives a shadow it is given', () => {
    const { gl } = createMockRenderer()
    const lights = new Lights()
    const shadow = new Shadow(gl, { lights })
    const program = new LitProgram(gl, { lights, shadow })
    expect(program.shadow).toBe(shadow)
    for (const name of shadowUniforms(shadow)) {
      expect(program.uniforms[name]).toBe(shadow.uniforms[name])
    }
    const { vertex, fragment } = sources(gl)
    expect(vertex).toContain('#define SHADOW\n')
    expect(vertex).toContain('v_shadowCoord')
    expect(fragment).toContain('#define SHADOW\n')
    expect(fragment).toContain(shadowShading)
    expect(fragment).toContain('shadowFactor(v_shadowCoord)')
  })

  it('has no shadow by default', () => {
    const { gl } = createMockRenderer()
    const program = new LitProgram(gl)
    expect(program.shadow).toBe(null)
    expect(program.uniforms.u_shadowMap).toBeUndefined()
    expect(sources(gl).fragment).not.toContain('sampler2DShadow')
  })

  it('adds and removes the shadow, recompiling', () => {
    const { gl } = createMockRenderer()
    const lights = new Lights()
    const shadow = new Shadow(gl, { lights })
    const program = new LitProgram(gl, { lights })
    const before = program.program

    program.shadow = shadow
    expect(program.program).not.toBe(before)
    expect(program.uniforms.u_shadowMatrix).toBe(shadow.uniforms.u_shadowMatrix)
    expect(sources(gl).fragment).toContain('#define SHADOW\n')

    const calls = (gl.shaderSource as unknown as Mock).mock.calls.length
    program.shadow = shadow
    expect((gl.shaderSource as unknown as Mock).mock.calls.length).toBe(calls)

    program.shadow = null
    expect(program.shadow).toBe(null)
    expect(program.uniforms.u_shadowMap).toBeUndefined()
    expect(sources(gl).fragment).not.toContain('#define SHADOW\n')
  })

  it('swaps one shadow for another', () => {
    const { gl } = createMockRenderer()
    const lights = new Lights()
    const a = new Shadow(gl, { lights })
    const b = new Shadow(gl, { lights })
    const program = new LitProgram(gl, { lights, shadow: a })
    program.shadow = b
    expect(program.uniforms.u_shadowMap).toBe(b.uniforms.u_shadowMap)
  })
})

describe('shadowShading', () => {
  it('declares shadowFactor and the fragment shadow uniforms', () => {
    expect(shadowShading).toMatch(/float\s+shadowFactor\s*\(vec4/)
    for (const name of [
      'u_shadowMap',
      'u_shadowBias',
      'u_shadowSoftness',
      'u_shadowTexel'
    ]) {
      expect(shadowShading).toMatch(
        new RegExp(`uniform\\s+[\\w ]+\\s+${name};`)
      )
    }
  })
})

describe('litShading', () => {
  it('takes an optional shadow factor', () => {
    expect(litShading).toMatch(/float shininess,\s*float shadow\s*\)/)
  })

  it('declares litShade and the light uniforms', () => {
    expect(litShading).toMatch(/vec3\s+litShade\s*\(/)
    for (const name of lightUniforms(new Lights())) {
      expect(litShading).toMatch(new RegExp(`uniform\\s+\\w+\\s+${name};`))
    }
  })

  it('leaves u_viewMatrix to the shader including it', () => {
    expect(litShading).not.toContain('u_viewMatrix')
  })
})
