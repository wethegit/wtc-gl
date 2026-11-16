// Prefixed with the version, precision and wtc-gl's litShading

in vec3 v_normal;
in vec3 v_position;
in vec3 v_colour;

// 0 lit, 1 normals
uniform int u_mode;
// The sky colour the fog fades into
uniform vec3 u_fogColour;
uniform mat4 u_viewMatrix;

out vec4 colour;

// wtc-gl's lighting, from the shared Lights, darkened a little facing away
// from the light, plus a soft rim and fog fading into the sky
void main() {
  vec3 n = normalize(v_normal);

  if (u_mode == 1) {
    colour = vec4(n * 0.5 + 0.5, 1.0);
    return;
  }

  mat3 viewRotation = mat3(u_viewMatrix);
  vec3 view = normalize(-v_position);
  float back = max(dot(n, -normalize(viewRotation * u_lightDirection)), 0.0);
  float rim = pow(1.0 - max(dot(n, view), 0.0), 3.0);
  vec3 lit =
    litShade(v_colour, n, view, viewRotation, 0.0, 1.0) -
    v_colour * 0.12 * back +
    rim * 0.12;

  float d = length(v_position);
  float fog = 1.0 - exp(-pow(max(d - 22.0, 0.0) / 55.0, 1.6));
  colour = vec4(mix(lit, u_fogColour, fog), 1.0);
}
