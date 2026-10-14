#version 300 es
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
// u_origin.xy — element bottom-left in physical pixels (gl_FragCoord space)
// u_origin.zw — element centre in canvas NDC (unused here)
uniform vec4  u_origin;

out vec4 colour;

void main() {
  vec2 centre = u_origin.xy + u_resolution * 0.5;
  vec2 uv     = (gl_FragCoord.xy - centre) / min(u_resolution.x, u_resolution.y);

  vec2 p = vec2(length(uv), atan(uv.y, uv.x));

  float rings  = sin(p.x * 22.0 - u_time * 130.0) * 0.5 + 0.5;
  rings       += (sin(p.x * 11.0 - u_time * 65.0) * 0.5 + 0.5) * 0.4;
  rings       /= 1.4;
  float spokes = sin(p.y * 7.0 + u_time * 45.0) * 0.5 + 0.5;

  float mask = smoothstep(0.42, 0.41, p.x+spokes*.03);
  float fade = smoothstep(0.0, 0.05, p.x);

  vec3 colA = vec3(0.45, 0.10, 0.85);
  vec3 colB = vec3(0.10, 0.50, 0.90);
  vec3 col  = mix(colA, colB, rings * 0.65 + spokes * 0.35);

  colour = vec4(col, 1) * mask * fade * (0.75 + rings * 0.25);
}
