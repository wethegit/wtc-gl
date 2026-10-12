// Extrude one vertex of a thick line in screen space, as in OGL's Polyline
// and three.js's MeshLine. Returns the vertex's clip-space position.
//
//   position:        the point
//   prev, next:      its neighbours along the line
//   side:            -1 or 1, which edge of the line this vertex is on
//   width:           the full width, in pixels, or in world units when
//                    sizeAttenuation is 1 (so it shrinks with distance)
//   resolution:      the viewport, in pixels
//   miterLimit:      how far a sharp corner may stick out, as a multiple of
//                    the width; sharper corners are cut off there
//
// It's a plain function with no attributes or varyings, so it can be
// included in GLSL ES 1.0 and 3.0 shaders alike.
vec4 lineExtrude(
  mat4 projection,
  mat4 modelView,
  vec3 position,
  vec3 prev,
  vec3 next,
  float side,
  float width,
  vec2 resolution,
  float sizeAttenuation,
  float miterLimit
) {
  vec4 current = projection * modelView * vec4(position, 1.);
  vec4 previous = projection * modelView * vec4(prev, 1.);
  vec4 following = projection * modelView * vec4(next, 1.);

  // Screen space, with x scaled so that distances are square
  vec2 aspect = vec2(resolution.x / resolution.y, 1.);
  vec2 currentScreen = current.xy / current.w * aspect;
  vec2 dirIn = currentScreen - previous.xy / previous.w * aspect;
  vec2 dirOut = following.xy / following.w * aspect - currentScreen;

  // A zero-length segment (a repeated point) takes the other's direction
  if (dot(dirIn, dirIn) < 1e-12) dirIn = dirOut;
  if (dot(dirOut, dirOut) < 1e-12) dirOut = dirIn;
  dirIn = normalize(dirIn);
  dirOut = normalize(dirOut);

  // The join is perpendicular to the average direction, and lengthened so
  // both edges stay the full width apart. A line that doubles back on
  // itself has no average, so it uses the incoming direction.
  vec2 tangent = dirIn + dirOut;
  tangent = dot(tangent, tangent) < 1e-12 ? dirIn : normalize(tangent);
  vec2 miter = vec2(-tangent.y, tangent.x);
  float miterLength = 1. / max(dot(miter, vec2(-dirIn.y, dirIn.x)), 1e-4);
  miterLength = min(miterLength, miterLimit);

  vec2 offset = miter * miterLength * side * width * .5;
  if (sizeAttenuation > .5) {
    // World units: a world-space length projects to this many screen units
    // per unit of w, so the line shrinks with distance
    offset *= projection[1][1];
  } else {
    // Pixels: the viewport is 2 units tall here; scaling by w undoes the
    // perspective divide, so the width stays the same on screen
    offset *= 2. / resolution.y * current.w;
  }
  offset.x /= aspect.x;

  current.xy += offset;
  return current;
}
