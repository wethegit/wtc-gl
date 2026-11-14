import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'

import Example from './components/Example.vue'
import PageHeader from './components/PageHeader.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      // The section name above each page's title, as on tailwindcss.com
      'doc-before': () => h(PageHeader)
    }),
  enhanceApp({ app }) {
    app.component('Example', Example)
  }
} satisfies Theme
