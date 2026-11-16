import type { GLTFAccessor, GLTFJson } from './types'

/** Components per element of each accessor type. */
export const SIZES: Record<GLTFAccessor['type'], number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16
}

/** Bytes per component of each component type. */
const BYTES: Record<number, number> = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4 // FLOAT
}

/** A function reading one component at a byte offset, normalised or not. */
function componentReader(
  view: DataView,
  componentType: number,
  normalized: boolean
): (byteOffset: number) => number {
  switch (componentType) {
    case 5120:
      return normalized
        ? (o) => Math.max(view.getInt8(o) / 127, -1)
        : (o) => view.getInt8(o)
    case 5121:
      return normalized
        ? (o) => view.getUint8(o) / 255
        : (o) => view.getUint8(o)
    case 5122:
      return normalized
        ? (o) => Math.max(view.getInt16(o, true) / 32767, -1)
        : (o) => view.getInt16(o, true)
    case 5123:
      return normalized
        ? (o) => view.getUint16(o, true) / 65535
        : (o) => view.getUint16(o, true)
    case 5125:
      return (o) => view.getUint32(o, true)
    case 5126:
      return (o) => view.getFloat32(o, true)
  }
  throw new Error(`GLTFLoader: unknown component type ${componentType}`)
}

/**
 * Read an accessor's values, dequantised and with any sparse values applied,
 * into numbers: `count × size` of them, in element order.
 */
export function readAccessor(
  json: GLTFJson,
  buffers: ArrayBuffer[],
  index: number
): { values: Float64Array; size: number; count: number } {
  const accessor = json.accessors?.[index]
  if (!accessor) throw new Error(`GLTFLoader: no accessor ${index}`)
  const size = SIZES[accessor.type]
  const { count, componentType } = accessor
  const normalized = !!accessor.normalized
  const values = new Float64Array(count * size)

  // Without a buffer view, the values are all zero until sparse ones apply
  if (accessor.bufferView !== undefined) {
    const { view, stride } = bufferView(json, buffers, accessor.bufferView)
    const elementBytes = BYTES[componentType] * size
    const step = stride || elementBytes
    const read = componentReader(view, componentType, normalized)
    const start = accessor.byteOffset ?? 0
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < size; c++) {
        values[i * size + c] = read(start + i * step + c * BYTES[componentType])
      }
    }
  }

  const sparse = accessor.sparse
  if (sparse) {
    const indices = bufferView(json, buffers, sparse.indices.bufferView).view
    const readIndex = componentReader(
      indices,
      sparse.indices.componentType,
      false
    )
    const valueView = bufferView(json, buffers, sparse.values.bufferView).view
    const readValue = componentReader(valueView, componentType, normalized)
    const indexBytes = BYTES[sparse.indices.componentType]
    const componentBytes = BYTES[componentType]
    for (let k = 0; k < sparse.count; k++) {
      const i = readIndex((sparse.indices.byteOffset ?? 0) + k * indexBytes)
      for (let c = 0; c < size; c++) {
        values[i * size + c] = readValue(
          (sparse.values.byteOffset ?? 0) + (k * size + c) * componentBytes
        )
      }
    }
  }

  return { values, size, count }
}

/** A buffer view's bytes and stride. */
function bufferView(json: GLTFJson, buffers: ArrayBuffer[], index: number) {
  const view = json.bufferViews?.[index]
  if (!view) throw new Error(`GLTFLoader: no buffer view ${index}`)
  const buffer = buffers[view.buffer]
  if (!buffer) throw new Error(`GLTFLoader: no buffer ${view.buffer}`)
  return {
    view: new DataView(buffer, view.byteOffset ?? 0, view.byteLength),
    stride: view.byteStride ?? 0
  }
}

/** A buffer view's bytes, for an image stored in one. */
export function bufferViewBytes(
  json: GLTFJson,
  buffers: ArrayBuffer[],
  index: number
): Uint8Array {
  const { view } = bufferView(json, buffers, index)
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
}

/** An accessor as floats, for a vertex attribute. */
export function readFloats(
  json: GLTFJson,
  buffers: ArrayBuffer[],
  index: number
) {
  const { values, size } = readAccessor(json, buffers, index)
  return { data: new Float32Array(values), size }
}

/** An accessor as an index buffer: 16-bit unless it needs 32. */
export function readIndices(
  json: GLTFJson,
  buffers: ArrayBuffer[],
  index: number
): Uint16Array | Uint32Array {
  const { values } = readAccessor(json, buffers, index)
  const wide = json.accessors![index].componentType === 5125
  return wide ? new Uint32Array(values) : new Uint16Array(values)
}
