precision highp float;

uniform float u_time;
uniform vec2 u_mouse;

varying vec2 v_uv;

void main() {
  float t = u_time * 20.0;

  // Mouse is in CSS px from the element centre; squash it into a small phase
  // offset so dragging visibly bends the bands.
  vec2 m = u_mouse * 0.01;

  float waves = sin(v_uv.x * 12.0 + t + m.x) * 0.5 +
    sin((v_uv.y + m.y * 0.1) * 9.0 - t * 1.3) * 0.5;
  float bands = smoothstep(-0.2, 0.2, sin(waves * 3.14159));

  vec3 a = vec3(0.08, 0.12, 0.30);
  vec3 b = vec3(0.35, 0.80, 0.95);
  vec3 color = mix(a, b, bands);

  gl_FragColor = vec4(color, 1.0);
}
