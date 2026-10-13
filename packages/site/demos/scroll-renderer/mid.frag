#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec4 u_origin;

out vec4 colour;

void main() {
  vec2 center = u_origin.xy + 0.5 * u_resolution;
  vec2 uv = (gl_FragCoord.xy - center) / min(u_resolution.x, u_resolution.y);

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  float rings  = sin(r * 18.0 - u_time * 160.0) * 0.5 + 0.5;
  float spokes = sin(a * 8.0  + u_time *  80.0) * 0.5 + 0.5;
  // Inscribed circle — radius 0.5 exactly fits the shorter element dimension
  float mask   = smoothstep(0.5, 0.48, r);

  vec3 colA = vec3(0.1, 0.3, 0.9);
  vec3 colB = vec3(0.9, 0.2, 0.5);
  vec3 col  = mix(colA, colB, rings * 0.6 + spokes * 0.4);

  colour = vec4(col, mask);
}
