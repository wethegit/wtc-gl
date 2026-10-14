#version 300 es

// One ring ("tier") of the mandala. Every instance is the same module,
// placed around a circle and animated here on the GPU.
// Local module space: x = radial (outward), y = tangential, z = tunnel axis.

in vec3 position;
in vec3 normal;
in vec2 inst; // x: slot index, y: random

uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform float u_time;
uniform float u_roll;
uniform float u_swirl; // angular twist per unit depth: the vortex

uniform vec4 u_tA; // radius, z, spin, scale
uniform vec4 u_tB; // count, radial wave amp, radial wave freq, tilt
uniform vec4 u_tC; // twist turns, z wave amp, z wave freq, mirror
uniform vec4 u_tD; // breathe amp, phase, breathe freq, breathe speed
uniform vec3 u_tCol;

out vec3 v_pos;
out vec3 v_normal;
out vec3 v_col;

const float TAU = 6.28318530718;

mat3 rotX(float a) {
  float c = cos(a), s = sin(a);
  return mat3(1., 0., 0., 0., c, s, 0., -s, c);
}
mat3 rotY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, 0., -s, 0., 1., 0., s, 0., c);
}

void main() {
  float i = inst.x;
  float N = u_tB.x;
  float t = u_time;
  float a0 = i / N * TAU;
  float th = a0 + u_tA.z + u_roll + u_tA.y * u_swirl;

  vec3 p = position;
  vec3 n = normal;

  // bilateral symmetry: mirror every other module
  if (u_tC.w > .5 && mod(i, 2.) > .5) {
    p.y = -p.y;
    n.y = -n.y;
  }

  // modules breathe outward in a travelling wave around the ring
  float breathe = 1. + u_tD.x * sin(t * u_tD.w + a0 * u_tD.z + u_tD.y);
  p *= u_tA.w;
  p.x *= breathe;

  // tilt toward/away from the centre, plus a spiral roll around the radial axis
  float tilt = u_tB.w + .18 * sin(t * .5 + a0 * u_tB.z + u_tD.y);
  mat3 R = rotY(tilt) * rotX(u_tC.x * a0 + .15 * sin(t * .3 + u_tD.y));
  p = R * p;
  n = R * n;

  float r = u_tA.x * (1. + u_tB.y * cos(u_tB.z * a0 + t * .3));
  float zo = u_tC.y * sin(u_tC.z * a0 + t * .7 + u_tD.y);

  vec2 dir = vec2(cos(th), sin(th));
  vec2 tg = vec2(-dir.y, dir.x);
  vec3 wp = vec3(dir * (r + p.x) + tg * p.y, u_tA.y + zo + p.z);
  vec3 wn = vec3(dir * n.x + tg * n.y, n.z);

  vec4 vp = u_viewMatrix * vec4(wp, 1.);
  v_pos = vp.xyz;
  v_normal = mat3(u_viewMatrix) * wn;
  v_col = u_tCol * (.94 + .12 * inst.y);

  gl_Position = u_projectionMatrix * vp;
}
