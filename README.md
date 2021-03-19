# [wtc-gl](https://github.com/wethegit/wtc-gl#readme) *0.2.0*

> ES6 Web GL library for 2D(ish) work.


### src/wtc-gl.js


#### new WTCGL() 

A basic Web GL class. This provides a very basic setup for GLSL shader code.
Currently it doesn't support anything except for clip-space 3d, but this was
done so that we could start writing fragments right out of the gate. My
Intention is to update it with particle and polygonal 3d support later on.






##### Returns


- `Void`



#### WTCGL.constructor(el, vertexShaderSource, fragmentShaderSource[, width, height, pxratio&#x3D;1, styleElement, webgl2]) 

The WTCGL Class constructor. If construction of the webGL context fails
for any reason this will return null.




##### Parameters

| Name | Type | Description |  |
| ---- | ---- | ----------- | -------- |
| el | `HTMLElement`  | The canvas element to use as the root | &nbsp; |
| vertexShaderSource | `string`  | The vertex shader source | &nbsp; |
| fragmentShaderSource | `string`  | The fragment shader source | &nbsp; |
| width | `number`  | The width of the webGL context. This will default to the canvas dimensions | *Optional* |
| height | `number`  | The height of the webGL context. This will default to the canvas dimensions | *Optional* |
| pxratio&#x3D;1 | `number`  | The pixel aspect ratio of the canvas | *Optional* |
| styleElement | `boolean`  | A boolean indicating whether to apply a style property to the canvas (resizing the canvas by the inverse of the pixel ratio) | *Optional* |
| webgl2 | `boolean`  | A boolean indicating whether to try to create a webgl2 context instead of a regulart context | *Optional* |




##### Returns


- `Void`



#### WTCGL.addFrameBuffer() 

Public methods






##### Returns


- `Void`



#### WTCGL.resize(w, h) 

Resizes the canvas to a specified width and height, respecting the pixel ratio




##### Parameters

| Name | Type | Description |  |
| ---- | ---- | ----------- | -------- |
| w | `number`  | The width of the canvas | &nbsp; |
| h | `number`  | The height of the canvas | &nbsp; |




##### Returns


- `Void`  



#### WTCGL.initBuffers(positions) 

Initialise a provided vertex buffer




##### Parameters

| Name | Type | Description |  |
| ---- | ---- | ----------- | -------- |
| positions | `array`  | The vertex positions to initialise | &nbsp; |




##### Returns


- `Void`  



#### WTCGL.addUniform(name, type, value) 

Add a uniform to the program. At this time the following types are supported:
- Float - WTCGL.TYPE_FLOAT
- Vector 2 - WTCGL.TYPE_V2
- Vector 3 - WTCGL.TYPE_V3
- Vector 4 - WTCGL.TYPE_V4




##### Parameters

| Name | Type | Description |  |
| ---- | ---- | ----------- | -------- |
| name | `string`  | The name of the uniform. N.B. your name will be prepended with a `u_` in your shaders. So providing a name of `foo` here will result in a uniform named `u_foo` | &nbsp; |
| type | `WTCGL.UNIFORM_TYPE`  | The unfiform type | &nbsp; |
| value | `number` `array`  | The unfiform value. The type depends on the uniform type being created | &nbsp; |




##### Returns


- `WebGLUniformLocation`  The uniform location for later reference



#### WTCGL.addTexture(name, type, image) 

Adds a texture to the program and links it to a named uniform. Providing the type changes the tiling properties of the texture. Possible values for type:
- WTCGL.IMAGETYPE_REGULAR - No tiling, clamp to edges and doesn't need to be power of 2.
- WTCGL.IMAGETYPE_TILE - full x and y tiling, needs to be power of 2.
- WTCGL.IMAGETYPE_MIRROR - mirror tiling, needs to be power of 2.




##### Parameters

| Name | Type | Description |  |
| ---- | ---- | ----------- | -------- |
| name | `string`  | The name of the uniform. N.B. your name will be prepended with a `u_` in your shaders. So providing a name of `foo` here will result in a uniform named `u_foo` | &nbsp; |
| type | `WTCGL.TYPE_IMAGETYPE`  | The type of texture to create. This is basically the tiling behaviour of the texture as described above | &nbsp; |
| image | `Image`  | The image object to add to the texture | &nbsp; |




