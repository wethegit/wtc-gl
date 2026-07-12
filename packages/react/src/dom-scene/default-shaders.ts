import { glsl } from 'wtc-gl'

// The react package build has no GLSL plugin, so the default shaders live in
// template strings. `glsl` is a runtime no-op tag for editor highlighting.

export const defaultVertex300 = glsl`#version 300 es
in vec3 position;
in vec2 uv;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;

out vec2 v_uv;

void main() {
  v_uv = uv;
  gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(position, 1.0);
}
`

export const defaultFragment300 = glsl`#version 300 es
precision highp float;

uniform float u_time;

in vec2 v_uv;
out vec4 color;

void main() {
  color = vec4(v_uv, 0.5 + 0.5 * sin(u_time * 10.0), 1.0);
}
`

export const defaultVertex100 = glsl`
attribute vec3 position;
attribute vec2 uv;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;

varying vec2 v_uv;

void main() {
  v_uv = uv;
  gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(position, 1.0);
}
`

export const defaultFragment100 = glsl`
precision highp float;

uniform float u_time;

varying vec2 v_uv;

void main() {
  gl_FragColor = vec4(v_uv, 0.5 + 0.5 * sin(u_time * 10.0), 1.0);
}
`

const is300 = (source: string) => /^\s*#version\s+300\s+es/.test(source)

/**
 * Fills in missing shader stages with the default plane shaders. A lone user
 * shader is paired with the default of the same GLSL version - a `300 es`
 * stage can't link against a `100` one.
 */
export function resolveShaders({
  vertex,
  fragment
}: {
  vertex?: string
  fragment?: string
}): { vertex: string; fragment: string } {
  if (vertex && fragment) return { vertex, fragment }

  if (vertex) {
    return {
      vertex,
      fragment: is300(vertex) ? defaultFragment300 : defaultFragment100
    }
  }

  if (fragment) {
    return {
      vertex: is300(fragment) ? defaultVertex300 : defaultVertex100,
      fragment
    }
  }

  return { vertex: defaultVertex300, fragment: defaultFragment300 }
}
