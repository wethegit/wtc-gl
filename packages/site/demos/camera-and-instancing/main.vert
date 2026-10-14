#version 300 es
in vec3 position;
in vec3 colour;
in vec2 uv;
in vec3 normal;
in mat4 transformation;
uniform mat4 u_viewMatrix;
uniform mat4 u_modelMatrix;
uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;
out vec2 v_uv;
out vec3 v_n;
out vec3 v_pos;
out vec3 v_c;
  
void main() {
  v_n = normalize(u_normalMatrix * normal);
  v_uv = uv;
  vec4 camPos = u_projectionMatrix * u_modelViewMatrix * (transformation * vec4(position, 1.0));

  gl_Position = camPos;

  v_pos = (u_modelMatrix * vec4(position, 1.0)).xyz;

  v_c = colour;
}