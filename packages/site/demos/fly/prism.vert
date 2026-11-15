#version 300 es
// Each prism through its instance matrix, then the chunk's model-view
in vec3 position;
in mat4 instanceMatrix;
in vec3 instanceColour;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;

out vec3 v_position;
out vec3 v_colour;

void main() {
  vec4 view = u_modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  v_position = view.xyz;
  v_colour = instanceColour;
  gl_Position = u_projectionMatrix * view;
}
