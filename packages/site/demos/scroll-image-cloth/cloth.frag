#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform vec2 u_resolution;

in vec2 v_uv;

out vec4 fragColor;

void main() {
  vec4 col = texture(u_image, v_uv);

  // Estimate cloth compression via UV screen-space Jacobian.
  // When the cloth is flat, Jacobian ≈ 1 / (width_px × height_px).
  // Compressed regions (creases, folds) have a proportionally larger value.
  vec2 dx = dFdx(v_uv);
  vec2 dy = dFdy(v_uv);
  float jac = abs(dx.x * dy.y - dx.y * dy.x);
  float expectedJac = 1.0 / max(u_resolution.x * u_resolution.y, 1.0);
  float compression = jac / max(expectedJac, 1e-12);

  // Darken folds: flat cloth (ratio 1) is unaffected; heavy folds (ratio 4+) darken by ~45%.
  float fold = 1.0 - smoothstep(1.0, 4.0, compression) * 0.45;

  fragColor = vec4(col.rgb * fold, col.a);
}
