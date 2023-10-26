#extension GL_OES_standard_derivatives : enable
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;

varying vec3 v_colour;

void main() {
  vec2 uv = gl_PointCoord.xy - .5;

  gl_FragColor = vec4(0, 0, 0, 1);

  float l = length(uv);
  float c = smoothstep(.5, 0., l);
  float opacity = c;

  gl_FragColor = vec4(v_colour, 1.);
}