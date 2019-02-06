class WTCGL {  
  constructor(el, vertexShaderSource, fragmentShaderSource, width, height, pxratio, styleElement) {
    this.run = this.run.bind(this);
    
    this._el = el;
    this._ctx = this._el.getContext("webgl2", this.webgl_params) || this._el.getContext("webgl", this.webgl_params) || this._el.getContext("experimental-webgl", this.webgl_params);
    
    this._ctx.getExtension('OES_standard_derivatives');
    this._ctx.getExtension('EXT_shader_texture_lod');

    if (!this._ctx) {
      console.log('Browser doesn\'t support WebGL ');
      return null;
    }

        
    this._vertexShader = WTCGL.createShaderOfType(this._ctx, this._ctx.VERTEX_SHADER, vertexShaderSource);
    this._fragmentShader = WTCGL.createShaderOfType(this._ctx, this._ctx.FRAGMENT_SHADER, fragmentShaderSource);
    
    this._program = this._ctx.createProgram();
    this._ctx.attachShader(this._program, this._vertexShader);
    this._ctx.attachShader(this._program, this._fragmentShader);
    this._ctx.linkProgram(this._program);
    
    if (!this._ctx.getProgramParameter(this._program, this._ctx.LINK_STATUS)) {
      console.log('Unable to initialize the shader program: ' + this._ctx.getProgramInfoLog(this._program));
      return null;
    }
    
    this.initBuffers([
      -1.0,  1.0, -1.,
       1.0,  1.0, -1.,
      -1.0, -1.0, -1.,
       1.0, -1.0, -1.,
    ]);
    
    this._programInfo = {
      attribs: {
        vertexPosition: this._ctx.getAttribLocation(this._program, 'a_position'),
      },
      uniforms: {
        projectionMatrix: this._ctx.getUniformLocation(this._program, 'u_projectionMatrix'),
        modelViewMatrix: this._ctx.getUniformLocation(this._program, 'u_modelViewMatrix'),
        resolution: this._ctx.getUniformLocation(this._program, 'u_resolution'),
        time: this._ctx.getUniformLocation(this._program, 'u_time'),
      },
    };
    
    // Tell WebGL to use our program when drawing
    this._ctx.useProgram(this._program);
    
    this.pxratio = pxratio;

    this.styleElement = styleElement !== true;
    
    this.resize(width, height);
  }
  
  resize(w, h) {
    this._el.width = w * this.pxratio;
    this._el.height = h * this.pxratio;
    this._size = [w * this.pxratio, h * this.pxratio];
    if(this.styleElement) {
      this._el.style.width = w + 'px';
      this._el.style.height = h + 'px';
    }
    
    this._ctx.viewportWidth = w * this.pxratio;
    this._ctx.viewportHeight = h * this.pxratio;
    
    this._ctx.uniform2fv( this._programInfo.uniforms.resolution, this._size);
    
    this.initBuffers(this._positions);
  }
  
  initBuffers(positions) {
    this._positions = positions;
    this._positionBuffer = this._ctx.createBuffer();
    
    this._ctx.bindBuffer(this._ctx.ARRAY_BUFFER, this._positionBuffer);
    
    this._ctx.bufferData(this._ctx.ARRAY_BUFFER,
                  new Float32Array(positions),
                  this._ctx.STATIC_DRAW);
  }
  
  addUniform(name, type, value) {
    let uniform = this._programInfo.uniforms[name];
    uniform = this._ctx.getUniformLocation(this._program, `u_${name}`);
    switch(type) {
      case WTCGL.TYPE_FLOAT : 
        if(!isNaN(value)) this._ctx.uniform1f( uniform, value);
        break;
      case WTCGL.TYPE_V2 : 
        if(value instanceof Array && value.length === 2.) this._ctx.uniform2fv( uniform, value);
        break;
      case WTCGL.TYPE_V3 : 
        if(value instanceof Array && value.length === 3.) this._ctx.uniform3fv( uniform, value);
        break;
      case WTCGL.TYPE_V4 : 
        if(value instanceof Array && value.length === 4.) this._ctx.uniform4fv( uniform, value);
        break;
    }
    this._programInfo.uniforms[name] = uniform;
    return uniform;
  }

  addTexture(name, type, image) {
    let textures = this.textures;
    let index = textures.length;
    
    var texture = this._ctx.createTexture();
    this._ctx.pixelStorei(this._ctx.UNPACK_FLIP_Y_WEBGL, true);
    this._ctx.bindTexture(this._ctx.TEXTURE_2D, texture);
    
    // this._ctx.generateMipmap(this._ctx.TEXTURE_2D);
 
    // Set the parameters based on the passed type
    if(type === WTCGL.IMAGETYPE_MIRROR) {
      this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_WRAP_S, this._ctx.MIRRORED_REPEAT);
      this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_WRAP_T, this._ctx.MIRRORED_REPEAT);
    } else if(type === WTCGL.IMAGETYPE_REGULAR) {
      this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_WRAP_S, this._ctx.CLAMP_TO_EDGE);
      this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_WRAP_T, this._ctx.CLAMP_TO_EDGE);
    }
    
    this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_MIN_FILTER, this._ctx.LINEAR);
    // this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_MAG_FILTER, this._ctx.LINEAR);
 
    // Upload the image into the texture.
    this._ctx.texImage2D(this._ctx.TEXTURE_2D, 0, this._ctx.RGBA, this._ctx.RGBA, this._ctx.UNSIGNED_BYTE, image);
 
    // add the texture to the array of textures.
    textures.push({name: name, tex: texture});
    
    // Finally set the this.textures (this is just to get around the funnyness of default getters)
    this.textures = textures;
    
    return texture;
  }

  updateTexture(texture, image) {
    this._ctx.bindTexture(this._ctx.TEXTURE_2D, texture);
    // Upload the image into the texture.
    this._ctx.texImage2D(this._ctx.TEXTURE_2D, 0, this._ctx.RGBA, this._ctx.RGBA, this._ctx.UNSIGNED_BYTE, image);
  }

  initTextures() {
    for(let i = 0; i < this.textures.length; i++) {
      let name = this.textures[i].name;
      let uniform = this._programInfo.uniforms[name];
      uniform = this._ctx.getUniformLocation(this._program, `u_${name}`);

      // Set the texture unit to the uniform
      this._ctx.uniform1i(uniform, i);

      // find the active texture based on the index
      this._ctx.activeTexture(this._ctx[`TEXTURE${i}`]);

      // Finally, bind the texture
      this._ctx.bindTexture(this._ctx.TEXTURE_2D, this.textures[i].tex);
    }
  }
  
  run(delta) {
    this.running && requestAnimationFrame(this.run);
    this.time = delta * .0002;
    this._ctx.uniform1f( this._programInfo.uniforms.time, this.time);
    this.render();
  }
  
  render() {
    this._ctx.viewport(0, 0, this._ctx.viewportWidth, this._ctx.viewportHeight);
    if(this.clearing) {
      this._ctx.clearColor(1.0, 0.0, 0.0, 0.0);
      // this._ctx.clearDepth(1.0);
      // this._ctx.enable(this._ctx.DEPTH_TEST);
      // this._ctx.depthFunc(this._ctx.LEQUAL);
      this._ctx.blendFunc(this._ctx.SRC_ALPHA, this._ctx.ONE_MINUS_SRC_ALPHA);

      this._ctx.clear( this._ctx.COLOR_BUFFER_BIT );
    }

    this._ctx.bindBuffer(this._ctx.ARRAY_BUFFER, this._positionBuffer);
    this._ctx.vertexAttribPointer(
        this._programInfo.attribs.vertexPosition,
        3,
        this._ctx.FLOAT,
        false,
        0,
        0);
    this._ctx.enableVertexAttribArray(this._programInfo.attribs.vertexPosition);

    // Set the shader uniforms
    this.includePerspectiveMatrix && this._ctx.uniformMatrix4fv( this._programInfo.uniforms.projectionMatrix, false, this.perspectiveMatrix);
    this.includeModelViewMatrix && this._ctx.uniformMatrix4fv( this._programInfo.uniforms.modelViewMatrix, false, this.modelViewMatrix);

    this._ctx.drawArrays(this._ctx.TRIANGLE_STRIP, 0, 4);
  }

  get webgl_params() {
    return { alpha: true };
  }
  
  set styleElement(value) {
    this._styleElement = value === true;
    if(this._styleElement === false && this._el) {
      this._el.style.width = '';
      this._el.style.height = '';
    }
  }
  get styleElement() {
    return this._styleElement !== false;
  }
  
  set time(value) {
    if(!isNaN(value)) {
      this._time = value;
    }
  }
  get time() {
    return this._time || 0;
  }
  
  set includePerspectiveMatrix(value) {
    this._includePerspectiveMatrix = value === true;
  }
  get includePerspectiveMatrix() {
    return this._includePerspectiveMatrix === true;
  }
  
  set includeModelViewMatrix(value) {
    this._includeModelViewMatrix = value === true;
  }
  get includeModelViewMatrix() {
    return this._includeModelViewMatrix === true;
  }

  set textures(value) {
    if(value instanceof Array) {
      this._textures = value;
    }
  }
  get textures() {
    return this._textures || [];
  }
  
  set clearing(value) {
    this._clearing = value === true;
  }
  get clearing() {
    return this._clearing === true;
  }
  
  set running(value) {
    !this.running && value === true && requestAnimationFrame(this.run);
    this._running = value === true;
  }
  get running() {
    return this._running === true;
  }
  
  set pxratio(value) {
    if(value > 0) this._pxratio = value;
  }
  get pxratio() {
    return this._pxratio || 1;
  }
  
  get perspectiveMatrix() {
    // Create a perspective matrix, a special matrix that is
    // used to simulate the distortion of perspective in a camera.
    // Our field of view is 45 degrees, with a width/height
    // ratio that matches the display size of the canvas
    // and we only want to see objects between 0.1 units
    // and 100 units away from the camera.
    const fieldOfView = 45 * Math.PI / 180;   // in radians
    const aspect = this._size.w / this._size.h;
    const zNear = 0.1;
    const zFar = 100.0;
    const projectionMatrix = mat4.create();
    // note: glmatrix.js always has the first argument
    // as the destination to receive the result.
    mat4.perspective(projectionMatrix,
                     fieldOfView,
                     aspect,
                     zNear,
                     zFar);
    
    return projectionMatrix;
  }
  
  get modelViewMatrix() {
    // Set the drawing position to the "identity" point, which is
    // the center of the scene.
    const modelViewMatrix = mat4.create();
    
    // Now move the drawing position a bit to where we want to
    // start drawing the square.
    mat4.translate(modelViewMatrix,     // destination matrix
                   modelViewMatrix,     // matrix to translate
                   [-0.0, 0.0, -1.]);  // amount to translate
    
    return modelViewMatrix;
  }
  
  static createShaderOfType(ctx, type, source) {
    const shader = ctx.createShader(type);
    ctx.shaderSource(shader, source);
    ctx.compileShader(shader);
    
    if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) {
      console.log('An error occurred compiling the shaders: ' + ctx.getShaderInfoLog(shader));
      ctx.deleteShader(shader);
      return null;
    }
    
    return shader;
  }
}

WTCGL.TYPE_INT = 0;
WTCGL.TYPE_FLOAT = 1;
WTCGL.TYPE_V2 = 2;
WTCGL.TYPE_V3 = 3;
WTCGL.TYPE_V4 = 4;

WTCGL.IMAGETYPE_REGULAR = 0;
WTCGL.IMAGETYPE_TILE = 1;
WTCGL.IMAGETYPE_MIRROR = 2;

export default WTCGL;