// Prefixed with the version and defines

in vec3 position;
in vec3 normal;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;

#ifdef INSTANCED
// From InstancedMesh
in mat4 instanceMatrix;
in vec3 instanceColour;
#endif

// View space
out vec3 v_normal;
out vec3 v_position;

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
  vec4 p = u_modelViewMatrix * local;
  v_position = p.xyz;
  v_normal = u_normalMatrix * localNormal;
  gl_Position = u_projectionMatrix * p;
}
