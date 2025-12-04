<script lang="ts" setup>
const path = useRoute().path

const mdPath = computed(() => {
  return `${path}.md`
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
