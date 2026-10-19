// Extrudes a doubled line point in screen space, so the line always faces the
// camera. Returns the clip-space position.
//
// - prev and next are the neighbouring points (an end repeats its own point)
// - side is +1 or -1, the edge of the line this vertex is on
// - width is in CSS pixels, or in world units when sizeAttenuation is true
// - resolution is the canvas size in CSS pixels
// - miterLimit caps how far a sharp corner reaches, in half widths
vec4 polylineExtrude(
  mat4 projection,
  mat4 modelView,
  vec3 position,
  vec3 prev,
  vec3 next,
  float side,
  float width,
  vec2 resolution,
  bool sizeAttenuation,
  float miterLimit
) {
  vec4 clip = projection * modelView * vec4(position, 1.0);
  vec4 clipPrev = projection * modelView * vec4(prev, 1.0);
  vec4 clipNext = projection * modelView * vec4(next, 1.0);

  // Screen space, with x scaled so that a unit is the same length both ways
  vec2 aspect = vec2(resolution.x / resolution.y, 1.0);
  vec2 current = clip.xy / clip.w * aspect;
  vec2 before = clipPrev.xy / clipPrev.w * aspect;
  vec2 after = clipNext.xy / clipNext.w * aspect;

  vec2 dirIn = current - before;
  vec2 dirOut = after - current;
  if (dot(dirIn, dirIn) < 1e-12) dirIn = dirOut;
  if (dot(dirOut, dirOut) < 1e-12) dirOut = dirIn;
  dirIn = dot(dirIn, dirIn) < 1e-12 ? vec2(1.0, 0.0) : normalize(dirIn);
  dirOut = dot(dirOut, dirOut) < 1e-12 ? dirIn : normalize(dirOut);

  // The mitre: perpendicular to the average direction, lengthened so the
  // edges stay parallel to each segment, up to the limit
  vec2 sum = dirIn + dirOut;
  vec2 dir = dot(sum, sum) < 1e-12 ? dirIn : normalize(sum);
  vec2 normal = vec2(-dir.y, dir.x);
  float miter = 1.0 / max(dot(normal, vec2(-dirIn.y, dirIn.x)), 1.0 / miterLimit);

  // Half the width, in clip units: pixels map through the canvas height, and
  // world units through the projection (the w divide cancels out)
  float halfWidth = sizeAttenuation
    ? width * 0.5 * projection[1][1]
    : width / resolution.y * clip.w;

  vec2 offset = normal * miter * halfWidth;
  offset.x /= aspect.x;
  clip.xy += offset * side;
  return clip;
}
