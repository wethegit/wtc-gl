import { Quat, Vec3 } from 'wtc-math'

import type { WTCGLRenderingContext } from '../types'
import { Camera } from '../core/Camera'
import { InstancedMesh } from '../core/InstancedMesh'
import { Mesh } from '../core/Mesh'
import { Obj } from '../core/Object'
import type { Texture } from '../core/Texture'
import { composeMat4 } from '../core/matrix'
import { Geometry } from '../geometry/Geometry'
import { GeometryAttribute } from '../geometry/GeometryAttribute'
import { Lights } from '../lighting/Lights'
import type { Shadow } from '../lighting/Shadow'
import type { LitProgram } from '../lighting/LitProgram'
import { readAccessor, readFloats, readIndices } from './gltf/accessors'
import { linearToSRGBArray } from './gltf/colour'
import { materialProgram, type ProgramFlags } from './gltf/materials'
import { loadTexture, resolve } from './gltf/textures'
import type { GLTFCamera, GLTFJson, GLTFNode } from './gltf/types'

export type { GLTFJson } from './gltf/types'

/** The extensions the loader understands, or doesn't need to. */
const SUPPORTED = new Set([
  'EXT_mesh_gpu_instancing',
  'KHR_materials_emissive_strength',
  // Quantised attributes are dequantised to floats as they're read
  'KHR_mesh_quantization'
])

/** glTF attribute names, as wtc-gl's. Others are ignored. */
const ATTRIBUTES: Record<string, string> = {
  POSITION: 'position',
  NORMAL: 'normal',
  TEXCOORD_0: 'uv',
  COLOR_0: 'colour'
}

export interface GLTFLoaderOptions {
  /** The lights every program shares. @default a new `Lights()` */
  lights: Lights
  /**
   * A `Shadow` every program receives. The loader doesn't add casters: pass
   * `gltf.scene` (or the nodes that should cast) to `shadow.add`.
   * @default null
   */
  shadow: Shadow | null
  /** What relative URIs are resolved against. @default the file's URL */
  baseURL: string
  /** Aborts the requests. */
  signal: AbortSignal
}

/** What a glTF file loads as. */
export interface GLTF {
  /** The default scene's root. Add it to your own scene. */
  scene: Obj
  /** Every scene's root. A node in several scenes ends up in the last. */
  scenes: Obj[]
  /** Every node, by glTF index. */
  nodes: Obj[]
  /** Every mesh made, including each primitive of a multi-primitive mesh. */
  meshes: Mesh[]
  cameras: Camera[]
  /** The programs made for the materials. */
  programs: LitProgram[]
  textures: Texture[]
  /** The lights the programs share. */
  lights: Lights
  /** The parsed glTF JSON. */
  json: GLTFJson
  /** Free every geometry, program and texture made for the file. */
  remove(): void
}

/**
 * Loads glTF 2.0 files, `.glb` or `.gltf`, for the occasional hero model.
 *
 * ```ts
 * const gltf = await GLTFLoader.load(gl, '/models/hero.glb', { lights })
 * gltf.scene.setParent(scene)
 * ```
 *
 * Nodes become `Obj`s with their names, meshes become `Mesh`es (a group of
 * them, for a mesh with several primitives), and cameras become `Camera`s.
 * Meshes used by several nodes share their geometry and program.
 * `EXT_mesh_gpu_instancing` nodes become an `InstancedMesh`.
 *
 * Attributes are read into floats as `position`, `normal`, `uv` and
 * `colour`, so bounds, `Raycast` and the geometry tools all work on them.
 * Vertex colours and material colour factors are linear in glTF, and are
 * converted to sRGB, the space `LitProgram` shades in. Materials are approximated with `LitProgram`: see `materialProgram` for
 * what's mapped and what isn't. A primitive without normals is shaded flat.
 *
 * Not supported: skinning, morph targets, animation, PBR materials, other uv
 * sets, and compression (Draco, meshopt). A file that requires an extension
 * the loader doesn't support is rejected, naming it.
 */
