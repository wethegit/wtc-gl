import { makeTexture } from './utils.js'

export const createSharedTextures = (gl) => {
  const noiseSize = 256
  const noiseData = new Uint8Array(noiseSize * noiseSize * 4)
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 255
  const noiseTex = makeTexture(gl, noiseData, noiseSize)

  const envSize = 256
  const envData = new Uint8Array(envSize * envSize * 4)
  for (let y = 0; y < envSize; y++) {
    for (let x = 0; x < envSize; x++) {
      const i = (y * envSize + x) * 4
      const u = x / envSize
      const v = y / envSize
      const ang = Math.atan2(v - 0.5, u - 0.5) / (Math.PI * 2) + 0.5
      const rad = Math.sqrt((u - 0.5) ** 2 + (v - 0.5) ** 2) * 2
      envData[i + 0] = (0.05 + 0.3  * Math.sin(ang * Math.PI * 2 + 0.0) + 0.1 * rad) * 255
      envData[i + 1] = (0.1  + 0.25 * Math.sin(ang * Math.PI * 2 + 2.1) + 0.1 * rad) * 255
      envData[i + 2] = (0.3  + 0.35 * Math.sin(ang * Math.PI * 2 + 4.2) + 0.1 * rad) * 255
      envData[i + 3] = 255
    }
  }
  const envTex = makeTexture(gl, envData, envSize)

  return { noiseTex, envTex }
}
