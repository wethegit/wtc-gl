import { defineConfig, devices } from '@playwright/test'

const port = 5199
const ci = !!process.env.CI

// Smoke tests for the demos. Starts the Vite dev server, loads each demo and
// fails on console errors, uncaught exceptions and WebGL warnings.
export default defineConfig({
  testDir: './e2e',
  // WebGL runs in software (SwiftShader), which is slow and uses several
  // threads per page. Heavy demos like camera-and-instancing time out when
  // too many run at once, so keep the worker count down and allow more time.
  // GitHub's runners have 4 vCPUs, so CI runs fewer at once with a smaller
  // viewport (see the project below) and more time.
  timeout: ci ? 120_000 : 60_000,
  workers: ci ? 2 : 6,
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Fewer pixels for SwiftShader to render on CI's smaller runners
        ...(ci && { viewport: { width: 800, height: 450 } }),
        // The webcam demo asks for a camera
        permissions: ['camera'],
        launchOptions: {
          args: [
            // Headless Chromium has no GPU; use SwiftShader so WebGL2 works
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--autoplay-policy=no-user-gesture-required'
          ]
        }
      }
    }
  ],
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    url: `http://localhost:${port}/demos/`,
    reuseExistingServer: !ci
  }
})
