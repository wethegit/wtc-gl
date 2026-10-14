import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect, type ConsoleMessage, type Page } from '@playwright/test'

const demosDir = join(import.meta.dirname, '..', 'demos')

// Every folder in demos/ with an index.html, plus the index page itself
const demos = [
  '',
  ...readdirSync(demosDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => existsSync(join(demosDir, d.name, 'index.html')))
    .map((d) => d.name)
]

// Chromium reports GL errors as console warnings, e.g.
// "[.WebGL-0x…] GL_INVALID_OPERATION: glDrawElements: …"
const webglWarning = /WebGL|GL_INVALID|GL ERROR|GL_OUT_OF_MEMORY/i

// Chromium warns about every GL call made while the context is lost. Those
// are expected in the gap between losing and restoring, so don't count them.
const contextLostWarning = /CONTEXT_LOST_WEBGL/

// Frames to let each demo render before checking
const frames = 30

/**
 * Collect console errors, uncaught exceptions and WebGL warnings.
 */
function watch(page: Page) {
  const problems: string[] = []

  page.on('console', (msg: ConsoleMessage) => {
    const type = msg.type()
    const text = msg.text()
    if (type === 'error') problems.push(`console.error: ${text}`)
    else if (
      type === 'warning' &&
      webglWarning.test(text) &&
      !contextLostWarning.test(text)
    )
      problems.push(`WebGL warning: ${text}`)
  })
  page.on('pageerror', (error) => {
    problems.push(`Uncaught: ${error.message}`)
  })

  return problems
}

/**
 * Let the render loop run for a while so per-frame errors show up.
 */
function waitFrames(page: Page, count = frames) {
  return page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let n = 0
        const tick = () =>
          ++n >= count ? resolve() : requestAnimationFrame(tick)
        requestAnimationFrame(tick)
      }),
    count
  )
}

/**
 * Lose or restore the context of every WebGL canvas on the page, via
 * WEBGL_lose_context. Returns how many canvases were affected.
 */
function setContextLost(page: Page, lost: boolean) {
  return page.evaluate((lost) => {
    let count = 0
    for (const canvas of document.querySelectorAll('canvas')) {
      // Returns the existing context, or null if it's a different type
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
      const ext = gl?.getExtension('WEBGL_lose_context')
      if (!ext) continue
      if (lost) ext.loseContext()
      else ext.restoreContext()
      count++
    }
    return count
  }, lost)
}

async function load(page: Page, demo: string) {
  await page.goto(`/demos/${demo}${demo ? '/' : ''}`)
  await page.waitForLoadState('load')
  await waitFrames(page)

  // Scroll-driven demos only render some scenes once they're on screen.
  // Scroll the window directly: mouse.wheel waits for the page to handle
  // the input, which can time out on heavy demos under software WebGL.
  await page.evaluate(() => window.scrollTo(0, 2000))
  await page.waitForTimeout(500)
}

for (const demo of demos) {
  const name = demo || 'index'

  test(`demo: ${name}`, async ({ page }) => {
    const problems = watch(page)
    await load(page, demo)
    expect(problems, problems.join('\n')).toEqual([])
  })

  test(`context restore: ${name}`, async ({ page }) => {
    const problems = watch(page)
    await load(page, demo)

    const canvases = await setContextLost(page, true)
    test.skip(canvases === 0, 'No WebGL canvas')
    await waitFrames(page, 10)

    await setContextLost(page, false)
    await waitFrames(page)

    expect(problems, problems.join('\n')).toEqual([])
  })
}
