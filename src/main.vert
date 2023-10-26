#version 300 es

in vec3 position;
in vec2 uv;
out vec2 v_uv;

void main() {
  gl_Position = vec4(position, 1.0);
  v_uv = uv;
}