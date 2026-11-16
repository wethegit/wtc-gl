import type { WTCGLRenderingContext } from '../../types'
import { Texture } from '../../core/Texture'
import { bufferViewBytes } from './accessors'
import type { GLTFJson } from './types'

/** glTF sampler codes, which are GL enums, as the context's own constants. */
function glEnum(gl: WTCGLRenderingContext, code: number | undefined) {
  switch (code) {
    case 9728:
      return gl.NEAREST
    case 9729:
      return gl.LINEAR
    case 9984:
      return gl.NEAREST_MIPMAP_NEAREST
    case 9985:
      return gl.LINEAR_MIPMAP_NEAREST
    case 9986:
      return gl.NEAREST_MIPMAP_LINEAR
    case 9987:
      return gl.LINEAR_MIPMAP_LINEAR
    case 33071:
      return gl.CLAMP_TO_EDGE
    case 33648:
      return gl.MIRRORED_REPEAT
    case 10497:
      return gl.REPEAT
  }
  return undefined
}

const MIPMAP_FILTERS = new Set([9984, 9985, 9986, 9987])

/**
 * Load a glTF texture: its image, from a URI or a buffer view, decoded
 * unflipped (glTF uvs start at the top left), with its sampler's wrapping
 * and filtering. Filters default to linear with mipmaps, and wrapping to
 * repeat, as the spec suggests.
 */
export async function loadTexture(
  gl: WTCGLRenderingContext,
  json: GLTFJson,
  buffers: ArrayBuffer[],
  index: number,
  baseURL: string,
  signal?: AbortSignal
): Promise<Texture> {
  const texture = json.textures?.[index]
  const image =
    texture?.source !== undefined ? json.images?.[texture.source] : undefined
  if (!image) throw new Error(`GLTFLoader: texture ${index} has no image`)

  let blob: Blob
  if (image.bufferView !== undefined) {
    const bytes = bufferViewBytes(json, buffers, image.bufferView)
    // Copied out, as the Blob would otherwise keep the whole buffer
    blob = new Blob([bytes.slice()], { type: image.mimeType })
  } else if (image.uri) {
    const response = await fetch(resolve(image.uri, baseURL), { signal })
    if (!response.ok) {
      throw new Error(
        `GLTFLoader: image ${image.uri} failed with ${response.status}`
      )
    }
    blob = await response.blob()
  } else {
    throw new Error(`GLTFLoader: image for texture ${index} has no data`)
  }

  const sampler =
    texture!.sampler !== undefined ? json.samplers?.[texture!.sampler] : {}
  const minCode = sampler?.minFilter ?? 9987
  return Texture.fromBlob(gl, blob, {
    flipY: false,
    wrapS: glEnum(gl, sampler?.wrapS) ?? gl.REPEAT,
    wrapT: glEnum(gl, sampler?.wrapT) ?? gl.REPEAT,
    magFilter: glEnum(gl, sampler?.magFilter) ?? gl.LINEAR,
    minFilter: glEnum(gl, minCode) ?? gl.LINEAR_MIPMAP_LINEAR,
    generateMipmaps: MIPMAP_FILTERS.has(minCode)
  })
}

/** A URI relative to the file it came from. `data:` URIs pass through. */
export function resolve(uri: string, baseURL: string): string {
  if (/^(data|blob):/.test(uri) || !baseURL) return uri
  try {
    return new URL(uri, baseURL).href
  } catch {
    return uri
  }
}
