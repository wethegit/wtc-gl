import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Mat4 } from 'wtc-math'

import { Camera } from '../src/core/Camera'
import { InstancedMesh } from '../src/core/InstancedMesh'
import { Mesh } from '../src/core/Mesh'
import { Texture } from '../src/core/Texture'
import { Lights } from '../src/lighting/Lights'
import { LitProgram } from '../src/lighting/LitProgram'
import { GLTFLoader } from '../src/loaders/GLTFLoader'
import { createMockRenderer, type MockGL } from './mockGL'

// ── Building test files ─────────────────────────────────────────────────────

type Json = Record<string, unknown>

/** A binary buffer built up from typed arrays, each 4-byte aligned. */
class Bin {
  parts: Uint8Array[] = []
  length = 0
  /** Append data and return a buffer view for it. */
  view(data: ArrayBufferView, extra: Json = {}): Json {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    const byteOffset = this.length
    this.parts.push(bytes)
    this.length += bytes.byteLength
    const pad = (4 - (this.length % 4)) % 4
    if (pad) {
      this.parts.push(new Uint8Array(pad))
      this.length += pad
    }
    return { buffer: 0, byteOffset, byteLength: bytes.byteLength, ...extra }
  }
  bytes() {
    const out = new Uint8Array(this.length)
    let o = 0
    for (const p of this.parts) {
      out.set(p, o)
      o += p.byteLength
    }
    return out
  }
}

/** A GLB file from a glTF JSON and binary buffer. */
function glb(json: Json, bin?: Bin): ArrayBuffer {
  const body = bin?.bytes() ?? new Uint8Array(0)
  if (bin) json.buffers = [{ byteLength: body.byteLength }]
  let text = JSON.stringify(json)
  while (text.length % 4) text += ' '
  const jsonBytes = new TextEncoder().encode(text)
  const binLength = body.byteLength + ((4 - (body.byteLength % 4)) % 4)
  const total = 12 + 8 + jsonBytes.byteLength + (bin ? 8 + binLength : 0)
  const out = new ArrayBuffer(total)
  const view = new DataView(out)
  view.setUint32(0, 0x46546c67, true) // glTF
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonBytes.byteLength, true)
  view.setUint32(16, 0x4e4f534a, true) // JSON
  new Uint8Array(out, 20, jsonBytes.byteLength).set(jsonBytes)
  if (bin) {
    const o = 20 + jsonBytes.byteLength
    view.setUint32(o, binLength, true)
    view.setUint32(o + 4, 0x004e4942, true) // BIN
    new Uint8Array(out, o + 8, body.byteLength).set(body)
  }
  return out
}

const FLOAT = 5126
const UNSIGNED_SHORT = 5123
const UNSIGNED_BYTE = 5121
const UNSIGNED_INT = 5125

/**
 * One triangle's buffers and accessors: float positions and normals,
 * normalised UNSIGNED_SHORT uvs and UNSIGNED_BYTE indices.
 */
function triangle(bin: Bin, json: { bufferViews: Json[]; accessors: Json[] }) {
  const add = (data: ArrayBufferView, accessor: Json) => {
    json.bufferViews.push(bin.view(data))
    json.accessors.push({
      bufferView: json.bufferViews.length - 1,
      ...accessor
    })
    return json.accessors.length - 1
  }
  const POSITION = add(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), {
    componentType: FLOAT,
    count: 3,
    type: 'VEC3',
    min: [0, 0, 0],
    max: [1, 1, 0]
  })
  const NORMAL = add(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), {
    componentType: FLOAT,
    count: 3,
    type: 'VEC3'
  })
  const TEXCOORD_0 = add(new Uint16Array([0, 0, 65535, 0, 0, 65535]), {
    componentType: UNSIGNED_SHORT,
    normalized: true,
    count: 3,
    type: 'VEC2'
  })
  const indices = add(new Uint8Array([0, 1, 2]), {
    componentType: UNSIGNED_BYTE,
    count: 3,
    type: 'SCALAR'
  })
  return { attributes: { POSITION, NORMAL, TEXCOORD_0 }, indices }
}

