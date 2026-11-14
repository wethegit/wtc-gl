import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineLoader } from 'vitepress'

/**
 * The demo cards from the demos site's gallery, so that page stays the one
 * place a demo is listed. Read at build time, and again in dev whenever the
 * gallery changes.
 */
export interface Demo {
  /** The card's heading, as text. */
  title: string
  /** The demo's folder under `packages/site/demos/`. */
  folder: string
  /** The screenshot's file name in `screenshots/`, or null when there isn't one. */
  image: string | null
  /** The screenshot's alt text. */
  alt: string
  /** For a card without a screenshot: the CSS background of its preview. */
  background: string | null
  /** For a card without a screenshot: the short label on its preview. */
  label: string | null
  /** The classes and functions the demo shows off. */
  classes: string[]
  /** The description, as HTML with only `<code>` kept. */
  description: string
}

declare const data: Demo[]
export { data }

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const demosDir = here('../../site/demos/')
const galleryFile = here('../../site/demos/index.html')

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()

const decode = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')

// Tags dropped, entities decoded
const toText = (html: string) => decode(collapse(html.replace(/<[^>]*>/g, '')))

// Every tag but <code> dropped; entities stay encoded, as it's shown as HTML
const toInlineHTML = (html: string) =>
  collapse(html.replace(/<(?!\/?code>)[^>]*>/g, ''))

const attribute = (tag: string, name: string) =>
  tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null

const parseCard = (card: string): Demo | null => {
  const title = card.match(/<h3[^>]*>([\s\S]*?)<\/h3\s*>/)?.[1]
  const description = card.match(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p\s*>/)?.[1]
  const href = card.match(/<a\b[^>]*class="btn"[^>]*>/)?.[0]
  const folder = href
    ? attribute(href, 'href')
        ?.replace(/^\.\//, '')
        .replace(/[#?].*$/, '')
        .replace(/\/$/, '')
    : null
  if (!title || !description || !folder) return null

  const classes = [
    ...card.matchAll(/<span class="demo__class">([\s\S]*?)<\/span\s*>/g)
  ].map(([, name]) => toText(name))

  // A screenshot, if it's one that exists; otherwise the card's own
  // placeholder, a gradient and a label
  const preview =
    card.match(
      /<div\s+class="demo__preview"([^>]*)>([\s\S]*?)<div class="demo__body">/
    ) ?? []
  const img = preview[2]?.match(/<img\b[^>]*>/)?.[0]
  const src = img ? attribute(img, 'src') : null
  const shot = src?.match(/^\.\/screenshots\/([^/]+)$/)?.[1] ?? null
  const image =
    shot && existsSync(demosDir + 'screenshots/' + shot) ? shot : null
  const style = attribute(preview[1] ?? '', 'style') ?? ''
  const background = image
    ? null
    : collapse(style.match(/background:\s*([^;]+)/)?.[1] ?? '')
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')') || null
  const label = image
    ? null
    : toText(
        preview[2]?.match(/<span\b[^>]*>([\s\S]*?)<\/span\s*>/)?.[1] ?? ''
      ) || null

  return {
    title: toText(title),
    folder,
    image,
    alt: img ? toText(attribute(img, 'alt') ?? '') : '',
    background,
    label,
    classes,
    description: toInlineHTML(description)
  }
}

export default defineLoader({
  watch: ['../../site/demos/index.html'],
  load(): Demo[] {
    const html = readFileSync(galleryFile, 'utf8')
    // Only the demos section; the recipe cards above it have their own pages
    const section = html.match(
      /<section\b[^>]*class="demos"[^>]*>([\s\S]*?)<\/section\s*>/
    )?.[1]
    if (!section) {
      throw new Error(`No <section class="demos"> in ${galleryFile}`)
    }
    const cards = section.split(/<div class="demo">/).slice(1)
    const demos = cards.map(parseCard)
    const skipped = demos.filter((demo) => !demo).length
    if (skipped) {
      console.warn(`demos.data: couldn't read ${skipped} demo card(s)`)
    }
    return demos.filter((demo): demo is Demo => !!demo)
  }
})
