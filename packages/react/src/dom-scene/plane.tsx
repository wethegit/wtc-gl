import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Mesh, Program, Texture, Uniform, Plane as PlaneGeometry } from 'wtc-gl'

import type {
  ScrollRenderer,
  ScrollScene,
  Vec3,
  WTCGLRenderingContext,
  WTCGLUniformValue
} from 'wtc-gl'

import { useDOMSceneContext } from './dom-scene-context'
import { resolveShaders } from './default-shaders'

/**
 * Uniform keys owned by the engine or the scene. The scene keys are shared
 * live `Uniform` objects updated by the render loop; the `u_*Matrix`-style
 * keys are re-assigned by `Mesh.draw` every frame. User values for any of
 * them are ignored.
 */
const RESERVED_UNIFORMS = new Set([
  'u_time',
  'u_resolution',
  'u_origin',
  'u_elementSize',
  'u_projectionMatrix',
  'u_viewMatrix',
  'u_modelMatrix',
  'u_modelViewMatrix',
  'u_normalMatrix',
  'u_cameraPosition',
  'u_objectPosition'
])

/** Context passed to a {@link PlaneProps.setup} callback. */
export interface PlaneSetupContext {
  gl: WTCGLRenderingContext
  renderer: ScrollRenderer
  scrollScene: ScrollScene
  mesh: Mesh
  program: Program
  geometry: PlaneGeometry
}

/** Props for {@link Plane}. Lengths are CSS pixels (see {@link DOMScene}). */
export interface PlaneProps {
  /**
   * Size in CSS px. Defaults to the scene element's size at creation time.
   * Changing size/segments/shaders recreates the GL resources; transforms and
   * uniform values update in place.
   */
  width?: number
  height?: number
  widthSegments?: number
  heightSegments?: number
  /** CSS px from the element centre, +Y up. */
  position?: [number, number, number]
  /** Euler rotation in radians - synced to the mesh quaternion each frame. */
  rotation?: [number, number, number]
  scale?: [number, number, number] | number
  visible?: boolean
  vertex?: string
  fragment?: string
  /**
   * Initial uniforms merged over the scene uniforms (`u_time`,
   * `u_resolution`, `u_origin`). Plain values are wrapped in `Uniform`
   * objects; pass a `Uniform` instance directly for textures. Value changes
   * apply live; *new keys* after creation are unsupported (uniform locations
   * are fixed when the program links) - change `fragment`/`vertex` to force a
   * rebuild instead.
   */
  uniforms?: Record<string, WTCGLUniformValue | Uniform>
  /** @default true */
  transparent?: boolean
  /**
   * @default true - the renderer's sorter drops meshes that are transparent
   * with depth-testing off, so leave this on.
   */
  depthTest?: boolean
  /** @default false - same-z planes composite in order without z-fighting. */
  depthWrite?: boolean
  /**
   * Render both faces (disables back-face culling). Useful when a camera can
   * orbit behind a plane. Captured at program creation, like
   * `transparent`/`depthTest` - flip live via `handle.program.cullFace`.
   *
   * @default false
   */
  doubleSided?: boolean
  /**
   * Render order within the scene. Defaults to registration order, so later
   * children stack on top, DOM-like.
   */
  renderOrder?: number
  /**
   * Escape hatch run once after the mesh is created and parented; may return
   * a cleanup function. Runs again if the GL resources are recreated.
   */
  setup?: (context: PlaneSetupContext) => void | (() => void)
}

/**
 * Imperative handle exposed on a {@link Plane} ref. All fields are `null`
 * until the plane's GL resources exist (and after unmount); the handle object
 * itself is stable across recreations.
 */
export interface PlaneHandle {
  readonly mesh: Mesh | null
  readonly program: Program | null
  readonly geometry: PlaneGeometry | null
  readonly uniforms: Record<string, Uniform> | null
  /** Mutate freely - CSS px from the element centre. */
  readonly position: Vec3 | null
  /** Mutate freely - Euler radians, auto-synced to the quaternion per frame. */
  readonly rotation: Vec3 | null
  readonly scale: Vec3 | null
  /** Set a uniform's value by key. No-op if the key doesn't exist. */
  setUniform(name: string, value: WTCGLUniformValue): void
}

