#version 300 es
precision highp float;

uniform vec2 u_resolution;
// The world's three sky colours: centre, warm corner and cool corner
uniform vec3 u_bgA;
uniform vec3 u_bgB;
uniform vec3 u_bgC;

out vec4 colour;

// A diagonal three-colour gradient with a soft glow in the middle, from the
// manifold mandala
void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / u_resolution;
  vec2 q = (px - 0.5 * u_resolution) / u_resolution.y;
  vec3 c = mix(
    u_bgA,
    u_bgB,
    smoothstep(0.2, 1.1, (1.0 - uv.x) * 0.7 + uv.y * 0.6)
  );
  c = mix(
    c,
    u_bgC,
    smoothstep(0.35, 1.2, uv.x * 0.5 + (1.0 - uv.y) * 0.9) * 0.7
  );
  c += vec3(exp(-length(q) * 4.5) * 0.35);
  colour = vec4(c, 1.0);
}
