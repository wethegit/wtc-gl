# [wtc-gl](https://github.com/wethegit/wtc-gl#readme) _1.0.0_

ES6 Web GL library for simple WebGL work. Much of this 1.0 version has been addapted from and inspired by OGL.

## To-dos

### Program

- upload empty texture if null ? maybe not
- upload identity matrix if null ?
- sampler Cube

### Renderer

- Handle context loss https://www.khronos.org/webgl/wiki/HandlingContextLost

### Render Target

- multi target rendering
- test stencil and depth
- destroy

### Texture

- delete texture
- use texSubImage2D for updates (video or when loaded)
- need? encoding = linearEncoding
- support non-compressed mipmaps uploads

### Geometry

- fit in transform feedback
- when would I disableVertexAttribArray ?
- use offset/stride if exists
