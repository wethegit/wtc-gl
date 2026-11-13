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

#ifdef INSTANCED
// From InstancedMesh
in mat4 instanceMatrix;
in vec3 instanceColour;
out vec3 v_instanceColour;
#endif

void main() {
  vec4 local = vec4(position, 1.0);
  vec3 localNormal = normal;
#ifdef INSTANCED
  local = instanceMatrix * local;
  // Divided by each axis's squared scale before rotating, which is the
  // inverse transpose for a rotation and scale without a matrix inverse
  mat3 im = mat3(instanceMatrix);
  localNormal = im * (normal / vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2])));
#endif
  vec4 viewPosition = u_modelViewMatrix * local;
  v_position = viewPosition.xyz;
  v_normal = u_normalMatrix * localNormal;
  v_uv = uv;
#ifdef VERTEX_COLOURS
  v_colour = colour;
#endif
#ifdef INSTANCED
  v_instanceColour = instanceColour;
#endif
  gl_Position = u_projectionMatrix * viewPosition;
}
