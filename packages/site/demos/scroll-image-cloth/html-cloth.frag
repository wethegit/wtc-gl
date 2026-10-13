#version 300 es
precision highp float;

uniform sampler2D u_html;
uniform vec2 u_resolution;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec4 col = texture(u_html, v_uv);

  // Fold shading via UV screen-space Jacobian — same as cloth.frag.
  vec2 dx = dFdx(v_uv);
  vec2 dy = dFdy(v_uv);
  float jac = abs(dx.x * dy.y - dx.y * dy.x);
  float expected = 1.0 / max(u_resolution.x * u_resolution.y, 1.0);
  float compression = jac / max(expected, 1e-12);
  float fold = 1.0 - smoothstep(1.0, 4.0, compression) * 0.45;

  fragColor = vec4(col.rgb * fold, col.a);
}