/** Wraps plain uniform values in `Uniform` objects; instances pass through. */
function wrapUniform(
  name: string,
  value: WTCGLUniformValue | Uniform
): Uniform {
  if (value instanceof Uniform) return value
  return new Uniform({
    name,
    value,
    kind: value instanceof Texture ? 'texture' : 'float'
  })
}

/**
 * A plane mesh inside the nearest {@link DOMScene}, sized and positioned in
 * CSS pixels. Without `fragment`/`vertex` it renders a debug uv gradient.
 *
 * Renders nothing to the DOM.
 *
 * @example
 * const ref = useRef<PlaneHandle>(null)
 * // ...
 * <Plane ref={ref} width={300} height={200} fragment={frag}
 *        uniforms={{ u_mix: 0.5 }} />
 * // per-frame, no React re-render:
 * ref.current?.position.reset(x, y, 0)
 * ref.current?.setUniform('u_mix', 0.8)
 */
export const Plane = forwardRef<PlaneHandle, PlaneProps>(function Plane(
  {
    width,
    height,
    widthSegments,
    heightSegments,
    position,
    rotation,
    scale,
    visible = true,
    vertex,
    fragment,
    uniforms,
    transparent = true,
    depthTest = true,
    depthWrite = false,
    doubleSided = false,
    renderOrder,
    setup
  },
  ref
) {
  const ctx = useDOMSceneContext()

  const meshRef = useRef<Mesh | null>(null)
  const programRef = useRef<Program | null>(null)
  const geometryRef = useRef<PlaneGeometry | null>(null)
  const warnedKeys = useRef(new Set<string>())

  // Latest-value refs: creation happens once per structural change, but reads
  // of these always see the current props.
  const latest = useRef({
    position,
    rotation,
    scale,
    visible,
    uniforms,
    transparent,
    depthTest,
    depthWrite,
    doubleSided,
    renderOrder,
    setup
  })
  useEffect(() => {
    latest.current = {
      position,
      rotation,
      scale,
      visible,
      uniforms,
      transparent,
      depthTest,
      depthWrite,
      doubleSided,
      renderOrder,
      setup
    }
  })

  // Create/destroy. Structural props recreate the whole trio - cheap for a
  // quad, and trivially StrictMode-correct.
  useEffect(() => {
    if (!ctx) return
    const { gl, renderer, scrollScene } = ctx
    const props = latest.current

    const rect = scrollScene.element.getBoundingClientRect()
    const geometry = new PlaneGeometry(gl, {
      width: width ?? Math.max(rect.width, 1),
      height: height ?? Math.max(rect.height, 1),
      widthSegments,
      heightSegments
    })

    const programUniforms: Record<string, Uniform> = {
      ...scrollScene.uniforms
    }
    if (props.uniforms) {
      for (const [name, value] of Object.entries(props.uniforms)) {
        if (RESERVED_UNIFORMS.has(name)) {
          warnReserved(warnedKeys.current, name)
          continue
        }
        programUniforms[name] = wrapUniform(name, value)
      }
    }

    const program = new Program(gl, {
      ...resolveShaders({ vertex, fragment }),
      uniforms: programUniforms,
      transparent: props.transparent,
      depthTest: props.depthTest,
      depthWrite: props.depthWrite,
      // 0 is falsy, so applyState disables CULL_FACE - both faces render.
      ...(props.doubleSided ? { cullFace: 0 } : {})
    })

    const mesh = new Mesh(gl, { geometry, program })
    mesh.renderOrder = props.renderOrder ?? ctx.nextRenderOrder()
    applyTransforms(mesh, props)
    mesh.updateRotation()
    mesh.setParent(scrollScene.scene)

    // Euler -> quaternion sync: the engine only builds matrices from the
    // quaternion, so watch for rotation mutations (props or handle) each
    // frame, before world matrices update.
    let lastX = mesh.rotation.x
    let lastY = mesh.rotation.y
    let lastZ = mesh.rotation.z
    const unsubscribe = ctx.subscribeFrame(() => {
      const { x, y, z } = mesh.rotation
      if (x !== lastX || y !== lastY || z !== lastZ) {
        mesh.updateRotation()
        lastX = x
        lastY = y
        lastZ = z
      }
    })

    meshRef.current = mesh
    programRef.current = program
    geometryRef.current = geometry

    const cleanup = props.setup?.({
      gl,
      renderer,
      scrollScene,
      mesh,
      program,
      geometry
    })

    return () => {
      cleanup?.()
      unsubscribe()
      mesh.setParent(null)
      program.remove()
      geometry.remove()
      meshRef.current = null
      programRef.current = null
      geometryRef.current = null
    }
  }, [ctx, width, height, widthSegments, heightSegments, vertex, fragment])

  // Live transform sync - mutates the mesh, never recreates. Array props are
  // destructured into scalar deps so inline arrays don't churn the effect.
  const [px, py, pz] = position ?? []
  const [rx, ry, rz] = rotation ?? []
  const [sx, sy, sz] =
    typeof scale === 'number' ? [scale, scale, scale] : (scale ?? [])
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    if (px !== undefined) mesh.position.reset(px, py ?? 0, pz ?? 0)
    if (rx !== undefined) mesh.rotation.reset(rx, ry ?? 0, rz ?? 0)
    if (sx !== undefined) mesh.scale.reset(sx, sy ?? sx, sz ?? sx)
    mesh.visible = visible
  }, [ctx, px, py, pz, rx, ry, rz, sx, sy, sz, visible])

  // Live uniform values.
  useEffect(() => {
    const program = programRef.current
    if (!program || !uniforms) return
    for (const [name, value] of Object.entries(uniforms)) {
      if (RESERVED_UNIFORMS.has(name)) {
        warnReserved(warnedKeys.current, name)
        continue
      }
      const uniform = program.uniforms[name]
      if (!uniform) {
        if (!warnedKeys.current.has(name)) {
          warnedKeys.current.add(name)
          console.warn(
            `Plane: uniform "${name}" was added after creation - program uniforms are fixed when it links. Change the fragment/vertex prop identity to rebuild.`
          )
        }
        continue
      }
      uniform.value = value instanceof Uniform ? value.value : value
    }
  }, [ctx, uniforms])

  // Stable handle: getters read the refs, so recreations are invisible.
  useImperativeHandle(
    ref,
    () => ({
      get mesh() {
        return meshRef.current
      },
      get program() {
        return programRef.current
      },
      get geometry() {
        return geometryRef.current
      },
      get uniforms() {
        return programRef.current?.uniforms ?? null
      },
      get position() {
        return meshRef.current?.position ?? null
      },
      get rotation() {
        return meshRef.current?.rotation ?? null
      },
      get scale() {
        return meshRef.current?.scale ?? null
      },
      setUniform(name, value) {
        const uniform = programRef.current?.uniforms[name]
        if (uniform) uniform.value = value
      }
    }),
    []
  )

  return null
})

function applyTransforms(
  mesh: Mesh,
  props: {
    position?: [number, number, number]
    rotation?: [number, number, number]
    scale?: [number, number, number] | number
    visible: boolean
  }
) {
  if (props.position) mesh.position.reset(...props.position)
  if (props.rotation) mesh.rotation.reset(...props.rotation)
  if (props.scale !== undefined) {
    const s =
      typeof props.scale === 'number'
        ? ([props.scale, props.scale, props.scale] as const)
        : props.scale
    mesh.scale.reset(...s)
  }
  mesh.visible = props.visible
}

function warnReserved(warned: Set<string>, name: string) {
  if (warned.has(name)) return
  warned.add(name)
  console.warn(
    `Plane: uniform "${name}" is managed by the scene/engine and cannot be overridden - ignoring.`
  )
}
