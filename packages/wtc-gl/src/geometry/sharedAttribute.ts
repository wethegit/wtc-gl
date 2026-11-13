import type { WTCGLGeometryAttribute } from '../types'
import { GeometryAttribute } from './GeometryAttribute'

/**
 * A new attribute that reads another attribute's buffer, for a second
 * geometry drawing the same data. It's external, so the geometry it's added
 * to never uploads, recreates or deletes the buffer: that stays with the
 * attribute's own geometry. Internal to WireMesh and InstancedMesh.
 */
export function sharedAttribute(
  attr: WTCGLGeometryAttribute
): GeometryAttribute {
  return new GeometryAttribute({
    size: attr.size,
    stride: attr.stride,
    offset: attr.offset,
    count: attr.count,
    type: attr.type,
    normalized: attr.normalized,
    instanced: attr.divisor || attr.instanced || 0,
    data: attr.data,
    buffer: attr.buffer,
    external: true
  })
}