/** A file with one triangle mesh, and whatever else `extend` adds. */
async function load(
  gl: MockGL,
  extend: (
    json: Json & {
      bufferViews: Json[]
      accessors: Json[]
      meshes: Json[]
      nodes: Json[]
    },
    bin: Bin,
    primitive: Json
  ) => void = () => {},
  options = {}
) {
  const bin = new Bin()
  const json = {
    asset: { version: '2.0' },
    bufferViews: [] as Json[],
    accessors: [] as Json[],
    meshes: [] as Json[],
    nodes: [] as Json[],
    scenes: [{ nodes: [0] }],
    scene: 0
  }
  const primitive = triangle(bin, json)
  json.meshes.push({ primitives: [primitive] })
  json.nodes.push({ name: 'tri', mesh: 0 })
  extend(json, bin, primitive)
  return GLTFLoader.parse(gl, glb(json, bin), options)
}

// ── Tests ──────────────────────────────────────────────────────────────────

let createImageBitmap: ReturnType<typeof vi.fn>
beforeEach(() => {
  createImageBitmap = vi.fn(async () => ({ width: 2, height: 2 }))
  vi.stubGlobal('createImageBitmap', createImageBitmap)
})
afterEach(() => vi.unstubAllGlobals())

describe('GLTFLoader', () => {
  describe('the scene graph', () => {
    it('builds nodes from TRS and matrices, under the default scene', async () => {
      const { gl } = createMockRenderer()
      const gltf = await load(gl, (json) => {
        json.nodes = [
          { name: 'root', translation: [1, 2, 3], children: [1] },
          {
            name: 'tri',
            mesh: 0,
            rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
            scale: [2, 2, 2]
          },
          {
            name: 'moved',
            matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1]
          }
        ]
        json.scenes = [{ nodes: [0] }, { nodes: [2] }]
        json.scene = 1
      })
      expect(gltf.scenes).toHaveLength(2)
      expect(gltf.scene).toBe(gltf.scenes[1])
      expect(gltf.scene.children.map((c) => c.name)).toEqual(['moved'])

      const [root, tri, moved] = gltf.nodes
      expect(root.name).toBe('root')
      expect([root.position.x, root.position.y, root.position.z]).toEqual([
        1, 2, 3
      ])
      expect(tri.parent).toBe(root)
      expect(tri).toBeInstanceOf(Mesh)
      expect(tri.quaternion.y).toBeCloseTo(Math.SQRT1_2)
      expect(tri.rotation.y).toBeCloseTo(Math.PI / 2)
      expect(tri.scale.x).toBe(2)
      expect(moved.position.x).toBeCloseTo(5)
    })
  })

  describe('accessors', () => {
    it('reads floats, dequantises normalised values and widens byte indices', async () => {
      const { gl } = createMockRenderer()
      const gltf = await load(gl)
      const mesh = gltf.nodes[0] as Mesh
      const { position, uv, normal, index } = mesh.geometry.attributes
      expect(position.data).toBeInstanceOf(Float32Array)
      expect(Array.from(position.data)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
      expect(Array.from(normal.data)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1])
      expect(uv.data).toBeInstanceOf(Float32Array)
      expect(Array.from(uv.data)).toEqual([0, 0, 1, 0, 0, 1])
      expect(index.data).toBeInstanceOf(Uint16Array)
      expect(Array.from(index.data)).toEqual([0, 1, 2])
    })

    it('reads interleaved buffer views', async () => {
      const { gl } = createMockRenderer()
      const gltf = await load(gl, (json, bin, primitive) => {
        // position, normal, position, normal, …
        const data = new Float32Array([
          0, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 1
        ])
        json.bufferViews.push(bin.view(data, { byteStride: 24 }))
        const view = json.bufferViews.length - 1
        json.accessors.push(
          {
            bufferView: view,
            byteOffset: 0,
            componentType: FLOAT,
            count: 3,
            type: 'VEC3'
          },
          {
            bufferView: view,
            byteOffset: 12,
            componentType: FLOAT,
            count: 3,
            type: 'VEC3'
          }
        )
        const attributes = primitive.attributes as Json
        attributes.POSITION = json.accessors.length - 2
        attributes.NORMAL = json.accessors.length - 1
      })
      const { position, normal } = (gltf.nodes[0] as Mesh).geometry.attributes
      expect(Array.from(position.data)).toEqual([0, 0, 0, 2, 0, 0, 0, 2, 0])
      expect(Array.from(normal.data)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1])
    })

    it('applies sparse values', async () => {
      const { gl } = createMockRenderer()
      const gltf = await load(gl, (json, bin, primitive) => {
        json.bufferViews.push(bin.view(new Uint32Array([1])))
        json.bufferViews.push(bin.view(new Float32Array([7, 8, 9])))
        const n = json.bufferViews.length
        json.accessors.push({
          componentType: FLOAT,
          count: 3,
          type: 'VEC3',
          sparse: {
            count: 1,
            indices: { bufferView: n - 2, componentType: UNSIGNED_INT },
            values: { bufferView: n - 1 }
          }
        })
        ;(primitive.attributes as Json).POSITION = json.accessors.length - 1
      })
      const { position } = (gltf.nodes[0] as Mesh).geometry.attributes
      expect(Array.from(position.data)).toEqual([0, 0, 0, 7, 8, 9, 0, 0, 0])
    })
  })

  describe('meshes', () => {
    it('groups a mesh with several primitives, and shares meshes between nodes', async () => {
      const { gl } = createMockRenderer()
      const gltf = await load(gl, (json, _bin, primitive) => {
        json.meshes[0] = { primitives: [primitive, primitive] }
        json.nodes = [
          { name: 'a', mesh: 0 },
          { name: 'b', mesh: 0 }
        ]
        json.scenes = [{ nodes: [0, 1] }]
      })
      const [a, b] = gltf.nodes
      expect(a).not.toBeInstanceOf(Mesh)
      expect(a.children).toHaveLength(2)
      expect(a.children.every((c) => c instanceof Mesh)).toBe(true)
      const meshA = a.children[0] as Mesh
      const meshB = b.children[0] as Mesh
      expect(meshB).not.toBe(meshA)
      expect(meshB.geometry).toBe(meshA.geometry)
      expect(meshB.program).toBe(meshA.program)
      expect(gltf.meshes).toHaveLength(4)
    })

    it('shades flat when a primitive has no normals', async () => {
      const { gl } = createMockRenderer()
      const gltf = await load(gl, (_json, _bin, primitive) => {
        delete (primitive.attributes as Json).NORMAL
      })
      const program = (gltf.nodes[0] as Mesh).program as LitProgram
      expect(program.flatShading).toBe(true)
    })

    it('reads COLOR_0 as vertex colours', async () => {
      const { gl } = createMockRenderer()
      const gltf = await load(gl, (json, bin, primitive) => {
        json.bufferViews.push(bin.view(new Float32Array(9).fill(0.5)))
        json.accessors.push({
          bufferView: json.bufferViews.length - 1,
          componentType: FLOAT,
          count: 3,
          type: 'VEC3'
        })
        ;(primitive.attributes as Json).COLOR_0 = json.accessors.length - 1
      })
      const mesh = gltf.nodes[0] as Mesh
      expect(mesh.geometry.attributes.colour.size).toBe(3)
      expect((mesh.program as LitProgram).vertexColours).toBe(true)
    })
  })

  describe('cameras', () => {
    it('makes perspective and orthographic cameras', async () => {
      const { gl } = createMockRenderer()
      const gltf = await load(gl, (json) => {
        json.cameras = [
          {
            type: 'perspective',
            perspective: {
              yfov: Math.PI / 4,
              aspectRatio: 2,
              znear: 0.5,
              zfar: 50
            }
          },
          {
            type: 'orthographic',
            orthographic: { xmag: 2, ymag: 1, znear: 0.1, zfar: 10 }
          }
        ]
        json.nodes.push({ name: 'eye', camera: 0 }, { name: 'top', camera: 1 })
        json.scenes = [{ nodes: [0, 1, 2] }]
      })
      expect(gltf.cameras).toHaveLength(2)
      const [eye, top] = gltf.cameras
      expect(gltf.nodes[1]).toBe(eye)
      expect(eye).toBeInstanceOf(Camera)
      expect(eye.name).toBe('eye')
      expect(eye.type).toBe('perspective')
      expect(eye.fov).toBeCloseTo(45)
      expect([eye.aspect, eye.near, eye.far]).toEqual([2, 0.5, 50])
      expect(top.type).toBe('orthographic')
      expect([top.left, top.right, top.bottom, top.top]).toEqual([-2, 2, -1, 1])
    })
  })

  describe('materials', () => {
    const withMaterial =
      (material: Json) => (json: Json, _bin: Bin, primitive: Json) => {
        json.materials = [material]
        primitive.material = 0
      }

    it('maps base colour, emissive and an approximate specular', async () => {
      const { gl } = createMockRenderer()
      const lights = new Lights()
      const gltf = await load(
        gl,
        withMaterial({
          pbrMetallicRoughness: {
            baseColorFactor: [1, 0.5, 0.25, 1],
            roughnessFactor: 0.5
          },
          emissiveFactor: [0.2, 0.1, 0]
        }),
        { lights }
      )
      const program = (gltf.nodes[0] as Mesh).program as LitProgram
      expect(program).toBeInstanceOf(LitProgram)
      expect(program.lights).toBe(lights)
      expect(program.colour).toEqual([1, 0.5, 0.25])
      expect(program.opacity).toBe(1)
      expect(program.transparent).toBe(false)
      expect(program.emissive.map((v) => +v.toFixed(5))).toEqual([0.2, 0.1, 0])
      expect(program.specular).toBeCloseTo(0.15)
      expect(program.shininess).toBeCloseTo(30)
      expect(gltf.programs).toEqual([program])
    })

    it('blends, masks and draws both sides', async () => {
      const { gl } = createMockRenderer()
      const blend = await load(
        gl,
        withMaterial({
          alphaMode: 'BLEND',
          pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 0.5] }
        })
      )
      const b = (blend.nodes[0] as Mesh).program as LitProgram
      expect(b.opacity).toBe(0.5)
      expect(b.transparent).toBe(true)

      const mask = await load(
        gl,
        withMaterial({ alphaMode: 'MASK', alphaCutoff: 0.3, doubleSided: true })
      )
      const m = (mask.nodes[0] as Mesh).program as LitProgram
      expect(m.uniforms.u_alphaTest.value).toBeCloseTo(0.3)
      expect(m.transparent).toBe(false)
      expect(m.doubleSided).toBe(true)

      const masked = await load(gl, withMaterial({ alphaMode: 'MASK' }))
      expect(
        ((masked.nodes[0] as Mesh).program as LitProgram).uniforms.u_alphaTest
          .value
      ).toBe(0.5)
    })

    it('gives primitives without a material a white program', async () => {
      const { gl } = createMockRenderer()
      const gltf = await load(gl)
      const program = (gltf.nodes[0] as Mesh).program as LitProgram
      expect(program.colour).toEqual([1, 1, 1])
    })
  })

  describe('textures', () => {
    it('loads images from buffer views once, with their samplers', async () => {
      const { gl } = createMockRenderer()
      const gltf = await load(gl, (json, bin, primitive) => {
        json.bufferViews.push(bin.view(new Uint8Array([137, 80, 78, 71])))
        json.images = [
          { bufferView: json.bufferViews.length - 1, mimeType: 'image/png' }
        ]
        json.samplers = [
          { wrapS: 33648, wrapT: 33071, magFilter: 9728, minFilter: 9987 }
        ]
        json.textures = [{ source: 0, sampler: 0 }]
        json.materials = [
          {
            pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
            emissiveTexture: { index: 0 }
          }
        ]
        primitive.material = 0
      })
      expect(gltf.textures).toHaveLength(1)
      const [texture] = gltf.textures
      expect(texture).toBeInstanceOf(Texture)
      expect(createImageBitmap).toHaveBeenCalledTimes(1)
      const [blob, options] = createImageBitmap.mock.calls[0]
      expect((blob as Blob).type).toBe('image/png')
      // glTF uvs start at the top left, so the image isn't flipped
      expect(options.imageOrientation).toBe('from-image')
      expect(texture.wrapS).toBe(gl.MIRRORED_REPEAT)
      expect(texture.wrapT).toBe(gl.CLAMP_TO_EDGE)
      expect(texture.magFilter).toBe(gl.NEAREST)
      expect(texture.minFilter).toBe(gl.LINEAR_MIPMAP_LINEAR)
      expect(texture.generateMipmaps).toBe(true)

      const program = (gltf.nodes[0] as Mesh).program as LitProgram
      expect(program.map).toBe(texture)
      expect(program.emissiveMap).toBe(texture)
      // An emissive texture lights up only through the factor, which is black
      // unless given
      expect(program.emissive).toEqual([0, 0, 0])
    })
  })

  describe('EXT_mesh_gpu_instancing', () => {
    it('makes an InstancedMesh from the instance transforms', async () => {
      const { gl } = createMockRenderer()
      const gltf = await load(gl, (json, bin) => {
        json.bufferViews.push(bin.view(new Float32Array([0, 0, 0, 3, 0, 0])))
        json.bufferViews.push(bin.view(new Float32Array([1, 1, 1, 2, 2, 2])))
        const n = json.bufferViews.length
        json.accessors.push(
          { bufferView: n - 2, componentType: FLOAT, count: 2, type: 'VEC3' },
          { bufferView: n - 1, componentType: FLOAT, count: 2, type: 'VEC3' }
        )
        const a = json.accessors.length
        json.nodes[0].extensions = {
          EXT_mesh_gpu_instancing: {
            attributes: { TRANSLATION: a - 2, SCALE: a - 1 }
          }
        }
        json.extensionsUsed = ['EXT_mesh_gpu_instancing']
      })
      const node = gltf.nodes[0]
      expect(node).toBeInstanceOf(InstancedMesh)
      const instances = node as InstancedMesh
      expect(instances.count).toBe(2)
      const m = instances.getMatrixAt(1, new Mat4())
      expect([m.a11, m.a22, m.a33, m.a41]).toEqual([2, 2, 2, 3])
      expect((instances.program as LitProgram).instanced).toBe(true)
    })
  })

  describe('files', () => {
    it('refuses files that need an extension it doesn’t support', async () => {
      const { gl } = createMockRenderer()
      await expect(
        load(gl, (json) => {
          json.extensionsUsed = ['KHR_draco_mesh_compression']
          json.extensionsRequired = ['KHR_draco_mesh_compression']
        })
      ).rejects.toThrow(/KHR_draco_mesh_compression/)
    })

    it('reads .gltf JSON with a data: URI buffer', async () => {
      const { gl } = createMockRenderer()
      const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(positions.buffer))
      )
      const gltf = await GLTFLoader.parse(gl, {
        asset: { version: '2.0' },
        buffers: [
          {
            byteLength: positions.byteLength,
            uri: `data:application/octet-stream;base64,${base64}`
          }
        ],
        bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
        accessors: [
          { bufferView: 0, componentType: FLOAT, count: 3, type: 'VEC3' }
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        nodes: [{ mesh: 0 }],
        scenes: [{ nodes: [0] }]
      })
      const mesh = gltf.nodes[0] as Mesh
      expect(Array.from(mesh.geometry.attributes.position.data)).toEqual(
        Array.from(positions)
      )
    })

    it('loads a .gltf with buffers relative to its URL', async () => {
      const { gl } = createMockRenderer()
      const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
      const files: Record<string, unknown> = {
        'https://example.com/models/scene.gltf': {
          asset: { version: '2.0' },
          buffers: [{ byteLength: positions.byteLength, uri: 'scene.bin' }],
          bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
          accessors: [
            { bufferView: 0, componentType: FLOAT, count: 3, type: 'VEC3' }
          ],
          meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
          nodes: [{ mesh: 0 }],
          scenes: [{ nodes: [0] }]
        },
        'https://example.com/models/scene.bin': positions.buffer
      }
      const fetch = vi.fn(async (url: string) => {
        const file = files[url]
        if (!file) return { ok: false, status: 404, statusText: 'Not Found' }
        const buffer =
          file instanceof ArrayBuffer
            ? file
            : new TextEncoder().encode(JSON.stringify(file)).buffer
        return { ok: true, status: 200, arrayBuffer: async () => buffer }
      })
      vi.stubGlobal('fetch', fetch)
      const gltf = await GLTFLoader.load(
        gl,
        'https://example.com/models/scene.gltf'
      )
      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/models/scene.bin',
        {
          signal: undefined
        }
      )
      expect(gltf.nodes[0]).toBeInstanceOf(Mesh)
    })

    it('frees what it made', async () => {
      const { gl } = createMockRenderer()
      const gltf = await load(gl)
      const geometry = (gltf.nodes[0] as Mesh).geometry
      const removes = [
        vi.spyOn(geometry, 'remove'),
        ...gltf.programs.map((p) => vi.spyOn(p, 'remove'))
      ]
      gltf.remove()
      for (const spy of removes) expect(spy).toHaveBeenCalled()
    })
  })
})
