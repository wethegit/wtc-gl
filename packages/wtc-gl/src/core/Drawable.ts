import type { WTCGLRenderingContext } from '../types'

import { Obj } from './Object'
import { Program } from './Program'

let ID = 0

/**
 * Options for creating a {@link Drawable}.
 * @category Core
 */
export interface DrawableOptions {
  /** Whether to skip the object when it's outside the camera's frustum. @default true */
  frustumCulled: boolean
  /** An explicit render order. When 0, the order comes from the object's depth at render time. @default 0 */
  renderOrder: number
}

/**
 * Class representing A drawable object. A drawable object is one that is actually rendered to screen, this does not include cameras and groups.
 * @extends Obj
 * @category Core
 **/
export class Drawable extends Obj {
  /**
   * The unique ID of the Geometry.
   */
  id: number
  /**
   * The WTCGL rendering context.
   */
  gl: WTCGLRenderingContext
  /**
   * The program that is rendering this object. A plain Drawable used as a
   * group node has none.
   */
  program?: Program
  /**
   * Whether to apply frustum culling to this object
   * @default true
   */
  frustumCulled: boolean
  /**
   * Apply a specific render order, overriding calculated z-depth
   * @default 0
   */
  renderOrder: number = 0
  /**
   * The z-depth of the object, calculated at render time.
   * @default 0
   */
  zDepth: number = 0

  /**
   * Create a drawable object. This should never be instanciated directly
   * @param gl - The WTCGL Rendering context
   * @param options - Culling and render order; see {@link DrawableOptions}.
   */
  constructor(
    gl: WTCGLRenderingContext,
    { frustumCulled = true, renderOrder = 0 }: Partial<DrawableOptions> = {}
  ) {
    super()

    if (!gl.canvas)
      console.error(
        'WTCGLRenderingContext should be passed as the first argument to Object'
      )

    this.gl = gl
    this.id = ID++

    this.frustumCulled = frustumCulled

    this.renderOrder = renderOrder
  }

  /**
   * Draw placeholder. The draw function is responsible for drawing the element. This function simply provides a signature for extension.
   **/
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  draw(..._args: any[]): void {}
}