export class GLTFLoader {
  /** Fetch and parse a `.glb` or `.gltf` file. */
  static async load(
    gl: WTCGLRenderingContext,
    url: string,
    options: Partial<GLTFLoaderOptions> = {}
  ): Promise<GLTF> {
    const response = await fetch(url, { signal: options.signal })
    if (!response.ok) {
      throw new Error(
        `GLTFLoader: ${url} failed with ${response.status} ${response.statusText}`
      )
    }
    const base =
      typeof location !== 'undefined' ? resolve(url, location.href) : url
    return GLTFLoader.parse(gl, await response.arrayBuffer(), {
      baseURL: base,
      ...options
    })
  }

  /**
   * Parse a glTF file already in hand: a `.glb` or `.gltf` as an
   * `ArrayBuffer`, or the parsed JSON of a `.gltf`.
   */
  static async parse(
    gl: WTCGLRenderingContext,
    data: ArrayBuffer | GLTFJson,
    {
      lights = new Lights(),
      shadow = null,
      baseURL = '',
      signal
    }: Partial<GLTFLoaderOptions> = {}
  ): Promise<GLTF> {
    const { json, bin } = read(data)

    const unsupported = (json.extensionsRequired ?? []).filter(
      (name) => !SUPPORTED.has(name)
    )
    if (unsupported.length) {
      throw new Error(
        `GLTFLoader: the file requires ${unsupported.join(', ')}, which isn't supported`
      )
    }

    // Buffers: the GLB's own, or fetched from their URIs
    const buffers = await Promise.all(
      (json.buffers ?? []).map(async (buffer, i) => {
        if (buffer.uri === undefined) {
          if (i === 0 && bin) return bin
          throw new Error(`GLTFLoader: buffer ${i} has no data`)
        }
        const response = await fetch(resolve(buffer.uri, baseURL), { signal })
        if (!response.ok) {
          throw new Error(
            `GLTFLoader: buffer ${buffer.uri} failed with ${response.status}`
          )
        }
        return response.arrayBuffer()
      })
    )

    // Textures used by materials, each loaded once
    const used = new Set<number>()
    for (const material of json.materials ?? []) {
      const base = material.pbrMetallicRoughness?.baseColorTexture?.index
      const emissive = material.emissiveTexture?.index
      if (base !== undefined) used.add(base)
      if (emissive !== undefined) used.add(emissive)
    }
    const textures: (Texture | undefined)[] = []
    await Promise.all(
      [...used].map(async (index) => {
        textures[index] = await loadTexture(
          gl,
          json,
          buffers,
          index,
          baseURL,
          signal
        )
      })
    )

    return build(gl, json, buffers, textures, lights, shadow)
  }
}

/** A GLB's JSON and binary chunk, or a `.gltf`'s JSON. */
function read(data: ArrayBuffer | GLTFJson): {
  json: GLTFJson
  bin?: ArrayBuffer
} {
  if (!(data instanceof ArrayBuffer)) return { json: data }
  const view = new DataView(data)
  // 'glTF'
  if (data.byteLength < 12 || view.getUint32(0, true) !== 0x46546c67) {
    return { json: JSON.parse(new TextDecoder().decode(data)) }
  }
  let json: GLTFJson | undefined
  let bin: ArrayBuffer | undefined
  let offset = 12
  while (offset + 8 <= data.byteLength) {
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (type === 0x4e4f534a) {
      json = JSON.parse(
        new TextDecoder().decode(new Uint8Array(data, start, length))
      )
    } else if (type === 0x004e4942) {
      bin = data.slice(start, start + length)
    }
    offset = start + length
  }
  if (!json) throw new Error('GLTFLoader: the GLB has no JSON chunk')
  return { json, bin }
}

