#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_camResolution;
uniform sampler2D b_state;
uniform sampler2D b_webcam;

out vec4 colour;

// Aspect-correct "cover" UV — mirrors horizontally for selfie orientation.
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

vec3 saturate(vec3 c, float s) {
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(vec3(luma), c, s);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  // Snap to the same 2×2 cell grid used by the sim pass
  vec2 cellUV = (floor(gl_FragCoord.xy / 2.0) * 2.0 + 1.0) / u_resolution;

  vec4 state = texture(b_state, cellUV);
  // Cell colour: snapped to cell centre → nearest-neighbour webcam pixel, no bleed
  vec3 cam = texture(b_webcam, camUV(cellUV)).rgb;
  // Background ghost: smooth full-resolution webcam sample (independent of cell grid)
  vec3 bgCam = texture(b_webcam, camUV(uv)).rgb;

  float alive = step(0.5, state.r);
  float age   = state.g;

  // Background: ghosted webcam, slightly blue-shifted for contrast
  vec3 bg = bgCam * 0.07 + vec3(0.01, 0.01, 0.025);

  // Birth colour stored at the moment the cell came alive
  vec3 birthCol = vec3(state.b, state.a, 1.0 - state.b * 0.6);

  // Current webcam colour at this cell's position
  vec3 liveCol = max(cam, vec3(0.05, 0.06, 0.08));

  // Young cells: current webcam. Old cells: shift toward stored birth colour (memory effect)
  float memory = smoothstep(0.0, 0.6, age);
  vec3 baseColor = mix(liveCol, birthCol, memory * 0.65);

  // Saturation punch — cells pop against the muted background
  baseColor = saturate(baseColor, 1.8 - age * 0.5);

  // Brightness curve: rises quickly, plateaus, then gently fades at max age
  float brightness = 1.2 + 0.8 * smoothstep(0.0, 0.12, age) - 0.3 * smoothstep(0.7, 1.0, age);
  vec3 cellColor = baseColor * brightness;

  // Birth flash: a brief white-blue pulse the frame a cell is born
  float flash = smoothstep(0.0, 0.02, age) * (1.0 - smoothstep(0.02, 0.07, age));
  cellColor += flash * vec3(0.5, 0.65, 1.0);

  vec3 col = mix(bg, cellColor, alive);

  // Soft vignette
  vec2 c = uv * 2.0 - 1.0;
  col *= 1.0 - dot(c, c) * 0.18;

  // Gentle gamma lift
  col = pow(max(col, vec3(0.0)), vec3(0.88));

  colour = vec4(col, 1.0);
}
