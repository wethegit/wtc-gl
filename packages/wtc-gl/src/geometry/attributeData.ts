import type { WTCGLGeometryAttribute } from '../types'

// Internal helpers for reading attribute data on the CPU, shared by Geometry
// and the manifold adapter. Not exported from the package.

export type AttributeData = WTCGLGeometryAttribute['data']

// An attribute's offset and stride are in bytes, as GL expects; convert them
// to array indices
export const elementLayout = function (attr: WTCGLGeometryAttribute): {
  offset: number
  stride: number
} {
  const bytes = attr.data.BYTES_PER_ELEMENT
  return {
    offset: (attr.offset || 0) / bytes,
    stride: (attr.stride || 0) / bytes || attr.size
  }
}

// The index's entries, from its offset
export const indexEntries = function (
  index: WTCGLGeometryAttribute
): AttributeData {
  const start = (index.offset || 0) / index.data.BYTES_PER_ELEMENT
  return index.data.subarray(start, start + index.count)
}

// The smallest index array type that can hold `vertexCount` vertices
export const indexArray = function (
  entries: ArrayLike<number>,
  vertexCount: number
): Uint16Array | Uint32Array {
  return vertexCount <= 65536
    ? new Uint16Array(entries)
    : new Uint32Array(entries)
}
