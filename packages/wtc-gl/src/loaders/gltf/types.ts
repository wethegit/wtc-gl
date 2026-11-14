/*
 * The parts of the glTF 2.0 JSON the loader reads. See
 * https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
 */

/**
 * The parts of a glTF 2.0 file's JSON that `GLTFLoader` reads. Indices refer
 * to the matching top-level arrays. See the
 * [glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).
 * @category Loaders
 */
export type GLTFJson = {
  /** Metadata about the file. */
  asset: {
    /** The glTF version the file targets, such as `'2.0'`. */
    version: string
  }
  /** The index of the default scene. */
  scene?: number
  /** The scenes, each a set of root nodes. */
  scenes?: {
    /** The scene's name. */
    name?: string
    /** The indices of the scene's root nodes. */
    nodes?: number[]
  }[]
  /** The nodes of the scene graph. */
  nodes?: GLTFNode[]
  /** The meshes, each a list of primitives. */
  meshes?: {
    /** The mesh's name. */
    name?: string
    /** The primitives to draw, each with its own geometry and material. */
    primitives: GLTFPrimitive[]
  }[]
  /** The typed views into buffer views that attributes and indices read. */
  accessors?: GLTFAccessor[]
  /** The slices of buffers that accessors and images read. */
  bufferViews?: GLTFBufferView[]
  /** The binary buffers. */
  buffers?: {
    /** The length of the buffer, in bytes. */
    byteLength: number
    /** Where to load the buffer from. Absent for a GLB's binary chunk. */
    uri?: string
  }[]
  /** The materials. */
  materials?: GLTFMaterial[]
  /** The textures, each an image and a sampler. */
  textures?: {
    /** The index of the sampler. Absent for repeat wrapping and linear, mipmapped filtering. */
    sampler?: number
    /** The index of the image. */
    source?: number
  }[]
  /** The texture samplers, as GL enum values. */
  samplers?: {
    /** The magnification filter. */
    magFilter?: number
    /** The minification filter. */
    minFilter?: number
    /** The wrapping along u. */
    wrapS?: number
    /** The wrapping along v. */
    wrapT?: number
  }[]
  /** The images textures read. */
  images?: {
    /** Where to load the image from. */
    uri?: string
    /** The index of the buffer view holding the image, in place of `uri`. */
    bufferView?: number
    /** The image's MIME type, needed with `bufferView`. */
    mimeType?: string
  }[]
  /** The cameras. */
  cameras?: GLTFCamera[]
  /** The names of the extensions the file uses. */
  extensionsUsed?: string[]
  /** The names of the extensions needed to load the file. */
  extensionsRequired?: string[]
}

/**
 * A node in a glTF file: a transform, and optionally a mesh, a camera and
 * children.
 * @category Loaders
 */
export type GLTFNode = {
  /** The node's name. */
  name?: string
  /** The indices of the child nodes. */
  children?: number[]
  /** The index of the mesh at this node. */
  mesh?: number
  /** The index of the camera at this node. */
  camera?: number
  /** A column-major 4×4 local transform, in place of TRS. */
  matrix?: number[]
  /** The local translation, `[x, y, z]`. */
  translation?: number[]
  /** The local rotation, a unit quaternion `[x, y, z, w]`. */
  rotation?: number[]
  /** The local scale, `[x, y, z]`. */
  scale?: number[]
  /** The node extensions the loader reads. */
  extensions?: {
    /** Draw the node's mesh once per instance, each with its own TRS. */
    EXT_mesh_gpu_instancing?: {
      /** The accessor indices of the per-instance transforms. */
      attributes: {
        /** The accessor of instance translations (VEC3). */
        TRANSLATION?: number
        /** The accessor of instance rotations (VEC4 quaternions). */
        ROTATION?: number
        /** The accessor of instance scales (VEC3). */
        SCALE?: number
      }
    }
  }
}

/**
 * One drawable part of a glTF mesh: its attributes, indices and material.
 * @category Loaders
 */
export type GLTFPrimitive = {
  /** Accessor indices by attribute name, such as `POSITION` or `TEXCOORD_0`. */
  attributes: Record<string, number>
  /** The accessor index of the vertex indices. */
  indices?: number
  /** The index of the material. */
  material?: number
  /** The draw mode, as a GL enum value. Absent for triangles. */
  mode?: number
}

