attribute vec2 reference;
attribute vec2 position;
attribute float property;

uniform vec2 u_resolution;
uniform vec2 u_screen;

uniform sampler2D b_velocity;
uniform sampler2D b_position;

varying vec3 v_colour;
varying float v_fogDepth;

void main() {
  vec2 position = texture2D(b_position, reference).xy;
  gl_PointSize = 2.;
  vec2 p = position/u_resolution;
  v_colour = property == 1. ? vec3(1,0,0) : vec3(1,1,1);
  vec4 pos = vec4(position / u_resolution * 2. - 1., 0., 1.);
  gl_Position = vec4(pos.xy, 0., 1.);
}