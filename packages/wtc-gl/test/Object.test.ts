import { describe, expect, it } from 'vitest'
import { Vec3 } from 'wtc-math'

import { Obj } from '../src/core/Object'

const translationOf = (o: Obj) => {
  const t = o.worldMatrix.translation
  return [t.x, t.y, t.z]
}

describe('Obj scene graph', () => {
  it('composes world matrices down the hierarchy', () => {
    const parent = new Obj()
    const child = new Obj()
    parent.addChild(child)

    parent.position = new Vec3(1, 0, 0)
    parent.scale = new Vec3(2, 2, 2)
    child.position = new Vec3(1, 2, 0)

    parent.updateMatrixWorld()

    expect(translationOf(parent)).toEqual([1, 0, 0])
    // The child's offset is scaled by the parent, then translated
    expect(translationOf(child)).toEqual([3, 4, 0])
  })

  it('updates children when only the parent moves', () => {
    const parent = new Obj()
    const child = new Obj()
    parent.addChild(child)
    child.position = new Vec3(0, 1, 0)
    parent.updateMatrixWorld()

    parent.position = new Vec3(5, 0, 0)
    parent.updateMatrixWorld()

    expect(translationOf(child)).toEqual([5, 1, 0])
  })

  it('applies parent rotation to child position', () => {
    const parent = new Obj()
    const child = new Obj()
    parent.addChild(child)
    child.position = new Vec3(1, 0, 0)

    // Quarter turn about z takes +x to +y
    parent.rotation = new Vec3(0, 0, Math.PI / 2)
    parent.updateRotation()
    parent.updateMatrixWorld()

    const [x, y, z] = translationOf(child)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(1)
    expect(z).toBeCloseTo(0)
  })

  it('keeps parent and child links in sync', () => {
    const a = new Obj()
    const b = new Obj()
    const child = new Obj()

    a.addChild(child)
    expect(child.parent).toBe(a)
    expect(a.children).toEqual([child])

    // Reparenting removes the child from its old parent
    child.setParent(b)
    expect(child.parent).toBe(b)
    expect(a.children).toEqual([])
    expect(b.children).toEqual([child])

    b.removeChild(child)
    expect(child.parent).toBeNull()
    expect(b.children).toEqual([])
  })

  it('does not add the same child twice', () => {
    const parent = new Obj()
    const child = new Obj()
    parent.addChild(child)
    parent.addChild(child)
    expect(parent.children).toHaveLength(1)
  })

  it('stops traversing a branch when the callback returns true', () => {
    const root = new Obj()
    const skipped = new Obj()
    const hidden = new Obj()
    const visited = new Obj()
    root.addChild(skipped)
    skipped.addChild(hidden)
    root.addChild(visited)

    const seen: Obj[] = []
    root.traverse((node) => {
      seen.push(node)
      return node === skipped ? true : null
    })

    expect(seen).toEqual([root, skipped, visited])
  })
})
