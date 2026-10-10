import { defineConfig, devices } from '@playwright/test'

const port = 5199

// Smoke tests for the demos. Starts the Vite dev server, loads each demo and
// fails on console errors, uncaught exceptions and WebGL warnings.
export default defineConfig({
  testDir: './e2e',
  // WebGL runs in software (SwiftShader), which is slow and uses several
  // threads per page. Heavy demos like camera-and-instancing time out when
  // too many run at once, so keep the worker count down and allow more time.
  timeout: 60_000,
  workers: 6,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
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
    reuseExistingServer: !process.env.CI
  }
})
