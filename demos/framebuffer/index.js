import { FragmentShader, Texture, Uniform, Triangle, Program, Mesh, Framebuffer } from '../../src/lib'

import '../style.css'

import fragment from './main.frag'
import vertex from './main.vert'
import renderFragment from './render.frag'

async function init() {
  console.clear();

  const div = 1;
  let dir = [0,1];

  let it = 0;
  let mainFBO = null;
  let onBeforeRender = function() {
    // if(it++>20) FSWrapper.playing = false;
    uniforms.u_frame.value += 1;
    if(mainFBO) {
      const res = [...this.uniforms[`u_resolution`].value];
      this.uniforms[`u_resolution`].value = [res[0]/div, res[1]/div];
      this.uniforms[`u_blurdir`].value = dir.reverse();
      this.uniforms[`b_render`].value = mainFBO.read.texture;
      mainFBO.render(this.renderer, { scene: mainMesh });
      // this.uniforms[`u_blurdir`].value = dir.reverse();
      // this.uniforms[`b_render`].value = mainFBO.read.texture;
      // mainFBO.render(this.renderer, { scene: mainMesh });
      this.uniforms[`u_resolution`].value = res;
    }
  }
  let resizeTimer;
  window.addEventListener('resize', (e) => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      uniforms.u_frame.value = 0;
      mainFBO.resize(FSWrapper.dimensions.width/div, FSWrapper.dimensions.height/div);
    }, 10);
  })

  // Create the fragment shader wrapper
  const FSWrapper = new FragmentShader({
    fragment,
    vertex,
    onBeforeRender,
    rendererProps: {dpr:2},
    uniforms: { 'b_render': new Uniform({
        name: 'render',
        value: null,
        kind: 'texture'
      }) }
  });

  const { gl, uniforms, renderer, dimensions } = FSWrapper;

  uniforms.u_frame = new Uniform({
    name: 'frame',
    value: 0,
    kind: 'float'
  });
  uniforms.u_blurdir = new Uniform({
    name: 'blurdir',
    value: dir,
    kind: 'vec2'
  });

  const geometry = new Triangle(gl)
  const mainProgram = new Program(gl, {
    vertex,
    fragment,
    uniforms: uniforms
  });
  const mainMesh = new Mesh(gl, { geometry, program: mainProgram })
  mainFBO = new Framebuffer(gl, { 
    dpr: renderer.dpr, 
    name: 'render', 
    width: dimensions.width/div, 
    height: dimensions.height/div, 
    texdepth: Framebuffer.TEXTYPE_FLOAT,
    tiling: Framebuffer.IMAGETYPE_MIRROR,
    type: gl.FLOAT,
    minFilter: gl.NEAREST_MIPMAP_LINEAR,
    generateMipmaps: true
  });

  // Create the texture
  // const texture = new Texture(gl, {
  //   wrapS: gl.REPEAT,
  //   wrapT: gl.REPEAT,
  //   generateMipmaps: false
  // });
  // // Load the image into the uniform
  // const img = new Image();
  // img.crossOrigin = "anonymous";
  // img.src = "/public/noise.png";
  // img.onload = () => (texture.image = img);

  // uniforms.s_noise = new Uniform({
  //   name: "noise",
  //   value: texture,
  //   kind: "texture"
  // });
}

init()
