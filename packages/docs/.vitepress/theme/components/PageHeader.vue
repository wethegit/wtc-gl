<script setup lang="ts">
import { computed } from 'vue'
import { useData, useRoute, withBase } from 'vitepress'
import type { DefaultTheme } from 'vitepress'

// The sidebar group the current page is in, shown above its title
const { theme } = useData()
const route = useRoute()

const normalise = (path: string) =>
  path.replace(/\.(md|html)$/, '').replace(/\/index$/, '/')

const section = computed(() => {
  const here = normalise(route.path)
  const sidebar = theme.value.sidebar as Record<
    string,
    DefaultTheme.SidebarItem[]
  >
  const find = (
    items: DefaultTheme.SidebarItem[],
    group?: string
  ): string | undefined => {
    for (const item of items) {
      const label = item.items ? item.text : group
      if (item.link && normalise(withBase(item.link)) === here) return label
      if (item.items) {
        const found = find(item.items, label)
        if (found) return found
      }
    }
  }
  for (const items of Object.values(sidebar ?? {})) {
    const found = find(items)
    if (found) return found
  }
  return undefined
})
</script>

<template>
  <p v-if="section" class="page-section">{{ section }}</p>
</template>
