#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 colour;

const vec3 TEXT_C = vec3(0.867, 0.878, 0.933);
const vec3 ELEM_C = vec3(1.000, 1.000, 1.000);

float box(vec2 p, vec2 lo, vec2 hi) {
  vec2 d = min(p - lo, hi - p);
  return smoothstep(-0.003, 0.003, min(d.x, d.y));
}

float boxBorder(vec2 p, vec2 lo, vec2 hi, float t) {
  return box(p, lo, hi) * (1.0 - box(p, lo + t, hi - t));
}

float textLines(vec2 p, vec2 lo, vec2 hi) {
  if (box(p, lo, hi) < 0.01) return 0.0;
  vec2 uv = clamp((p - lo) / max(hi - lo, vec2(0.001)), 0.0, 1.0);
  float row  = floor(uv.y * 9.0);
  float frac = fract(uv.y * 9.0);
  if (frac > 0.55 || mod(row, 2.0) > 0.5) return 0.0;
  float w = row < 0.5 ? 0.48
          : row < 2.5 ? 0.96
          : row < 4.5 ? 0.82
          : row < 6.5 ? 0.88
                      : 0.65;
  return step(uv.x, w);
}

void main() {
  vec2 uv = v_uv * vec2(1.0, -1.0) + vec2(0.0, 1.0);
  float inPage = box(uv, vec2(0.0), vec2(1.0));
  if (inPage < 0.01) { colour = vec4(0.0); return; }

  float s = 0.0;
  s = max(s, box(uv, vec2(0.47, 0.09), vec2(0.68, 0.14)));
  s = max(s, textLines(uv, vec2(0.47, 0.17), vec2(0.93, 0.42)));
  s = max(s, box(uv, vec2(0.06, 0.57), vec2(0.30, 0.62)));
  s = max(s, textLines(uv, vec2(0.06, 0.65), vec2(0.52, 0.92)));

  float d1 = boxBorder(uv, vec2(0.06, 0.07), vec2(0.44, 0.43), 0.009);
  float d2 = boxBorder(uv, vec2(0.56, 0.57), vec2(0.94, 0.93), 0.009);
  float d  = max(d1, d2);

  vec3  col = mix(TEXT_C, ELEM_C, d);
  float a   = max(s * 0.88, d * 0.82) * inPage;


  colour = vec4(col, 1)*a;
}
