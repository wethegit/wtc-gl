// Prefixed with the version and defines

precision highp float;

in vec3 v_normal;
in vec3 v_position;

uniform mat4 u_viewMatrix;

out vec4 fragColour;

void main() {
#ifdef FLAT_SHADING
  // The face normal, which always faces the camera
  vec3 n = normalize(cross(dFdx(v_position), dFdy(v_position)));
#else
  vec3 n = normalize(v_normal);
#ifdef DOUBLE_SIDED
  if (!gl_FrontFacing) n = -n;
#endif
#endif

#ifdef WORLD_SPACE
  // The view matrix only rotates directions, so its transpose undoes it
  n = transpose(mat3(u_viewMatrix)) * n;
#endif

  fragColour = vec4(n * 0.5 + 0.5, 1.0);
}
