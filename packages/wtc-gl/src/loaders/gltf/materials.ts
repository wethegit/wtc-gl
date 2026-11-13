import type { WTCGLRenderingContext } from '../../types'
import type { Texture } from '../../core/Texture'
import type { Lights } from '../../lighting/Lights'
import { LitProgram } from '../../lighting/LitProgram'
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
 * - `alphaMode` OPAQUE draws fully opaque, MASK discards below `alphaCutoff`
 *   (0.5 by default), and BLEND draws transparent.
 * - `doubleSided` maps straight across.
 * - The emissive factor (times `KHR_materials_emissive_strength`) and
 *   texture become `emissive` and `emissiveMap`.
 * - Roughness sets the Blinn-Phong highlight: none when fully rough, small
 *   and sharp when smooth. Metalness isn't modelled.
 * - Normal, occlusion and metallic-roughness textures are ignored, and colours
 *   aren't colour-managed: textures show as their sRGB values, and factors are
 *   used as given.
 */
export function materialProgram(
  gl: WTCGLRenderingContext,
  material: GLTFMaterial | undefined,
  textures: (Texture | undefined)[],
  lights: Lights,
  flags: ProgramFlags
): LitProgram {
  const pbr = material?.pbrMetallicRoughness
  const factor = pbr?.baseColorFactor ?? [1, 1, 1, 1]
  const alphaMode = material?.alphaMode ?? 'OPAQUE'
  const roughness = pbr?.roughnessFactor ?? 1
  const strength =
    material?.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1
  const emissive = (material?.emissiveFactor ?? [0, 0, 0]).map(
    (v) => v * strength
  ) as [number, number, number]

  const texture = (info?: { index: number }) =>
    info ? (textures[info.index] ?? null) : null

  return new LitProgram(gl, {
    lights,
    colour: [factor[0], factor[1], factor[2]],
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
    ...flags
  })
}
