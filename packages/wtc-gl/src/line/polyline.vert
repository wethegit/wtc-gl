// Prefixed with the version, defines and, for BILLBOARD, polyline-extrude.glsl

in vec3 position;
in vec3 prev;
in vec3 next;
in float side;
in float width;
in float lineDistance;
in float lineU;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform float u_width;

#ifdef BILLBOARD
uniform vec2 u_resolution;
uniform float u_sizeAttenuation;
uniform float u_miterLimit;
#else
// The width direction, already lengthened at corners, and the face normal
in vec3 across;
in vec3 normal;
uniform mat3 u_normalMatrix;
out vec3 v_normal;
#endif

out float v_distance;
out float v_u;
out float v_side;

void main() {
  v_distance = lineDistance;
  v_u = lineU;
  v_side = side;

#ifdef BILLBOARD
  gl_Position = polylineExtrude(
    u_projectionMatrix,
    u_modelViewMatrix,
    position,
    prev,
    next,
    side,
    width * u_width,
    u_resolution,
    u_sizeAttenuation > 0.5,
    u_miterLimit
  );
#else
  v_normal = normalize(u_normalMatrix * normal);
  vec3 p = position + across * side * width * u_width * 0.5;
  gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(p, 1.0);
#endif
}