/** Build the scene graph, once the buffers and textures are in. */
function build(
  gl: WTCGLRenderingContext,
  json: GLTFJson,
  buffers: ArrayBuffer[],
  textures: (Texture | undefined)[],
  lights: Lights,
  shadow: Shadow | null
): GLTF {
  const meshes: Mesh[] = []
  const cameras: Camera[] = []
  const programs = new Map<string, LitProgram>()
  const geometries = new Map<string, Geometry>()

  const program = (material: number | undefined, flags: ProgramFlags) => {
    const key = `${material ?? -1}|${+flags.vertexColours}|${+flags.flatShading}|${+flags.instanced}`
    let p = programs.get(key)
    if (!p) {
      p = materialProgram(
        gl,
        material !== undefined ? json.materials?.[material] : undefined,
        textures,
        lights,
        flags,
        shadow
      )
      programs.set(key, p)
    }
    return p
  }

  const geometry = (meshIndex: number, primitiveIndex: number) => {
    const key = `${meshIndex}|${primitiveIndex}`
    let g = geometries.get(key)
    if (!g) {
      const primitive = json.meshes![meshIndex].primitives[primitiveIndex]
      const attributes: Record<string, GeometryAttribute> = {}
      for (const [name, accessor] of Object.entries(primitive.attributes)) {
        const ours = ATTRIBUTES[name]
        if (!ours) continue
        const { data, size } = readFloats(json, buffers, accessor)
        // Vertex colours are linear in glTF, and shaded as sRGB
        if (ours === 'colour') linearToSRGBArray(data, size)
        attributes[ours] = new GeometryAttribute({ size, data })
      }
      if (primitive.indices !== undefined) {
        attributes.index = new GeometryAttribute({
          data: readIndices(json, buffers, primitive.indices)
        })
      }
      g = new Geometry(gl, attributes)
      geometries.set(key, g)
    }
    return g
  }

  /** The meshes for one glTF mesh, instanced or not. */
  const meshesFor = (node: GLTFNode): Mesh[] => {
    const index = node.mesh!
    const instancing = node.extensions?.EXT_mesh_gpu_instancing
    const matrices = instancing ? instanceMatrices(instancing.attributes) : null
    return json.meshes![index].primitives.map((primitive, p) => {
      const flags = {
        vertexColours: primitive.attributes.COLOR_0 !== undefined,
        flatShading: primitive.attributes.NORMAL === undefined,
        instanced: !!matrices
      }
      const options = {
        geometry: geometry(index, p),
        program: program(primitive.material, flags),
        mode: primitive.mode ?? gl.TRIANGLES
      }
      let mesh: Mesh
      if (matrices) {
        const instanced = new InstancedMesh(gl, {
          ...options,
          count: matrices.length / 16
        })
        instanced.matrices.set(matrices)
        instanced.count = matrices.length / 16
        mesh = instanced
      } else {
        mesh = new Mesh(gl, options)
      }
      meshes.push(mesh)
      return mesh
    })
  }

  /** Instance matrices composed from EXT_mesh_gpu_instancing accessors. */
  const instanceMatrices = (attributes: {
    TRANSLATION?: number
    ROTATION?: number
    SCALE?: number
  }) => {
    const read = (index: number | undefined) =>
      index === undefined ? null : readAccessor(json, buffers, index).values
    const t = read(attributes.TRANSLATION)
    const r = read(attributes.ROTATION)
    const s = read(attributes.SCALE)
    const count = Math.max(
      t ? t.length / 3 : 0,
      r ? r.length / 4 : 0,
      s ? s.length / 3 : 0
    )
    const out = new Float32Array(count * 16)
    const position = new Vec3()
    const rotation = new Quat()
    const scale = new Vec3(1, 1, 1)
    const m = new Obj().matrix
    for (let i = 0; i < count; i++) {
      position.x = t ? t[i * 3] : 0
      position.y = t ? t[i * 3 + 1] : 0
      position.z = t ? t[i * 3 + 2] : 0
      rotation.x = r ? r[i * 4] : 0
      rotation.y = r ? r[i * 4 + 1] : 0
      rotation.z = r ? r[i * 4 + 2] : 0
      rotation.w = r ? r[i * 4 + 3] : 1
      scale.x = s ? s[i * 3] : 1
      scale.y = s ? s[i * 3 + 1] : 1
      scale.z = s ? s[i * 3 + 2] : 1
      composeMat4(m, rotation, position, scale)
      out.set(
        [
          m.a11, m.a12, m.a13, m.a14, m.a21, m.a22, m.a23, m.a24,
          m.a31, m.a32, m.a33, m.a34, m.a41, m.a42, m.a43, m.a44
        ],
        i * 16
      ) // prettier-ignore
    }
    return out
  }

  const camera = (c: GLTFCamera) => {
    if (c.type === 'orthographic' && c.orthographic) {
      const o = c.orthographic
      return new Camera({
        left: -o.xmag,
        right: o.xmag,
        bottom: -o.ymag,
        top: o.ymag,
        near: o.znear,
        far: o.zfar
      })
    }
    const p = c.perspective!
    const canvas = gl.canvas as { width?: number; height?: number }
    return new Camera({
      fov: (p.yfov * 180) / Math.PI,
      aspect:
        p.aspectRatio ??
        (canvas.width && canvas.height ? canvas.width / canvas.height : 1),
      near: p.znear,
      far: p.zfar ?? 1000
    })
  }

  // Nodes, then their parents
  const nodes: Obj[] = (json.nodes ?? []).map((node) => {
    let obj: Obj
    const made = node.mesh !== undefined ? meshesFor(node) : []
    if (made.length === 1) obj = made[0]
    else {
      obj =
        node.camera !== undefined && !made.length
          ? camera(json.cameras![node.camera])
          : new Obj()
      made.forEach((mesh, i) => {
        mesh.name = `${node.name ?? ''}${made.length > 1 ? `.${i}` : ''}`
        mesh.setParent(obj)
      })
    }
    if (node.camera !== undefined) {
      const c = obj instanceof Camera ? obj : camera(json.cameras![node.camera])
      if (c !== obj) c.setParent(obj)
      cameras.push(c)
      c.name = node.name ?? ''
    }
    obj.name = node.name ?? ''
    transform(obj, node)
    return obj
  })
  json.nodes?.forEach((node, i) => {
    for (const child of node.children ?? []) nodes[child].setParent(nodes[i])
  })

  // Scenes. Without any, every root node goes in one.
  const sceneDefs = json.scenes?.length
    ? json.scenes
    : [
        {
          nodes: nodes.map((n, i) => (n.parent ? -1 : i)).filter((i) => i >= 0)
        }
      ]
  const scenes = sceneDefs.map((def) => {
    const root = new Obj()
    root.name = (def as { name?: string }).name ?? ''
    return { root, def }
  })
  const defaultScene = json.scene ?? 0
  // The default scene last, so it keeps nodes it shares with others
  for (const [i, { root, def }] of scenes.entries()) {
    if (i === defaultScene) continue
    for (const n of def.nodes ?? []) nodes[n].setParent(root)
  }
  for (const n of scenes[defaultScene]?.def.nodes ?? []) {
    nodes[n].setParent(scenes[defaultScene].root)
  }

  const programList = [...programs.values()]
  const textureList = textures.filter((t): t is Texture => !!t)
  return {
    scene: scenes[defaultScene]?.root ?? new Obj(),
    scenes: scenes.map((s) => s.root),
    nodes,
    meshes,
    cameras,
    programs: programList,
    textures: textureList,
    lights,
    json,
    remove() {
      for (const mesh of meshes) {
        // An instanced mesh's own geometry only reads the shared one
        if (mesh instanceof InstancedMesh) mesh.geometry.remove()
      }
      for (const g of geometries.values()) g.remove()
      for (const p of programList) p.remove()
      for (const t of textureList) t.remove()
    }
  }
}

