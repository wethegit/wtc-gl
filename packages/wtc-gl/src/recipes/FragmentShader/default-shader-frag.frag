precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform sampler2D s_noise;

uniform sampler2D b_noise;

varying vec2 v_uv;

void main() {
  gl_FragColor = vec4(vec3(cos(length(v_uv+u_time))*.5+.5, sin(v_uv+u_time)*.5+.5),1);
}