#version 300 es
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_mouse;
  uniform sampler2D s_noise;
  uniform sampler2D b_render;

  in vec2 v_uv;

  out vec4 colour;

  
  /* Utilities */
  /* ---------- */
  
  void main() {
    colour = texture(b_render, gl_FragCoord.xy / u_resolution );
  }