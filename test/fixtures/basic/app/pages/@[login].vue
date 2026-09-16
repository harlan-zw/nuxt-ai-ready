<script setup lang="ts">
import { useRoute, useSeoMeta } from '#imports'

// A profile namespace at /@login, the shape Mastodon, Bluesky and skilld.dev
// use. Vite's dev internals also live under /@, so this page is the fixture
// that keeps the two apart.
const route = useRoute()
const login = String(route.params.login ?? '')

useSeoMeta({
  title: `@${login} · Test Site`,
  description: `Everything @${login} publishes on the test site.`,
})
</script>

<template>
  <div>
    <h1>@{{ login }} · Test Site</h1>
    <p>Everything @{{ login }} publishes on the test site.</p>
  </div>
</template>
