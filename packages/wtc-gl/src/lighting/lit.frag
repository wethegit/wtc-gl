// Prefixed with the version, defines, precision and lit-shading.glsl

in vec3 v_normal;
in vec3 v_position;
in vec2 v_uv;
#ifdef VERTEX_COLOURS
in vec3 v_colour;
#endif

uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;

uniform vec3 u_colour;
uniform float u_opacity;
uniform sampler2D u_map;
uniform float u_useMap;
uniform float u_specular;
uniform float u_shininess;
uniform float u_alphaTest;
// 1 when the renderer blends premultiplied alpha
uniform float u_premultiplied;

out vec4 fragColour;

void main() {
  vec4 c = vec4(u_colour, u_opacity);
#ifdef VERTEX_COLOURS
  c.rgb *= v_colour;
#endif
  if (u_useMap > 0.5) c *= texture(u_map, v_uv);
  if (c.a < u_alphaTest) discard;

#ifdef FLAT_SHADING
  // The face normal, from how the position changes across the triangle. It
  // always faces the camera, so back faces need no flip.
  vec3 n = normalize(cross(dFdx(v_position), dFdy(v_position)));
#else
  vec3 n = normalize(v_normal);
#ifdef DOUBLE_SIDED
  if (!gl_FrontFacing) n = -n;
#endif
#endif

  // An orthographic camera looks straight down -z everywhere
  bool orthographic = u_projectionMatrix[3][3] == 1.0;
  vec3 view = orthographic ? vec3(0.0, 0.0, 1.0) : normalize(-v_position);

  c.rgb = litShade(c.rgb, n, view, mat3(u_viewMatrix), u_specular, u_shininess);
  if (u_premultiplied > 0.5) c.rgb *= c.a;
  fragColour = c;
}