/**
 * A typed view into a buffer view, read as attributes, indices or instance
 * transforms.
 * @category Loaders
 */
export type GLTFAccessor = {
  /** The index of the buffer view. Absent for all zeros, unless sparse. */
  bufferView?: number
  /** The offset into the buffer view, in bytes. */
  byteOffset?: number
  /** The type of each component, as a GL enum value such as `gl.FLOAT`. */
  componentType: number
  /** Whether integer components are normalised to 0 to 1 (or -1 to 1). */
  normalized?: boolean
  /** The number of elements. */
  count: number
  /** The shape of each element. */
  type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT2' | 'MAT3' | 'MAT4'
  /** Elements that replace the ones read from `bufferView`. */
  sparse?: {
    /** The number of replaced elements. */
    count: number
    /** The indices of the replaced elements. */
    indices: {
      /** The index of the buffer view holding the indices. */
      bufferView: number
      /** The offset into the buffer view, in bytes. */
      byteOffset?: number
      /** The type of each index, as a GL enum value. */
      componentType: number
    }
    /** The replacement values. */
    values: {
      /** The index of the buffer view holding the values. */
      bufferView: number
      /** The offset into the buffer view, in bytes. */
      byteOffset?: number
    }
  }
}

/**
 * A slice of a glTF buffer.
 * @category Loaders
 */
export type GLTFBufferView = {
  /** The index of the buffer. */
  buffer: number
  /** The offset into the buffer, in bytes. */
  byteOffset?: number
  /** The length of the slice, in bytes. */
  byteLength: number
  /** The distance between the starts of consecutive elements, in bytes. Absent for tightly packed. */
  byteStride?: number
}

/**
 * A reference from a material to a texture.
 * @category Loaders
 */
export type GLTFTextureInfo = {
  /** The index of the texture. */
  index: number
  /** Which uv set to read. The loader only reads `TEXCOORD_0`. */
  texCoord?: number
}

/**
 * A glTF material. `materialProgram` maps it onto a `LitProgram`.
 * @category Loaders
 */
export type GLTFMaterial = {
  /** The material's name. */
  name?: string
  /** The physically based base colour, metalness and roughness. */
  pbrMetallicRoughness?: {
    /** The linear RGBA base colour. */
    baseColorFactor?: number[]
    /** A texture multiplied with the base colour. */
    baseColorTexture?: GLTFTextureInfo
    /** How metallic the surface is, from 0 to 1. Not modelled by the loader. */
    metallicFactor?: number
    /** How rough the surface is, from 0 to 1. */
    roughnessFactor?: number
  }
  /** The linear RGB light the surface gives off. */
  emissiveFactor?: number[]
  /** A texture multiplied with the emissive colour. */
  emissiveTexture?: GLTFTextureInfo
  /** How alpha is used: ignored, as a cutoff, or blended. */
  alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND'
  /** The alpha below which `MASK` discards. */
  alphaCutoff?: number
  /** Whether back faces are drawn and lit. */
  doubleSided?: boolean
  /** The material extensions the loader reads. */
  extensions?: {
    /** Scales the emissive colour beyond 1. */
    KHR_materials_emissive_strength?: {
      /** The multiplier for `emissiveFactor`. */
      emissiveStrength?: number
    }
  }
}

/**
 * A glTF camera, perspective or orthographic.
 * @category Loaders
 */
export type GLTFCamera = {
  /** The camera's name. */
  name?: string
  /** Which projection the camera uses. */
  type: 'perspective' | 'orthographic'
  /** The perspective projection, when `type` is `'perspective'`. */
  perspective?: {
    /** The vertical field of view, in radians. */
    yfov: number
    /** Width over height. Absent to use the canvas's. */
    aspectRatio?: number
    /** The near clipping distance. */
    znear: number
    /** The far clipping distance. The loader uses 1000 when it's absent. */
    zfar?: number
  }
  /** The orthographic projection, when `type` is `'orthographic'`. */
  orthographic?: {
    /** Half the width of the view. */
    xmag: number
    /** Half the height of the view. */
    ymag: number
    /** The near clipping distance. */
    znear: number
    /** The far clipping distance. */
    zfar: number
  }
}
