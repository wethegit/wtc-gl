/**
 * A linear colour component as sRGB.
 *
 * glTF stores colour factors and vertex colours as linear values, while
 * `LitProgram` shades in sRGB, the space textures and canvas colours are in.
 * Converting them keeps colours picked in a modelling tool looking as they did
 * there, rather than darker and more saturated.
 */
export function linearToSRGB(value: number): number {
  // Exact at the ends, which the curve misses by a rounding error
  if (value >= 1) return 1
  return value <= 0.0031308
    ? value * 12.92
    : 1.055 * Math.pow(value, 1 / 2.4) - 0.055
}

/** Convert the RGB of each `size`-component colour in place, skipping alpha. */
export function linearToSRGBArray(data: Float32Array, size: number): void {
  for (let i = 0; i < data.length; i++) {
    if (i % size < 3) data[i] = linearToSRGB(data[i])
  }
}
