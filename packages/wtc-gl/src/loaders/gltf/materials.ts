import type { WTCGLRenderingContext } from '../../types'
import type { Texture } from '../../core/Texture'
import type { Lights } from '../../lighting/Lights'
import type { Shadow } from '../../lighting/Shadow'
import { LitProgram } from '../../lighting/LitProgram'
import { linearToSRGB } from './colour'
import type { GLTFMaterial } from './types'

/** What a primitive needs from its program beyond its material. */
export type ProgramFlags = {
  vertexColours: boolean
  flatShading: boolean
  instanced: boolean
}

/**
 * A `LitProgram` approximating a glTF material, which is physically based.
 *
 * - The base colour factor and texture become `colour`, `opacity` and `map`.
 *   Colour factors are linear in glTF, so they're converted to sRGB, the
 *   space `LitProgram` shades in and textures are already in.
 * - `alphaMode` OPAQUE draws fully opaque, MASK discards below `alphaCutoff`
 *   (0.5 by default), and BLEND draws transparent.
 * - `doubleSided` maps straight across.
 * - The emissive factor (times `KHR_materials_emissive_strength`) and
 *   texture become `emissive` and `emissiveMap`.
 * - Roughness sets the Blinn-Phong highlight: none when fully rough, small
 *   and sharp when smooth. Metalness isn't modelled.
 * - With a `shadow`, the program receives it.
 * - Normal, occlusion and metallic-roughness textures are ignored. Shading is
 *   in sRGB rather than linear, so lighting and blending are approximate.
 */
export function materialProgram(
  gl: WTCGLRenderingContext,
  material: GLTFMaterial | undefined,
  textures: (Texture | undefined)[],
  lights: Lights,
  flags: ProgramFlags,
  shadow: Shadow | null = null
): LitProgram {
  const pbr = material?.pbrMetallicRoughness
  const factor = pbr?.baseColorFactor ?? [1, 1, 1, 1]
  const alphaMode = material?.alphaMode ?? 'OPAQUE'
  const roughness = pbr?.roughnessFactor ?? 1
  const strength =
    material?.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1
  const emissive = (material?.emissiveFactor ?? [0, 0, 0]).map(
    (v) => linearToSRGB(v) * strength
  ) as [number, number, number]

  const texture = (info?: { index: number }) =>
    info ? (textures[info.index] ?? null) : null

  return new LitProgram(gl, {
    lights,
    colour: [
      linearToSRGB(factor[0]),
      linearToSRGB(factor[1]),
      linearToSRGB(factor[2])
    ],
    opacity: alphaMode === 'OPAQUE' ? 1 : factor[3],
    transparent: alphaMode === 'BLEND',
    alphaTest: alphaMode === 'MASK' ? (material?.alphaCutoff ?? 0.5) : 0,
    map: texture(pbr?.baseColorTexture),
    emissive,
    emissiveMap: texture(material?.emissiveTexture),
    specular: 0.6 * (1 - roughness) ** 2,
    shininess: Math.min(
      256,
      Math.max(2, 2 / Math.max(roughness ** 4, 1e-6) - 2)
    ),
    doubleSided: !!material?.doubleSided,
    shadow,
    ...flags
  })
}
