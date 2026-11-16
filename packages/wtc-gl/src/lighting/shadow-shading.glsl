// Shadow map lookups for the Lights directional light, set by `Shadow`.
// Include it in a fragment shader after the precision statement.
//
// The vertex shader works out the coordinate, from the world position pushed
// out along the world normal:
//
//   uniform mat4 u_shadowMatrix;
//   uniform float u_shadowNormalBias;
//   out vec4 v_shadowCoord;
//   v_shadowCoord = u_shadowMatrix * vec4(world + worldNormal * u_shadowNormalBias, 1.0);

// The light's depth, compared as it's sampled
uniform highp sampler2DShadow u_shadowMap;
// Subtracted from the depth, against acne
uniform float u_shadowBias;
// How far apart the taps are, in texels; 0 is one tap
uniform float u_shadowSoftness;
// One texel, in shadow map coordinates
uniform float u_shadowTexel;

// How lit a point is by the directional light, from 0 (in shadow) to 1.
// `coord` is the point in shadow map space, `u_shadowMatrix * world`.
float shadowFactor(vec4 coord) {
  vec3 p = coord.xyz / coord.w;
  // Outside the map is lit
  if (
    p.z > 1.0 ||
    any(lessThan(p.xy, vec2(0.0))) ||
    any(greaterThan(p.xy, vec2(1.0)))
  ) return 1.0;

  float z = p.z - u_shadowBias;
  // Each tap is already a 2x2 percentage-closer filter, from LINEAR filtering
  if (u_shadowSoftness <= 0.0) return texture(u_shadowMap, vec3(p.xy, z));
  float spread = u_shadowSoftness * u_shadowTexel;
  float lit = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      lit += texture(u_shadowMap, vec3(p.xy + vec2(x, y) * spread, z));
    }
  }
  return lit / 9.0;
}
