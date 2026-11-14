<script setup lang="ts">
import { computed, ref } from 'vue'
import { withBase } from 'vitepress'
import type { Demo } from '../../../showcase/demos.data'

/**
 * The demos as a grid of cards, from `showcase/demos.data.ts`. The chips
 * filter by class: the row above the grid has the classes more than one
 * demo uses, and every chip on a card filters by its class too.
 */
const props = withDefaults(
  defineProps<{
    demos: Demo[]
    /** Folders that have a walkthrough at `/showcase/<folder>`. */
    walkthroughs?: string[]
  }>(),
  { walkthroughs: () => [] }
)

const DEMOS = 'https://wethegit.github.io/wtc-gl/demos/'
const SOURCE =
  'https://github.com/wethegit/wtc-gl/tree/master/packages/site/demos/'

const active = ref<string | null>(null)

// Classes shared by two or more demos, the most used first
const filters = computed(() => {
  const counts = new Map<string, number>()
  for (const demo of props.demos) {
    for (const name of demo.classes) {
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  const shared = [...counts]
    .filter(([, count]) => count > 1)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([name]) => name)
  // A class picked from a card stays in the row while it's active
  if (active.value && !shared.includes(active.value)) shared.push(active.value)
  return shared
})

const shown = computed(() =>
  active.value
    ? props.demos.filter((demo) => demo.classes.includes(active.value!))
    : props.demos
)

const toggle = (name: string) => {
  active.value = active.value === name ? null : name
}
</script>

<template>
  <div class="demo-gallery">
    <div
      class="demo-gallery__filters"
      role="group"
      aria-label="Filter by class"
    >
      <button
        type="button"
        class="demo-chip"
        :aria-pressed="!active"
        @click="active = null"
      >
        All
      </button>
      <button
        v-for="name in filters"
        :key="name"
        type="button"
        class="demo-chip"
        :aria-pressed="active === name"
        @click="toggle(name)"
      >
        {{ name }}
      </button>
    </div>

    <p class="demo-gallery__status" aria-live="polite">
      <template v-if="active">
        {{ shown.length }} {{ shown.length === 1 ? 'demo uses' : 'demos use' }}
        <code>{{ active }}</code
        >.
        <button
          type="button"
          class="demo-gallery__clear"
          @click="active = null"
        >
          Show all
        </button>
      </template>
      <template v-else>{{ demos.length }} demos.</template>
    </p>

    <ul class="demo-gallery__grid">
      <li v-for="demo in shown" :key="demo.folder" class="demo-card">
        <a
          class="demo-card__preview"
          :href="`${DEMOS}${demo.folder}/`"
          tabindex="-1"
        >
          <img
            v-if="demo.image"
            :src="withBase(`/screenshots/${demo.image}`)"
            :alt="demo.alt"
            loading="lazy"
            decoding="async"
          />
          <span
            v-else
            class="demo-card__placeholder"
            :style="{ background: demo.background ?? undefined }"
          >
            <span class="demo-card__label">{{ demo.label ?? demo.title }}</span>
          </span>
        </a>

        <ul class="demo-card__classes" aria-label="Classes">
          <li v-for="name in demo.classes" :key="name">
            <button
              type="button"
              class="demo-chip"
              :aria-pressed="active === name"
              :title="`Show the demos that use ${name}`"
              @click="toggle(name)"
            >
              {{ name }}
            </button>
          </li>
        </ul>

        <h3 class="demo-card__title">
          <a :href="`${DEMOS}${demo.folder}/`">{{ demo.title }}</a>
        </h3>
        <p class="demo-card__description" v-html="demo.description" />

        <p class="demo-card__links">
          <a
            class="demo-card__link demo-card__link--primary"
            :href="`${DEMOS}${demo.folder}/`"
            >Open the demo →</a
          >
          <a
            v-if="walkthroughs.includes(demo.folder)"
            class="demo-card__link"
            :href="withBase(`/showcase/${demo.folder}`)"
            >Walkthrough</a
          >
          <a class="demo-card__link" :href="`${SOURCE}${demo.folder}`"
            >Source</a
          >
        </p>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.demo-gallery {
  container-type: inline-size;
  margin-top: 32px;
}

/* ── Chips: the mono labels of the sidebar and page header ───────────── */

.demo-chip {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px var(--vp-c-divider);
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
  /* Class names keep their case: useScrollScene, not USESCROLLSCENE */
  letter-spacing: 0.02em;
  color: var(--vp-c-text-3);
  transition:
    color 0.2s,
    background-color 0.2s,
    box-shadow 0.2s;
}
.demo-chip:hover {
  color: var(--vp-c-text-1);
  box-shadow: inset 0 0 0 1px var(--vp-c-text-3);
}
.demo-chip[aria-pressed='true'] {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  box-shadow: inset 0 0 0 1px transparent;
}
.demo-chip:focus-visible,
.demo-gallery__clear:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.demo-gallery__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.demo-gallery__filters .demo-chip {
  font-size: 12px;
  padding: 4px 11px;
}

.demo-gallery__status {
  margin: 16px 0 0;
  font-size: 14px;
  color: var(--vp-c-text-2);
}
.demo-gallery__status code {
  font-size: 0.875em;
}
.demo-gallery__clear {
  margin-left: 4px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
}
.demo-gallery__clear:hover {
  color: var(--vp-c-brand-2);
}

/* ── Grid ────────────────────────────────────────────────────────────── */

.demo-gallery__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 56px 32px;
  margin: 24px 0 0;
  padding: 0;
  list-style: none;
}
@container (min-width: 640px) {
  .demo-gallery__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.demo-gallery__grid > li + li {
  margin-top: 0;
}

/* ── Card ────────────────────────────────────────────────────────────── */

.demo-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.demo-card__preview {
  position: relative;
  display: block;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  box-shadow: 0 0 0 1px var(--docs-ring);
  overflow: hidden;
  background: var(--docs-stage-bg);
}
.demo-card__preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}
.demo-card__preview:hover img {
  transform: scale(1.02);
}
@media (prefers-reduced-motion: reduce) {
  .demo-card__preview img {
    transition: none;
  }
  .demo-card__preview:hover img {
    transform: none;
  }
}
.demo-card__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
/* Light on the dark gradients, dark on the light one */
.demo-card__label {
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: #fff;
  mix-blend-mode: difference;
  opacity: 0.55;
}

.demo-card__classes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}
.demo-card__classes li + li {
  margin-top: 0;
}

.demo-card__title {
  margin: 12px 0 0;
  padding: 0;
  border: none;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: -0.01em;
}
.demo-card__title a {
  color: var(--vp-c-text-1);
  text-decoration: none;
}
.demo-card__title a:hover {
  color: var(--vp-c-brand-1);
}

.demo-card__description {
  margin: 8px 0 0;
  font-size: 15px;
  line-height: 1.65;
  color: var(--vp-c-text-2);
}
.demo-card__description :deep(code) {
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 0.85em;
  font-weight: 500;
  color: var(--vp-code-color);
  background: var(--vp-code-bg);
}

.demo-card__links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  margin: auto 0 0;
  padding-top: 12px;
  font-size: 14px;
  font-weight: 500;
}
.demo-card__link {
  color: var(--vp-c-text-2);
  text-decoration: none;
}
.demo-card__link:hover {
  color: var(--vp-c-text-1);
}
.demo-card__link--primary {
  color: var(--vp-c-brand-1);
}
.demo-card__link--primary:hover {
  color: var(--vp-c-brand-2);
}
</style>
