#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_view;
in vec3 v_colour;

// 0 lit, 1 normals
uniform int u_mode;
// The sky colour the fog fades into
uniform vec3 u_fogColour;

out vec4 colour;

// Lit here until wtc-gl has a built-in lit program: one directional light, a
// sky/ground hemisphere and a soft rim, with fog fading into the sky
void main() {
  vec3 n = normalize(v_normal);

  if (u_mode == 1) {
    colour = vec4(n * 0.5 + 0.5, 1.0);
    return;
  }

  vec3 light = normalize(vec3(-0.45, 0.65, 0.6));
  float diffuse = max(dot(n, light), 0.0);
  float hemisphere = n.y * 0.5 + 0.5;
  float back = max(dot(n, -light), 0.0);
  float rim = pow(1.0 - max(dot(n, normalize(v_view)), 0.0), 3.0);
  vec3 lit =
    v_colour * (0.5 + 0.55 * diffuse + 0.12 * hemisphere - 0.12 * back) +
    rim * 0.12;

  float d = length(v_view);
  float fog = 1.0 - exp(-pow(max(d - 22.0, 0.0) / 55.0, 1.6));
  colour = vec4(mix(lit, u_fogColour, fog), 1.0);
}
