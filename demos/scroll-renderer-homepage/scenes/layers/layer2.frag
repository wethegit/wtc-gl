#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 colour;

const vec3 WEBGL_C = vec3(0.282, 0.980, 0.443);

float box(vec2 p, vec2 lo, vec2 hi) {
  vec2 d = min(p - lo, hi - p);
  return smoothstep(-0.003, 0.003, min(d.x, d.y));
}

void main() {
  vec2 uv = v_uv * vec2(1.0, -1.0) + vec2(0.0, 1.0);
  float inPage = box(uv, vec2(0.0), vec2(1.0));
  if (inPage < 0.01) { colour = vec4(0.0); return; }
  float g = max(
    box(uv, vec2(0.06, 0.07), vec2(0.44, 0.43)),
    box(uv, vec2(0.56, 0.57), vec2(0.94, 0.93))
  );
  colour = vec4(WEBGL_C, 1.)*g * 0.95;
}
