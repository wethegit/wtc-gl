// Prefixed with the version and defines

precision highp float;

uniform vec3 u_colour;
uniform float u_opacity;
// 1 when the renderer blends premultiplied alpha
uniform float u_premultiplied;

#ifdef VERTEX_COLOURS
in vec3 v_colour;
#endif

out vec4 fragColour;

void main() {
  vec4 c = vec4(u_colour, u_opacity);
#ifdef VERTEX_COLOURS
  c.rgb *= v_colour;
#endif
  if (u_premultiplied > 0.5) c.rgb *= c.a;
  fragColour = c;
}
