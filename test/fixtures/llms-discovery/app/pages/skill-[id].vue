<script setup lang="ts">
import { useHead, useRoute, useSeoMeta } from '#imports'

const route = useRoute()
useHead({ title: `Skill ${route.params.id}` })
useSeoMeta({ description: 'Install this skill.' })
</script>

<template>
  <main><h1>Skill {{ route.params.id }}</h1><p>Install this skill.</p></main>
</template>
