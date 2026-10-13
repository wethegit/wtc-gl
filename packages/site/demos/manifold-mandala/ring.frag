#version 300 es
precision highp float;

// Writes flat-lit albedo to rgb and linear view depth to alpha, plus the
// view-space normal to a second target. The post pass uses these for
// outlines, AO and fog.

in vec3 v_pos;
in vec3 v_normal;
in vec3 v_col;

uniform float u_clipRadius; // > 0: discard within this distance of the camera

layout(location = 0) out vec4 colour;
layout(location = 1) out vec4 normalOut;

void main() {
  if (u_clipRadius > 0. && length(v_pos) < u_clipRadius) discard;

  vec3 n = normalize(v_normal);
  vec3 L = normalize(vec3(-.45, .65, .6));
  float dif = max(dot(n, L), 0.);
  float back = max(dot(n, -L), 0.);
  float hemi = n.y * .5 + .5;

  vec3 lit = v_col * (.5 + .55 * dif + .12 * hemi - .12 * back);
  colour = vec4(lit, -v_pos.z);

  // culling is off, so face the normal toward the camera: both sides of a
  // plane then store the same normal and the edge pass can compare them
  normalOut = vec4(dot(n, v_pos) > 0. ? -n : n, 1.);
}
