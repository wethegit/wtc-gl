// The lighting shared by LitProgram and custom shaders: one directional
// light, a sky/ground hemisphere and flat ambient light, set by `Lights`.
// Include it after the shader's precision statement.

// Towards the directional light, in world space, normalised
uniform vec3 u_lightDirection;
uniform vec3 u_lightColour;
uniform float u_lightIntensity;
// The hemisphere light from above (world +Y) and below
uniform vec3 u_skyColour;
uniform vec3 u_groundColour;
uniform float u_ambient;

// Light a surface of colour `base`.
// - `normal` and `view` are view-space unit vectors; `view` points towards the
//   camera.
// - `viewRotation` is mat3(u_viewMatrix), which turns the world-space lights
//   into view space.
// - `specular` scales a Blinn-Phong highlight with exponent `shininess`; 0 is
//   plain Lambert.
vec3 litShade(
  vec3 base,
  vec3 normal,
  vec3 view,
  mat3 viewRotation,
  float specular,
  float shininess
) {
  vec3 l = normalize(viewRotation * u_lightDirection);
  // World +Y in view space
  vec3 up = viewRotation[1];

  float diffuse = max(dot(normal, l), 0.0);
  vec3 hemisphere = mix(
    u_groundColour,
    u_skyColour,
    dot(normal, up) * 0.5 + 0.5
  );
  vec3 light = u_lightColour * u_lightIntensity;

  vec3 c = base * (vec3(u_ambient) + hemisphere + light * diffuse);
  if (specular > 0.0 && diffuse > 0.0) {
    vec3 h = normalize(l + view);
    c += light * specular * pow(max(dot(normal, h), 0.0), shininess);
  }
  return c;
}
