import {
  ScrollScene,
  Drawable,
  Mesh,
  Plane,
  Program,
  Camera,
  Vec3,
  glsl
} from '../../../../src/lib'
import { scrollProgress, smoothstep } from '../../utils.js'
import layers3dVert from './layers3d.vert'
import layer1Frag from './layer1.frag'
import layer2Frag from './layer2.frag'
import layer3Frag from './layer3.frag'

export const initLayers = ({ gl, scrollRenderer }) => {
  const layersEl = document.querySelector('.scene--layers')
  const layersDrawable = new Drawable(gl)

  // Orthographic camera sized so a 1×1 plane fills ~70% of the element height.
  // Left/right are updated each frame to match the element's aspect ratio.
  const layersCamera = new Camera({
    left: -0.7,
    right: 0.7,
    top: 0.7,
    bottom: -0.7,
    near: -100,
    far: 100
  })
  layersCamera.position.z = 10
  layersCamera.lookAt(new Vec3(0, 0, 0))

  const layersScene = new ScrollScene({
    element: layersEl,
    scene: layersDrawable,
    camera: layersCamera,
    clipToViewport: false,
    useViewport: false,
    elementSpace: true
  })

  const LAYERS_GAP = 0.2
  const BOX_W = 0.7
  const BOX_H = 0.7

  const layerSideFrag = glsl`#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 colour;
void main() {
  float t = clamp(v_uv.y, 0.0, 1.0);
  colour = vec4(mix(vec3(0.10, 0.13, 0.19), vec3(0.04, 0.05, 0.08), t), 1.0);
}
`

  const mkSide = () =>
    new Program(gl, {
      vertex: layers3dVert,
      fragment: layerSideFrag,
      depthWrite: false,
      uniforms: layersScene.uniforms
    })

  // layerFrags[0] = back layer (HTML), [1] = middle (WebGL), [2] = front (Canvas)
  const layerFrags = [layer3Frag, layer2Frag, layer1Frag]
  layerFrags.forEach((frag, i) => {
    const group = new Drawable(gl)
    group.position.z = (1.5 - i) * LAYERS_GAP
    group.setParent(layersDrawable)

    if (i > 0) {
      // Left face — spans backward by LAYERS_GAP to connect to the previous layer's surface
      const leftMesh = new Mesh(gl, {
        geometry: new Plane(gl, { width: LAYERS_GAP, height: BOX_H }),
        program: mkSide(),
        renderOrder: (i + 1) * 3
      })
      leftMesh.position.x = -BOX_W / 2
      leftMesh.position.z = LAYERS_GAP / 2
      leftMesh.rotation.y = -Math.PI / 2
      leftMesh.updateRotation()
      leftMesh.setParent(group)

      // Top face — spans backward by LAYERS_GAP to connect to the previous layer's surface
      const topMesh = new Mesh(gl, {
        geometry: new Plane(gl, { width: BOX_W, height: LAYERS_GAP }),
        program: mkSide(),
        renderOrder: (i + 1) * 3 + 1
      })
      topMesh.position.y = BOX_H / 2
      topMesh.position.z = LAYERS_GAP / 2
      topMesh.rotation.x = -Math.PI / 2
      topMesh.updateRotation()
      topMesh.setParent(group)
    }

    // Front face — flush with the group origin (z=0 relative to group)
    const frontMesh = new Mesh(gl, {
      geometry: new Plane(gl, { width: BOX_W, height: BOX_H }),
      program: new Program(gl, {
        vertex: layers3dVert,
        fragment: frag,
        transparent: true,
        depthWrite: false,
        uniforms: layersScene.uniforms
      }),
      renderOrder: (i + 1) * 3 + 2
    })
    frontMesh.setParent(group)
  })

  layersScene.onBeforeRender = (_, rect) => {
    const p = smoothstep(0.4, 0.7, scrollProgress(rect))

    // Keep the orthographic frustum matched to the element's aspect ratio
    const ar = rect.width / rect.height
    layersCamera.orthographic({
      left: -ar * 0.7,
      right: ar * 0.7,
      top: 0.7,
      bottom: -0.7
    })

    // Rotate the scene: rotX tilts the top away (revealing layer depth),
    // rotY turns to show the upper-left perspective
    layersDrawable.rotation.x = p * 0.75
    layersDrawable.rotation.y = p * 0.5
    layersDrawable.updateRotation()
  }

  scrollRenderer.addScene(layersScene)
}
