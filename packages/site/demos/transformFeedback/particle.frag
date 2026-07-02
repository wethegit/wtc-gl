#version 300 es
precision highp float;

in float v_life;
out vec4 color;

void main() {
  vec2 uv = gl_PointCoord.xy - .5;
  float r = length(uv);

  // Soft disc with an inner glow
  float disc = smoothstep(0.5, 0.35, r);
  float glow = exp(-r * 5.) * 0.4;
  float alpha = (disc + glow) * v_life;

  color = vec4(vec3(1.), alpha);
}
