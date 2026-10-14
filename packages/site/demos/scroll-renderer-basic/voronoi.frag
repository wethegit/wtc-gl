#version 300 es
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;

out vec4 colour;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  uv.x   *= u_resolution.x / u_resolution.y;

  vec2 p  = uv * 5.0;
  vec2 ip = floor(p);
  vec2 fp = fract(p);

  float d1 = 9.0, d2 = 9.0;

  for (int x = -2; x <= 2; x++) {
    for (int y = -2; y <= 2; y++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash2(ip + g);
      // Animate cell centres
      o = 0.5 + 0.5 * sin(u_time * 0.5 + 6.28318 * o);
      float d = length(g + o - fp);
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) { d2 = d; }
    }
  }

  float border = d2 - d1;
  float glow   = exp(-border * 18.0) * 0.9;
  float inner  = 1.0 - smoothstep(0.0, 0.18, d1);

  vec3 dark = vec3(0.02, 0.03, 0.09);
  vec3 edge = vec3(0.25, 0.55, 1.00);
  vec3 fill = vec3(0.04, 0.05, 0.16);

  colour = vec4(dark + fill * inner + edge * glow, 1.0);
}
