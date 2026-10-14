#version 300 es
in vec3 position;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;

void main() {
  gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(position, 1.0);
}
