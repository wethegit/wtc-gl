'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var WTCGL = function () {
  function WTCGL(el, vertexShaderSource, fragmentShaderSource, width, height) {
    _classCallCheck(this, WTCGL);

    this.run = this.run.bind(this);

    this._el = el;
    this._ctx = this._el.getContext("webgl", { alpha: true });

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

    this.initBuffers([-1.0, 1.0, -1., 1.0, 1.0, -1., -1.0, -1.0, -1., 1.0, -1.0, -1.]);

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
    };

    // Tell WebGL to use our program when drawing
    this._ctx.useProgram(this._program);

    this.resize(width, height);
  }

  _createClass(WTCGL, [{
    key: 'resize',
    value: function resize(w, h) {
      this._el.width = w * this.pxratio;
      this._el.height = h * this.pxratio;
      this._size = [w * this.pxratio, h * this.pxratio];
      this._el.style.width = w + 'px';
      this._el.style.height = h + 'px';

      this._ctx.viewportWidth = w * this.pxratio;
      this._ctx.viewportHeight = h * this.pxratio;

      this._ctx.uniform2fv(this._programInfo.uniforms.resolution, this._size);

      this.initBuffers(this._positions);
    }
  }, {
    key: 'initBuffers',
    value: function initBuffers(positions) {
      this._positions = positions;
      this._positionBuffer = this._ctx.createBuffer();

      this._ctx.bindBuffer(this._ctx.ARRAY_BUFFER, this._positionBuffer);

      this._ctx.bufferData(this._ctx.ARRAY_BUFFER, new Float32Array(positions), this._ctx.STATIC_DRAW);
    }
  }, {
    key: 'addUniform',
    value: function addUniform(name, type, value) {
      var uniform = this._programInfo.uniforms[name];
      uniform = this._ctx.getUniformLocation(this._program, 'u_' + name);
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
      }
      this._programInfo.uniforms[name] = uniform;
      return uniform;
    }
  }, {
    key: 'addTexture',
    value: function addTexture(name, type, image) {
      var textures = this.textures;
      var index = textures.length;

      var texture = this._ctx.createTexture();
      this._ctx.pixelStorei(this._ctx.UNPACK_FLIP_Y_WEBGL, true);
      this._ctx.bindTexture(this._ctx.TEXTURE_2D, texture);

      // this._ctx.generateMipmap(this._ctx.TEXTURE_2D);

      // Set the parameters based on the passed type
      if (type === WTCGL.IMAGETYPE_MIRROR) {
        this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_WRAP_S, this._ctx.MIRRORED_REPEAT);
        this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_WRAP_T, this._ctx.MIRRORED_REPEAT);
      } else if (type === WTCGL.IMAGETYPE_REGULAR) {
        this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_WRAP_S, this._ctx.CLAMP_TO_EDGE);
        this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_WRAP_T, this._ctx.CLAMP_TO_EDGE);
      }

      this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_MIN_FILTER, this._ctx.LINEAR);
      // this._ctx.texParameteri(this._ctx.TEXTURE_2D, this._ctx.TEXTURE_MAG_FILTER, this._ctx.LINEAR);

      // Upload the image into the texture.
      this._ctx.texImage2D(this._ctx.TEXTURE_2D, 0, this._ctx.RGBA, this._ctx.RGBA, this._ctx.UNSIGNED_BYTE, image);

      // add the texture to the array of textures.
      textures.push({ name: name, tex: texture });

      // Finally set the this.textures (this is just to get around the funnyness of default getters)
      this.textures = textures;

      return texture;
    }
  }, {
    key: 'updateTexture',
    value: function updateTexture(texture, image) {
      this._ctx.bindTexture(this._ctx.TEXTURE_2D, texture);
      // Upload the image into the texture.
      this._ctx.texImage2D(this._ctx.TEXTURE_2D, 0, this._ctx.RGBA, this._ctx.RGBA, this._ctx.UNSIGNED_BYTE, image);
    }
  }, {
    key: 'initTextures',
    value: function initTextures() {
      for (var i = 0; i < this.textures.length; i++) {
        var name = this.textures[i].name;
        var uniform = this._programInfo.uniforms[name];
        uniform = this._ctx.getUniformLocation(this._program, 'u_' + name);

        // Set the texture unit to the uniform
        this._ctx.uniform1i(uniform, i);

        // find the active texture based on the index
        this._ctx.activeTexture(this._ctx['TEXTURE' + i]);

        // Finally, bind the texture
        this._ctx.bindTexture(this._ctx.TEXTURE_2D, this.textures[i].tex);
      }
    }
  }, {
    key: 'run',
    value: function run(delta) {
      this.running && requestAnimationFrame(this.run);
      this.time = delta * .0002;
      this._ctx.uniform1f(this._programInfo.uniforms.time, this.time);
      this.render();
    }
  }, {
    key: 'render',
    value: function render() {
      this._ctx.viewport(0, 0, this._ctx.viewportWidth, this._ctx.viewportHeight);
      if (this.clearing) {
        this._ctx.clearColor(1.0, 0.0, 0.0, 0.0);
        // this._ctx.clearDepth(1.0);
        // this._ctx.enable(this._ctx.DEPTH_TEST);
        // this._ctx.depthFunc(this._ctx.LEQUAL);
        this._ctx.blendFunc(this._ctx.SRC_ALPHA, this._ctx.ONE_MINUS_SRC_ALPHA);

        this._ctx.clear(this._ctx.COLOR_BUFFER_BIT);
      }

      this._ctx.bindBuffer(this._ctx.ARRAY_BUFFER, this._positionBuffer);
      this._ctx.vertexAttribPointer(this._programInfo.attribs.vertexPosition, 3, this._ctx.FLOAT, false, 0, 0);
      this._ctx.enableVertexAttribArray(this._programInfo.attribs.vertexPosition);

      // Set the shader uniforms
      this.includePerspectiveMatrix && this._ctx.uniformMatrix4fv(this._programInfo.uniforms.projectionMatrix, false, this.perspectiveMatrix);
      this.includeModelViewMatrix && this._ctx.uniformMatrix4fv(this._programInfo.uniforms.modelViewMatrix, false, this.modelViewMatrix);

      this._ctx.drawArrays(this._ctx.TRIANGLE_STRIP, 0, 4);
    }
  }, {
    key: 'time',
    set: function set(value) {
      if (!isNaN(value)) {
        this._time = value;
      }
    },
    get: function get() {
      return this._time || 0;
    }
  }, {
    key: 'includePerspectiveMatrix',
    set: function set(value) {
      this._includePerspectiveMatrix = value === true;
    },
    get: function get() {
      return this._includePerspectiveMatrix === true;
    }
  }, {
    key: 'includeModelViewMatrix',
    set: function set(value) {
      this._includeModelViewMatrix = value === true;
    },
    get: function get() {
      return this._includeModelViewMatrix === true;
    }
  }, {
    key: 'textures',
    set: function set(value) {
      if (value instanceof Array) {
        this._textures = value;
      }
    },
    get: function get() {
      return this._textures || [];
    }
  }, {
    key: 'clearing',
    set: function set(value) {
      this._clearing = value === true;
    },
    get: function get() {
      return this._clearing === true;
    }
  }, {
    key: 'running',
    set: function set(value) {
      !this.running && value === true && requestAnimationFrame(this.run);
      this._running = value === true;
    },
    get: function get() {
      return this._running === true;
    }
  }, {
    key: 'pxratio',
    set: function set(value) {
      if (value > 0) this._pxratio = value;
    },
    get: function get() {
      return this._pxratio || 1;
    }
  }, {
    key: 'perspectiveMatrix',
    get: function get() {
      // Create a perspective matrix, a special matrix that is
      // used to simulate the distortion of perspective in a camera.
      // Our field of view is 45 degrees, with a width/height
      // ratio that matches the display size of the canvas
      // and we only want to see objects between 0.1 units
      // and 100 units away from the camera.
      var fieldOfView = 45 * Math.PI / 180; // in radians
      var aspect = this._size.w / this._size.h;
      var zNear = 0.1;
      var zFar = 100.0;
      var projectionMatrix = mat4.create();
      // note: glmatrix.js always has the first argument
      // as the destination to receive the result.
      mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);

      return projectionMatrix;
    }
  }, {
    key: 'modelViewMatrix',
    get: function get() {
      // Set the drawing position to the "identity" point, which is
      // the center of the scene.
      var modelViewMatrix = mat4.create();

      // Now move the drawing position a bit to where we want to
      // start drawing the square.
      mat4.translate(modelViewMatrix, // destination matrix
      modelViewMatrix, // matrix to translate
      [-0.0, 0.0, -1.]); // amount to translate

      return modelViewMatrix;
    }
  }], [{
    key: 'createShaderOfType',
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

WTCGL.IMAGETYPE_REGULAR = 0;
WTCGL.IMAGETYPE_TILE = 1;
WTCGL.IMAGETYPE_MIRROR = 2;

exports.default = WTCGL;