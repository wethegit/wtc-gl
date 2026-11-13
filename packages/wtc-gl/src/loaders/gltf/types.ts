/*
 * The parts of the glTF 2.0 JSON the loader reads. See
 * https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
 */

export type GLTFJson = {
  asset: { version: string }
  scene?: number
  scenes?: { name?: string; nodes?: number[] }[]
  nodes?: GLTFNode[]
  meshes?: { name?: string; primitives: GLTFPrimitive[] }[]
  accessors?: GLTFAccessor[]
  bufferViews?: GLTFBufferView[]
  buffers?: { byteLength: number; uri?: string }[]
  materials?: GLTFMaterial[]
  textures?: { sampler?: number; source?: number }[]
  samplers?: {
    magFilter?: number
    minFilter?: number
    wrapS?: number
    wrapT?: number
  }[]
  images?: { uri?: string; bufferView?: number; mimeType?: string }[]
  cameras?: GLTFCamera[]
  extensionsUsed?: string[]
  extensionsRequired?: string[]
}

export type GLTFNode = {
  name?: string
  children?: number[]
  mesh?: number
  camera?: number
  matrix?: number[]
  translation?: number[]
  rotation?: number[]
  scale?: number[]
  extensions?: {
    EXT_mesh_gpu_instancing?: {
      attributes: { TRANSLATION?: number; ROTATION?: number; SCALE?: number }
    }
  }
}

export type GLTFPrimitive = {
  attributes: Record<string, number>
  indices?: number
  material?: number
  mode?: number
}

export type GLTFAccessor = {
  bufferView?: number
  byteOffset?: number
  componentType: number
  normalized?: boolean
  count: number
  type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT2' | 'MAT3' | 'MAT4'
  sparse?: {
    count: number
    indices: { bufferView: number; byteOffset?: number; componentType: number }
    values: { bufferView: number; byteOffset?: number }
  }
}

export type GLTFBufferView = {
  buffer: number
  byteOffset?: number
  byteLength: number
  byteStride?: number
}

export type GLTFTextureInfo = { index: number; texCoord?: number }

export type GLTFMaterial = {
  name?: string
  pbrMetallicRoughness?: {
    baseColorFactor?: number[]
    baseColorTexture?: GLTFTextureInfo
    metallicFactor?: number
    roughnessFactor?: number
  }
  emissiveFactor?: number[]
  emissiveTexture?: GLTFTextureInfo
  alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND'
  alphaCutoff?: number
  doubleSided?: boolean
  extensions?: {
    KHR_materials_emissive_strength?: { emissiveStrength?: number }
  }
}

export type GLTFCamera = {
  name?: string
  type: 'perspective' | 'orthographic'
  perspective?: {
    yfov: number
    aspectRatio?: number
    znear: number
    zfar?: number
  }
  orthographic?: { xmag: number; ymag: number; znear: number; zfar: number }
}