##### Returns


- `WebGLTexture`  The texture object



#### WTCGL.updateTexture(texture, image) 

Updates a texture location for a given WebGLTexture with an image




##### Parameters

| Name | Type | Description |  |
| ---- | ---- | ----------- | -------- |
| texture | `WebGLTexture`  | The texture location to update | &nbsp; |
| image | `Image`  | The image object to add to the texture | &nbsp; |




##### Returns


- `Void`  



#### WTCGL.initTextures() 

Initialise texture locations in the program






##### Returns


- `Void`  



#### WTCGL.run(delta) 

The run loop. This function is run as a part of a RaF and updates the internal
time uniform (`u_time`).




##### Parameters

| Name | Type | Description |  |
| ---- | ---- | ----------- | -------- |
| delta | `number`  | The delta time provided by the RaF loop | &nbsp; |




##### Returns


- `Void`  



#### WTCGL.render() 

Render the program






##### Returns


- `Void`  



#### WTCGL.webgl_params() 

The default webGL parameters to be used for the program.
This is read only and should only be overridden as a part of a subclass.






##### Returns


- `Void`



#### WTCGL.styleElement() 

(getter/setter) Whether the element should include styling as a part of
its rendition.






##### Returns


- `Void`



#### WTCGL.startTime() 

(getter/setter) startTime. This is a value to begin the `u_time`
unform at. This is here in case you want `u_time` to begin at a
specific value other than 0.






##### Returns


- `Void`



#### WTCGL.time() 

(getter/setter) time. This is the time that the program currently
sits at. By default this value is set as a part of the run loop
however this is a public property so that we can specify time
for rendition outside of the run loop.






##### Returns


- `Void`



#### WTCGL.includePerspectiveMatrix() 

(getter/setter) includePerspectiveMatrix. This determines whether the
perspecive matrix is included in the program. This doesn't really make
a difference right now, but this is here to provide future interoperability.






##### Returns


- `Void`



#### WTCGL.includeModelViewMatrix() 

(getter/setter) includeModelViewMatrix. This determines whether the
model view matrix is included in the program. This doesn't really make
a difference right now, but this is here to provide future interoperability.






##### Returns


- `Void`



#### WTCGL.textures()  *private method*

(getter/setter) textures. The array of textures to initialise into the program.






##### Returns


- `Void`



#### WTCGL.clearing() 

(getter/setter) clearing. Specifies whether the program should clear the screen
before drawing anew.






##### Returns


- `Void`



#### WTCGL.running() 

(getter/setter) running. Specifies whether the programming is running. Setting
this to true will create a RaF loop which will call the run function.






##### Returns


- `Void`



#### WTCGL.pxratio() 

(getter/setter) pxratio. The 1-dimensional pixel ratio of the application.
This should be used either for making a program look good on high density
screens or for raming down pixel density for performance.






##### Returns


- `Void`



#### WTCGL.perspectiveMatrix() 

(getter/setter) perspectiveMatrix. Calculate a perspective matrix, a
special matrix that is used to simulate the distortion of perspective in
a camera. Our field of view is 45 degrees, with a width/height ratio
that matches the display size of the canvas and we only want to see
objects between 0.1 units and 100 units away from the camera.






##### Returns


- `Void`



#### WTCGL.modelViewMatrix() 

(getter/setter) perspectiveMatrix. Calculate a model view matrix.






##### Returns


- `Void`



#### WTCGL.createShaderOfType(ctx, type, source) 

Create a shader of a given type given a context, type and source.




##### Parameters

| Name | Type | Description |  |
| ---- | ---- | ----------- | -------- |
| ctx | `WebGLContext`  | The context under which to create the shader | &nbsp; |
| type | `WebGLShaderType`  | The shader type, vertex or fragment | &nbsp; |
| source | `string`  | The shader source. | &nbsp; |




##### Returns


- `WebGLShader`  The created shader




*Documentation generated with [doxdox](https://github.com/neogeek/doxdox).*
