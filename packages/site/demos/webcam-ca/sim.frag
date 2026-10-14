#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_camResolution;
uniform float u_time;
uniform sampler2D b_state;
uniform sampler2D b_webcam;

out vec4 colour;

// Aspect-correct "cover" UV — mirrors horizontally for selfie orientation.
// Maintains the webcam's native aspect ratio, cropping as needed to fill the screen.
vec2 camUV(vec2 screenUV) {
  float sAR = u_resolution.x / u_resolution.y;
  float cAR = u_camResolution.x / u_camResolution.y;
  vec2 uv = vec2(1.0 - screenUV.x, screenUV.y); // mirror
  if (cAR > sAR) {
    uv.x = (uv.x - 0.5) * (sAR / cAR) + 0.5;   // crop webcam width
  } else {
    uv.y = (uv.y - 0.5) * (cAR / sAR) + 0.5;   // crop webcam height
  }
  return uv;
}

// Two independent hashes to avoid correlated patterns per axis
float hash21a(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float hash21b(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

void main() {
  const float PIXEL_SIZE = 2.0;

  // Snap to PIXEL_SIZE cell grid — all pixels in a block compute identically
  vec2 cellCoord = floor(gl_FragCoord.xy / PIXEL_SIZE);
  vec2 cellUV    = (cellCoord * PIXEL_SIZE + 1.0) / u_resolution; // sample at cell centre
  vec2 px        = PIXEL_SIZE / u_resolution;                      // one step = one cell

  vec3 cam  = texture(b_webcam, camUV(cellUV)).rgb;
  float luma = dot(cam, vec3(0.299, 0.587, 0.114));

  // Current cell: R=alive, G=age, B=birth cam.r, A=birth cam.g
  vec4 curr  = texture(b_state, cellUV);
  float alive = step(0.5, curr.r);
  float age   = curr.g;

  // Count Moore neighbourhood (each step moves one full cell = 2px)
  float count = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dy == 0) continue;
      count += step(0.5, texture(b_state, cellUV + vec2(float(dx), float(dy)) * px).r);
    }
  }

  // Conway Game of Life rules
  float survives = alive        * step(1.5, count) * step(count, 3.5);
  float born     = (1.0 - alive) * step(2.5, count) * step(count, 3.5);

  // Use cellCoord for randomness so all pixels in the same cell agree
  float frameId = floor(u_time * 60.0);
  float rng1 = hash21a(cellCoord * 0.89 + vec2(frameId * 0.037, frameId * 0.061));
  float rng2 = hash21b(cellCoord * 1.13 + vec2(frameId * 0.071, frameId * 0.041));

  // ~8% hit rate in lit areas → dense enough for Conway clusters to form
  float webcamSeed   = (1.0 - alive) * step(0.35, luma) * step(0.92, rng1);
  // Tiny baseline so something is always visible even without a webcam
  float baselineSeed = (1.0 - alive) * step(0.9995, rng2); // ~0.05% per frame

  float nextAlive = clamp(survives + born + webcamSeed + baselineSeed, 0.0, 1.0);

  // Age: accumulates while alive, resets on death
  float nextAge = nextAlive > 0.5 ? min(age + 1.0 / 200.0, 1.0) : 0.0;

  // Capture webcam colour at birth; preserve across lifetime
  float newBirth = (1.0 - alive) * nextAlive;
  float storedR  = mix(curr.b, cam.r, newBirth);
  float storedG  = mix(curr.a, cam.g, newBirth);

  colour = vec4(nextAlive, nextAge, storedR, storedG);
}