/** Set an object's transform from a node's TRS or matrix. */
function transform(obj: Obj, node: GLTFNode) {
  if (node.matrix) {
    const m = node.matrix
    const o = obj.matrix
    o.a11 = m[0]
    o.a12 = m[1]
    o.a13 = m[2]
    o.a14 = m[3] // prettier-ignore
    o.a21 = m[4]
    o.a22 = m[5]
    o.a23 = m[6]
    o.a24 = m[7] // prettier-ignore
    o.a31 = m[8]
    o.a32 = m[9]
    o.a33 = m[10]
    o.a34 = m[11] // prettier-ignore
    o.a41 = m[12]
    o.a42 = m[13]
    o.a43 = m[14]
    o.a44 = m[15] // prettier-ignore
    obj.decompose()
    return
  }
  const t = node.translation
  const r = node.rotation
  const s = node.scale
  if (t) {
    obj.position.x = t[0]
    obj.position.y = t[1]
    obj.position.z = t[2]
  }
  if (r) {
    obj.quaternion.x = r[0]
    obj.quaternion.y = r[1]
    obj.quaternion.z = r[2]
    obj.quaternion.w = r[3]
    // So the Euler rotation agrees, for anything that edits it later
    obj.updateQuaternion()
  }
  if (s) {
    obj.scale.x = s[0]
    obj.scale.y = s[1]
    obj.scale.z = s[2]
  }
}
