#version 300 es

// One helical strand of the divider. Every instance is the same module,
// strung along a helix that coils around the x axis, and flowing along it.
// Local module space: x = radial (away from the axis), y = along the strand,
// z = binormal.

in vec3 position;
in vec3 normal;
in vec2 inst; // x: slot index, y: random

uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform float u_time;
uniform float u_fade; // length of the shrink-in at either end of the band
uniform vec2 u_chaos; // amount (0 = a clean helix), wander amplitude in world units
uniform float u_squeeze; // scales the strand toward the axis to keep it in the band

uniform vec4 u_hA; // radius, coil (radians per unit x), phase, scale
uniform vec4 u_hB; // count, length, flow offset, tilt
uniform vec4 u_hC; // twist turns, mirror, breathe amp, breathe freq
uniform vec4 u_hD; // radial undulation amp, freq (per unit x), speed
uniform vec3 u_hCol;

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

// Three sines at unrelated frequencies, drifting at unrelated speeds: an
// irregular wave in [-1, 1]. x is in band lengths * TAU; ph decorrelates
// each use.
float wave(float x, float ph) {
  float t = u_time;
  return .55 * sin(x * 2.3 + t * .31 + ph)
       + .3 * sin(x * 5.1 - t * .47 + ph * 1.7)
       + .15 * sin(x * 9.7 + t * .73 + ph * 2.3);
}

// The strand's centre line at x = s: a helix around the x axis, bent away
// from it by chaos - jittered angle and radius, plus a sideways wander.
vec3 curve(float s, float len, out float th) {
  float c = u_chaos.x;
  float ph = u_hA.z;
  float x = s / len * TAU;
  th = s * u_hA.y + ph + c * 1.2 * wave(x, ph + 1.);
  float R = u_hA.x * (1. + u_hD.x * sin(s * u_hD.y - u_time * u_hD.z + ph));
  R *= max(0., 1. + c * .45 * wave(x, ph + 2.));
  vec3 wander = c * u_chaos.y * vec3(0., wave(x, ph + 3.), wave(x, ph + 4.));
  return vec3(s, (vec2(R * cos(th), R * sin(th)) + wander.yz) * u_squeeze);
}

void main() {
  float i = inst.x;
  float N = u_hB.x;
  float len = u_hB.y;
  float t = u_time;
  // slot angle: drives the per-module waves, and travels with the module
  float a0 = i / N * TAU;

  // position along the axis, wrapping seamlessly as the strand flows
  float s = mod(i / N * len + u_hB.z, len) - .5 * len;
  float th, th0, th1;
  vec3 c = curve(s, len, th);

  vec3 p = position;
  vec3 n = normal;

  // bilateral symmetry: mirror every other module
  if (u_hC.y > .5 && mod(i, 2.) > .5) {
    p.y = -p.y;
    n.y = -n.y;
  }

  // modules breathe outward in a travelling wave along the strand, and
  // shrink to nothing at either end of the band
  float breathe = 1. + u_hC.z * sin(t * 1.1 + a0 * u_hC.w);
  float edge = smoothstep(.5 * len, .5 * len - u_fade, abs(s));
  p *= u_hA.w * edge * u_squeeze;
  p.x *= breathe;

  // tilt toward/away from the axis, plus a spiral roll along the strand
  float tilt = u_hB.w + .18 * sin(t * .5 + a0 * 3. + u_hA.z);
  mat3 Rm = rotY(tilt) * rotX(u_hC.x * a0 + .15 * sin(t * .3 + inst.y * TAU));
  p = Rm * p;
  n = Rm * n;

  // curve frame: tangent by finite difference, radial = the helix's outward
  // direction made perpendicular to it (also defined on the axis, R = 0)
  vec3 tg = normalize(curve(s + .05, len, th1) - curve(s - .05, len, th0));
  vec3 rad = vec3(0., cos(th), sin(th));
  rad = normalize(rad - tg * dot(rad, tg));
  vec3 bn = cross(rad, tg);

  vec3 wp = c + rad * p.x + tg * p.y + bn * p.z;
  vec3 wn = rad * n.x + tg * n.y + bn * n.z;

  vec4 vp = u_viewMatrix * vec4(wp, 1.);
  v_pos = vp.xyz;
  v_normal = mat3(u_viewMatrix) * wn;
  v_col = u_hCol * (.94 + .12 * inst.y);

  gl_Position = u_projectionMatrix * vp;
}
