#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform sampler2D s_smoke;

out vec4 colour;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time * 8.;

  // Gentle time-driven UV drift simulating air currents
  vec2 drift = vec2(
    sin(t * 0.4 + uv.y * 3.1) * 0.012,
    cos(t * 0.3 + uv.x * 2.7) * 0.008
  );

  // Mouse repels the smoke slightly
  vec2 mouse = u_mouse;
  vec2 toMouse = uv - mouse;
  float mouseDist = length(toMouse);
  drift += normalize(toMouse) * smoothstep(0.3, 0.0, mouseDist) * 0.04;

  // Chromatic aberration — sample RGB channels at slightly offset UVs
  vec2 aberration = vec2(0.004, 0.);
  float r = texture(s_smoke, uv + drift + aberration).r;
  float g = texture(s_smoke, uv + drift          ).g;
  float b = texture(s_smoke, uv + drift - aberration).b;
  float lum = (r + g + b) / 3.;

  // Map luminance to a deep blue → teal → white palette
  vec3 c0 = vec3(0.03, 0.04, 0.14);
  vec3 c1 = vec3(0.06, 0.20, 0.48);
  vec3 c2 = vec3(0.12, 0.56, 0.72);
  vec3 c3 = vec3(0.88, 0.96, 1.00);

  vec3 col = mix(c0, c1, smoothstep(0.00, 0.30, lum));
  col      = mix(col, c2, smoothstep(0.25, 0.65, lum));
  col      = mix(col, c3, smoothstep(0.55, 1.00, lum));

  // Subtle vignette
  vec2 centered = uv * 2. - 1.;
  col *= 1. - dot(centered, centered) * 0.35;

  colour = vec4(col, 1.0);
}
