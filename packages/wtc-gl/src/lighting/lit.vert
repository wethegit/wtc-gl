// Prefixed with the version and defines

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;

// View space
out vec3 v_normal;
out vec3 v_position;
out vec2 v_uv;

#ifdef VERTEX_COLOURS
in vec3 colour;
out vec3 v_colour;
#endif

void main() {
  vec4 viewPosition = u_modelViewMatrix * vec4(position, 1.0);
  v_position = viewPosition.xyz;
  v_normal = u_normalMatrix * normal;
  v_uv = uv;
#ifdef VERTEX_COLOURS
  v_colour = colour;
#endif
  gl_Position = u_projectionMatrix * viewPosition;
}
