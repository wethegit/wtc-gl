// Default vertex shader for Line. See extrude.glsl for the extrusion.
attribute vec3 position;
attribute vec3 prev;
attribute vec3 next;
attribute float side;
attribute vec2 uv;
attribute float lineDistance;
attribute float width;

uniform mat4 u_projectionMatrix;
uniform mat4 u_modelViewMatrix;
uniform vec2 u_resolution;
uniform float u_lineWidth;
uniform float u_sizeAttenuation;
uniform float u_miterLimit;

varying vec2 v_uv;
varying float v_lineDistance;

#include ./extrude.glsl;

void main() {
  v_uv = uv;
  v_lineDistance = lineDistance;
  gl_Position = lineExtrude(
    u_projectionMatrix,
    u_modelViewMatrix,
    position,
    prev,
    next,
    side,
    width * u_lineWidth,
    u_resolution,
    u_sizeAttenuation,
    u_miterLimit
  );
}
