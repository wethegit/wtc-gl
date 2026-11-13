// Prefixed with the version and defines

in vec3 position;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;

#ifdef VERTEX_COLOURS
in vec3 colour;
out vec3 v_colour;
#endif

void main() {
#ifdef VERTEX_COLOURS
  v_colour = colour;
#endif
  gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(position, 1.0);
  // Pulled a little towards the camera, so a line drawn on a surface isn't
  // hidden by it
  gl_Position.z -= 1e-4 * gl_Position.w;
}
