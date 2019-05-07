"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

/**
 * A basic Web GL class. This provides a very basic setup for GLSL shader code.
 * Currently it doesn't support anything except for clip-space 3d, but this was
 * done so that we could start writing fragments right out of the gate. My
 * Intention is to update it with particle and polygonal 3d support later on.
 *
 * @class WTCGL
 * @author Liam Egan <liam@wethecollective.com>
 * @version 0.0.10
 * @created Jan 16, 2019
 */
var WTCGL =
/*#__PURE__*/
function () {
  /**
   * The WTCGL Class constructor. If construction of the webGL context fails 
    * for any reason this will return null.
    * 
    * @TODO make the dimension properties properly optional
    * @TODO provide the ability to allow for programmable buffers
   *
   * @constructor
   * @param {HTMLElement} el The canvas element to use as the root
   * @param {string} vertexShaderSource The vertex shader source
   * @param {string} fragmentShaderSource The fragment shader source
    * @param {number} [width] The width of the webGL context. This will default to the canvas dimensions
    * @param {number} [height] The height of the webGL context. This will default to the canvas dimensions
    * @param {number} [pxratio=1] The pixel aspect ratio of the canvas
    * @param {boolean} [styleElement] A boolean indicating whether to apply a style property to the canvas (resizing the canvas by the inverse of the pixel ratio)
    * @param {boolean} [webgl2] A boolean indicating whether to try to create a webgl2 context instead of a regulart context
   */
  function WTCGL(el, vertexShaderSource, fragmentShaderSource, width, height, pxratio, styleElement, webgl2) {
    _classCallCheck(this, WTCGL);

    this.run = this.run.bind(this);

    this._onRun = function () {}; // Destructure if an object is aprovided instead a series of parameters


    if (el instanceof Object && el.el) {
      var _el = el;
      el = _el.el;
      vertexShaderSource = _el.vertexShaderSource;
      fragmentShaderSource = _el.fragmentShaderSource;
      width = _el.width;
      height = _el.height;
      pxratio = _el.pxratio;
      webgl2 = _el.webgl2;
      styleElement = _el.styleElement;
    } // If the HTML element isn't a canvas, return null


    if (!el instanceof HTMLElement || el.nodeName.toLowerCase() !== 'canvas') {
      console.log('Provided element should be a canvas element');
      return null;
    }

    this._el = el; // The context should be either webgl2, webgl or experimental-webgl

    if (webgl2 === true) {
      this._ctx = this._el.getContext("webgl2", this.webgl_params) || this._el.getContext("webgl", this.webgl_params) || this._el.getContext("experimental-webgl", this.webgl_params);
    } else {
      this._ctx = this._el.getContext("webgl", this.webgl_params) || this._el.getContext("experimental-webgl", this.webgl_params);
    } // Set up the extensions


    this._ctx.getExtension('OES_standard_derivatives');

    this._ctx.getExtension('EXT_shader_texture_lod');

    this._ctx.getExtension('OES_texture_float'); // We can't make the context so return an error


    if (!this._ctx) {
      console.log('Browser doesn\'t support WebGL ');
      return null;
    } // Create the shaders


    this._vertexShader = WTCGL.createShaderOfType(this._ctx, this._ctx.VERTEX_SHADER, vertexShaderSource);
    this._fragmentShader = WTCGL.createShaderOfType(this._ctx, this._ctx.FRAGMENT_SHADER, fragmentShaderSource); // Create the program and link the shaders

    this._program = this._ctx.createProgram();

    this._ctx.attachShader(this._program, this._vertexShader);

    this._ctx.attachShader(this._program, this._fragmentShader);

    this._ctx.linkProgram(this._program); // If we can't set up the params, this means the shaders have failed for some reason


    if (!this._ctx.getProgramParameter(this._program, this._ctx.LINK_STATUS)) {
      console.log('Unable to initialize the shader program: ' + this._ctx.getProgramInfoLog(this._program));
      return null;
    } // Initialise the vertex buffers


    this.initBuffers([-1.0, 1.0, -1., 1.0, 1.0, -1., -1.0, -1.0, -1., 1.0, -1.0, -1.]); // Initialise the frame buffers

    this.frameBuffers = []; // The program information object. This is essentially a state machine for the webGL instance

    this._programInfo = {
      attribs: {
        vertexPosition: this._ctx.getAttribLocation(this._program, 'a_position')
      },
      uniforms: {
        projectionMatrix: this._ctx.getUniformLocation(this._program, 'u_projectionMatrix'),
        modelViewMatrix: this._ctx.getUniformLocation(this._program, 'u_modelViewMatrix'),
        resolution: this._ctx.getUniformLocation(this._program, 'u_resolution'),
        time: this._ctx.getUniformLocation(this._program, 'u_time')
      }
    }; // Tell WebGL to use our program when drawing

    this._ctx.useProgram(this._program);

    this.pxratio = pxratio;
    this.styleElement = styleElement !== true;
    this.resize(width, height);
  }
  /**
   * Public methods
   */

  /**
   * Resizes the canvas to a specified width and height, respecting the pixel ratio
   *
   * @param  {number} w The width of the canvas
   * @param  {number} h The height of the canvas
   * @return {Void}
   */


  _createClass(WTCGL, [{
    key: "resize",
    value: function resize(w, h) {
      this._el.width = w * this.pxratio;
      this._el.height = h * this.pxratio;
      this._size = [w * this.pxratio, h * this.pxratio];

      if (this.styleElement) {
        this._el.style.width = w + 'px';
        this._el.style.height = h + 'px';
      }

      this._ctx.viewportWidth = w * this.pxratio;
      this._ctx.viewportHeight = h * this.pxratio;

      this._ctx.uniform2fv(this._programInfo.uniforms.resolution, this._size);

      this.initBuffers(this._positions);
    }
    /**
     * Initialise a provided vertex buffer
     *
     * @param  {array} positions The vertex positions to initialise
     * @return {Void}
     */

  }, {
    key: "initBuffers",
    value: function initBuffers(positions) {
      this._positions = positions;
      this._positionBuffer = this._ctx.createBuffer();

      this._ctx.bindBuffer(this._ctx.ARRAY_BUFFER, this._positionBuffer);

      this._ctx.bufferData(this._ctx.ARRAY_BUFFER, new Float32Array(positions), this._ctx.STATIC_DRAW);
    }
    /**
     * Add a uniform to the program. At this time the following types are supported:
      * - Float - WTCGL.TYPE_FLOAT
      * - Vector 2 - WTCGL.TYPE_V2
      * - Vector 3 - WTCGL.TYPE_V3
      * - Vector 4 - WTCGL.TYPE_V4
     *
     * @param  {string} name The name of the uniform. N.B. your name will be prepended with a `u_` in your shaders. So providing a name of `foo` here will result in a uniform named `u_foo`
     * @param  {WTCGL.UNIFORM_TYPE} type The unfiform type 
     * @param  {number|array} value The unfiform value. The type depends on the uniform type being created 
     * @return {WebGLUniformLocation} The uniform location for later reference
     */

  }, {
    key: "addUniform",
    value: function addUniform(name, type, value) {
      var uniform = this._programInfo.uniforms[name];
      uniform = this._ctx.getUniformLocation(this._program, "u_".concat(name));

      switch (type) {
        case WTCGL.TYPE_FLOAT:
          if (!isNaN(value)) this._ctx.uniform1f(uniform, value);
          break;

        case WTCGL.TYPE_V2:
          if (value instanceof Array && value.length === 2.) this._ctx.uniform2fv(uniform, value);
          break;

        case WTCGL.TYPE_V3:
          if (value instanceof Array && value.length === 3.) this._ctx.uniform3fv(uniform, value);
          break;

        case WTCGL.TYPE_V4:
          if (value instanceof Array && value.length === 4.) this._ctx.uniform4fv(uniform, value);
          break;

        case WTCGL.TYPE_BOOL:
          if (!isNaN(value)) this._ctx.uniform1i(uniform, value);
          break;
      }

      this._programInfo.uniforms[name] = uniform;
      return uniform;
    }
    /**
     * Adds a texture to the program and links it to a named uniform. Providing the type changes the tiling properties of the texture. Possible values for type:
     * - WTCGL.IMAGETYPE_REGULAR - No tiling, clamp to edges and doesn't need to be power of 2.
     * - WTCGL.IMAGETYPE_TILE - full x and y tiling, needs to be power of 2.
     * - WTCGL.IMAGETYPE_MIRROR - mirror tiling, needs to be power of 2.
     *
     * @public
    * @param  {string} name The name of the uniform. N.B. your name will be prepended with a `u_` in your shaders. So providing a name of `foo` here will result in a uniform named `u_foo`
     * @param  {WTCGL.TYPE_IMAGETYPE} type The type of texture to create. This is basically the tiling behaviour of the texture as described above
    * @param  {Image} image The image object to add to the texture
     * @return {WebGLTexture} The texture object
     */

  }, {
    key: "addTexture",
    value: function addTexture(name, type, image) {
      var liveUpdate = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

      var texture = this._ctx.createTexture();

      this._ctx.pixelStorei(this._ctx.UNPACK_FLIP_Y_WEBGL, true);

      this._ctx.bindTexture(this._ctx.TEXTURE_2D, texture); // this._ctx.generateMipmap(this._ctx.TEXTURE_2D);
      // Set the parameters based on the passed type


      if (type === WTCGL.IMAGETYPE_MIRROR) {
        this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_WRAP_S, this._ctx.MIRRORED_REPEAT);

        this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_WRAP_T, this._ctx.MIRRORED_REPEAT);
      } else if (type === WTCGL.IMAGETYPE_REGULAR) {
        this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_WRAP_S, this._ctx.CLAMP_TO_EDGE);

        this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_WRAP_T, this._ctx.CLAMP_TO_EDGE);
      }

      this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_MIN_FILTER, this._ctx.LINEAR); // this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_MAG_FILTER, this._ctx.LINEAR);
      // Upload the image into the texture.


      this._ctx.texImage2D(this._ctx.TEXTURE_2D, 0, this._ctx.RGBA, this._ctx.RGBA, this._ctx.UNSIGNED_BYTE, image); // add the texture to the array of textures.


      this.pushTexture(name, texture, image, this._ctx.TEXTURE_2D, liveUpdate);
      return texture;
    }
    /**
     * Pushes a texture into the texture stack. This is here so we can 
      * add textures externally, if necessary.
     *
     * @param  {String} name The name of the texture
     * @param  {WebGLTexture} texture The texture location
     * @param  {Mixed} image The image object to be used to render the texture sampler
     * @param  {WebGLTarget} target The target texture type
     * @param  {Bool} liveUpdate The flag that determines whether the texture needs to be live updated (updated every frame)
     * @return {Void}
     */

  }, {
    key: "pushTexture",
    value: function pushTexture(name, texture, image, target) {
      var liveUpdate = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : false;
      var textures = this.textures;
      textures.push({
        name: name,
        tex: texture,
        liveUpdate: liveUpdate,
        image: image,
        target: target
      }); // Finally set the this.textures (this is just to get around the funnyness of default getters)

      this.textures = textures;
    }
    /**
     * Adds a framebuffer object to the webGL context for use later
     * by an extenal process. This method returns an object 
     * containing useful propertues and objects in the form of:
     * {
     *    {Number} w - The width of the frame buffer
     *    {Number} h - The height of the frame buffee
     *    {WebGLFrameBuffer} fb - the frame buffer object for use in binding the buffer
     *    {WebGLTexture} frameTexture - the texture object for use in binding the buffer to a uniform
     * }
     *
     * @public
    * @param  {Number} w The width of the frame buffer
     * @param  {Number} h The height o fthe frame buffer
     * @return {Object} A general object representing the added frame buffer
     */

  }, {
    key: "addFrameBuffer",
    value: function addFrameBuffer(w, h) {
      // create to render to
      var gl = this._ctx;
      var targetTextureWidth = w * this.pxratio;
      var targetTextureHeight = h * this.pxratio;
      var targetTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, targetTexture);
      {
        // define size and format of level 0
        var _level = 0;
        var internalFormat = gl.RGBA;
        var border = 0;
        var format = gl.RGBA;
        var type = gl.UNSIGNED_BYTE;
        var data = null;
        gl.texImage2D(gl.TEXTURE_2D, _level, internalFormat, targetTextureWidth, targetTextureHeight, border, format, type, data); // set the filtering so we don't need mips

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      } // Create and bind the framebuffer

      var fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); // attach the texture as the first color attachment

      var attachmentPoint = gl.COLOR_ATTACHMENT0;
      var level = 0;
      gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, targetTexture, level);
      return {
        w: w * this.pxratio,
        h: h * this.pxratio,
        fb: fb,
        frameTexture: targetTexture
      };
    }
    /**
     * Updates a texture location for a given WebGLTexture with an image
     *
     * @param  {WebGLTexture} texture The texture location to update
     * @param  {Image} image The image object to add to the texture
     * @return {Void}
     */

  }, {
    key: "updateTexture",
    value: function updateTexture(texture, image) {
      this._ctx.bindTexture(this._ctx.TEXTURE_2D, texture); // Upload the image into the texture.


      this._ctx.texImage2D(this._ctx.TEXTURE_2D, 0, this._ctx.RGBA, this._ctx.RGBA, this._ctx.UNSIGNED_BYTE, image);
    }
    /**
     * Initialise texture locations in the program
     *
     * @return {Void}
     */

  }, {
    key: "initTextures",
    value: function initTextures() {
      for (var i = 0; i < this.textures.length; i++) {
        var name = this.textures[i].name;
        var uniform = this._programInfo.uniforms[name];
        uniform = this._ctx.getUniformLocation(this._program, "u_".concat(name)); // Set the texture unit to the uniform

        this._ctx.uniform1i(uniform, i); // find the active texture based on the index


        this._ctx.activeTexture(this._ctx["TEXTURE".concat(i)]); // Finally, bind the texture


        this._ctx.bindTexture(this.textures[i].target, this.textures[i].tex);
      }
    }
    /**
     * The run loop. This function is run as a part of a RaF and updates the internal
      * time uniform (`u_time`).
     *
      * @param  {number} delta The delta time provided by the RaF loop
     * @return {Void}
     */

  }, {
    key: "run",
    value: function run(delta) {
      this.running && requestAnimationFrame(this.run);
      this.time = this.startTime + delta * .0002;
      this.onRun(delta);
      this.render();
    }
    /**
     * Render the program
     *
      * @param  {object} buffer The frame buffer object to render to
     * @return {Void}
     */

  }, {
    key: "render",
    value: function render() {
      var _this = this;

      var buffer = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

      // bind either to the provided buffer or null (screen)
      this._ctx.bindFramebuffer(this._ctx.FRAMEBUFFER, buffer.fb || null); // Update the time uniform


      this._ctx.uniform1f(this._programInfo.uniforms.time, this.time); // Check for and update live textures


      this.textures.forEach(function (textureInfo) {
        if (textureInfo.liveUpdate === true) {
          _this.updateTexture(textureInfo.tex, textureInfo.image);
        }
      });

      this._ctx.viewport(0, 0, buffer.w || this._ctx.viewportWidth, buffer.h || this._ctx.viewportHeight);

      if (this.clearing) {
        this._ctx.clearColor(1.0, 0.0, 0.0, 0.0); // this._ctx.clearDepth(1.0);
        // this._ctx.enable(this._ctx.DEPTH_TEST);
        // this._ctx.depthFunc(this._ctx.LEQUAL);


        this._ctx.blendFunc(this._ctx.SRC_ALPHA, this._ctx.ONE_MINUS_SRC_ALPHA);

        this._ctx.clear(this._ctx.COLOR_BUFFER_BIT);
      }

      this._ctx.bindBuffer(this._ctx.ARRAY_BUFFER, this._positionBuffer);

      this._ctx.vertexAttribPointer(this._programInfo.attribs.vertexPosition, 3, this._ctx.FLOAT, false, 0, 0);

      this._ctx.enableVertexAttribArray(this._programInfo.attribs.vertexPosition); // Set the shader uniforms


      this.includePerspectiveMatrix && this._ctx.uniformMatrix4fv(this._programInfo.uniforms.projectionMatrix, false, this.perspectiveMatrix);
      this.includeModelViewMatrix && this._ctx.uniformMatrix4fv(this._programInfo.uniforms.modelViewMatrix, false, this.modelViewMatrix);

      this._ctx.drawArrays(this._ctx.TRIANGLE_STRIP, 0, 4);
    }
    /**
     * Getters and setters
     */

    /**
     * The default webGL parameters to be used for the program.
     * This is read only and should only be overridden as a part of a subclass.
     *
     * @readonly
     * @type {object}
     * @default { alpha: true }
     */

  }, {
    key: "webgl_params",
    get: function get() {
      return {
        alpha: true
      };
    }
    /**
     * (getter/setter) Whether the element should include styling as a part of
     * its rendition.
     *
     * @type {boolean}
     * @default true
     */

  }, {
    key: "styleElement",
    set: function set(value) {
      this._styleElement = value === true;

      if (this._styleElement === false && this._el) {
        this._el.style.width = '';
        this._el.style.height = '';
      }
    },
    get: function get() {
      return this._styleElement !== false;
    }
    /**
     * (getter/setter) startTime. This is a value to begin the `u_time` 
     * unform at. This is here in case you want `u_time` to begin at a 
     * specific value other than 0.
     *
     * @type {number}
     * @default 0
     */

  }, {
    key: "startTime",
    set: function set(value) {
      if (!isNaN(value)) {
        this._startTime = value;
      }
    },
    get: function get() {
      return this._startTime || 0;
    }
    /**
     * (getter/setter) time. This is the time that the program currently
     * sits at. By default this value is set as a part of the run loop
     * however this is a public property so that we can specify time
     * for rendition outside of the run loop.
     *
     * @type {number}
     * @default 0
     */

  }, {
    key: "time",
    set: function set(value) {
      if (!isNaN(value)) {
        this._time = value;
      }
    },
    get: function get() {
      return this._time || 0;
    }
    /**
     * (getter/setter) includePerspectiveMatrix. This determines whether the 
     * perspecive matrix is included in the program. This doesn't really make
     * a difference right now, but this is here to provide future interoperability.
     *
     * @type {boolean}
     * @default false
     */

  }, {
    key: "includePerspectiveMatrix",
    set: function set(value) {
      this._includePerspectiveMatrix = value === true;
    },
    get: function get() {
      return this._includePerspectiveMatrix === true;
    }
    /**
     * (getter/setter) includeModelViewMatrix. This determines whether the 
     * model view matrix is included in the program. This doesn't really make
     * a difference right now, but this is here to provide future interoperability.
     *
     * @type {boolean}
     * @default false
     */

  }, {
    key: "includeModelViewMatrix",
    set: function set(value) {
      this._includeModelViewMatrix = value === true;
    },
    get: function get() {
      return this._includeModelViewMatrix === true;
    }
    /**
     * (getter/setter) textures. The array of textures to initialise into the program.
     *
     * @private
     * @type {array}
     * @default []
     */

  }, {
    key: "textures",
    set: function set(value) {
      if (value instanceof Array) {
        this._textures = value;
      }
    },
    get: function get() {
      return this._textures || [];
    }
    /**
     * (getter/setter) clearing. Specifies whether the program should clear the screen 
     * before drawing anew.
     *
     * @type {boolean}
     * @default false
     */

  }, {
    key: "clearing",
    set: function set(value) {
      this._clearing = value === true;
    },
    get: function get() {
      return this._clearing === true;
    }
    /**
     * (getter/setter) running. Specifies whether the programming is running. Setting 
     * this to true will create a RaF loop which will call the run function.
     *
     * @type {boolean}
     * @default false
     */

  }, {
    key: "running",
    set: function set(value) {
      !this.running && value === true && requestAnimationFrame(this.run);
      this._running = value === true;
    },
    get: function get() {
      return this._running === true;
    }
    /**
     * (getter/setter) pxratio. The 1-dimensional pixel ratio of the application.
     * This should be used either for making a program look good on high density
     * screens or for raming down pixel density for performance.
     *
     * @type {number}
     * @default 1
     */

  }, {
    key: "pxratio",
    set: function set(value) {
      if (value > 0) this._pxratio = value;
    },
    get: function get() {
      return this._pxratio || 1;
    }
    /**
     * (getter/setter) onRun. A method that runs on every frame render. We can use
     * this to run external bits every frame like updating uniforms etc.
     *
     * @type {number}
     * @default 1
     */

  }, {
    key: "onRun",
    set: function set(runMethod) {
      if (typeof runMethod == 'function') {
        this._onRun = runMethod.bind(this);
      }
    },
    get: function get() {
      return this._onRun;
    }
    /**
     * (getter/setter) perspectiveMatrix. Calculate a perspective matrix, a 
     * special matrix that is used to simulate the distortion of perspective in 
     * a camera. Our field of view is 45 degrees, with a width/height ratio 
     * that matches the display size of the canvas and we only want to see 
     * objects between 0.1 units and 100 units away from the camera.
     *
     * @readonly
     * @type {mat4}
     */

  }, {
    key: "perspectiveMatrix",
    get: function get() {
      var fieldOfView = 45 * Math.PI / 180; // in radians

      var aspect = this._size.w / this._size.h;
      var zNear = 0.1;
      var zFar = 100.0;
      var projectionMatrix = mat4.create(); // note: glmatrix.js always has the first argument
      // as the destination to receive the result.

      mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);
      return projectionMatrix;
    }
    /**
     * (getter/setter) perspectiveMatrix. Calculate a model view matrix.
     *
     * @readonly
     * @type {mat4}
     */

  }, {
    key: "modelViewMatrix",
    get: function get() {
      // Set the drawing position to the "identity" point, which is
      // the center of the scene.
      var modelViewMatrix = mat4.create(); // Now move the drawing position a bit to where we want to
      // start drawing the square.

      mat4.translate(modelViewMatrix, // destination matrix
      modelViewMatrix, // matrix to translate
      [-0.0, 0.0, -1.]); // amount to translate

      return modelViewMatrix;
    }
    /**
     * (getter/setter) context. Return the webgl context object
     *
     * @readonly
     * @type {WebGLContext}
     */

  }, {
    key: "context",
    get: function get() {
      return this._ctx || null;
    }
    /**
     * Static Methods
     */

    /**
     * Create a shader of a given type given a context, type and source.
     *
      * @static
     * @param  {WebGLContext} ctx The context under which to create the shader
     * @param  {WebGLShaderType} type The shader type, vertex or fragment
     * @param  {string} source The shader source.
     * @return {WebGLShader} The created shader
     */

  }], [{
    key: "createShaderOfType",
    value: function createShaderOfType(ctx, type, source) {
      var shader = ctx.createShader(type);
      ctx.shaderSource(shader, source);
      ctx.compileShader(shader);

      if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) {
        console.log('An error occurred compiling the shaders: ' + ctx.getShaderInfoLog(shader));
        ctx.deleteShader(shader);
        return null;
      }

      return shader;
    }
  }]);

  return WTCGL;
}();

WTCGL.TYPE_INT = 0;
WTCGL.TYPE_FLOAT = 1;
WTCGL.TYPE_V2 = 2;
WTCGL.TYPE_V3 = 3;
WTCGL.TYPE_V4 = 4;
WTCGL.TYPE_BOOL = 5;
WTCGL.IMAGETYPE_REGULAR = 0;
WTCGL.IMAGETYPE_TILE = 1;
WTCGL.IMAGETYPE_MIRROR = 2;
var _default = WTCGL;
exports.default = _default;