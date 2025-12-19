<script lang="ts" setup>
const path = useRoute().path

const mdPath = computed(() => {
  return `${path}.md`
})

useSeMeta({
  title: `Docs - ${path}`,
})
</script>

<template>
  <div>
    <p>{{ mdPath }}</p>
    <NuxtLink :to="mdPath">
      {{ mdPath }}
    </NuxtLink>
  </div>
</template>
