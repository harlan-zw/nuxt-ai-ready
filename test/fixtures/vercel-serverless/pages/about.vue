<template>
  <div>
    <h1>About</h1>
    <p>This is a test page to verify markdown conversion and database storage work on Vercel serverless.</p>

    <h2>Features Tested</h2>
    <ul>
      <li>Auto-detection of Vercel environment</li>
      <li>Auto-upgrade from SQLite to Neon Postgres</li>
      <li>Database connection via POSTGRES_URL</li>
      <li>Page indexing and retrieval</li>
    </ul>

    <NuxtLink to="/">← Back to home</NuxtLink>
  </div>
</template>
