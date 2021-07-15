import { WTCGLRenderingContext } from './types'
import { Obj } from './Object'
import { Program } from './Program'

let ID = 0

/**
 * Class representing A drawable object. A drawable object is one that is actually rendered to screen, this does not include cameras and groups.
 * @extends Obj
 **/
class Drawable extends Obj {
  /**
   * The unique ID of the Geometry.
   */
  id: number
  /**
   * The WTCGL rendering context.
   */
  gl: WTCGLRenderingContext
  /**
   * The program that is rendering this object
   */
  program: Program
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
   * @param {WTCGLRenderingContext} gl - The WTCGL Rendering context
   * @param {Object} __namedParameters - The parameters to be used for the camera
   * @param {boolean} frustumCulled - Whether to apply culling to this object
   * @param {number} renderOrder - The explicit render order of the object. If this is zero, then it will be instead calculated at render time.
   */
  constructor(
    gl: WTCGLRenderingContext,
    {
      frustumCulled = true,
      renderOrder = 0
    }: {
      frustumCulled?: boolean
      renderOrder?: number
    } = {}
  ) {
    super()
    if (!gl.canvas) console.error('gl not passed as first argument to Mesh')
    this.gl = gl
    this.id = ID++

    this.frustumCulled = frustumCulled

    this.renderOrder = renderOrder
  }
  /**
   * Draw placeholder. The draw function is responsible for drawing the element. This function simply provides a signature for extension.
   * @param {boolean} camera - The camera to use to render
   **/
  draw({ camera }: { camera?: any } = {}): void {}
}

export { Drawable }