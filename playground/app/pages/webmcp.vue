<script setup lang="ts">
import { onMounted, onUnmounted, ref, useHead, useSeoMeta, useWebMcpTool } from '#imports'

interface RegisteredTool {
  name: string
  title?: string
  description: string
  inputSchema?: string
  origin: string
  annotations?: Record<string, boolean>
}

interface ModelContext extends EventTarget {
  getTools: () => Promise<RegisteredTool[]>
  executeTool: (tool: RegisteredTool, input: string) => Promise<unknown>
}

useSeoMeta({
  title: 'WebMCP harness',
  description: 'Inspect and run the WebMCP tools this site registers with in-browser AI agents, including the built-in page tools.',
})
useHead({ htmlAttrs: { lang: 'en' } })

const supported = ref<boolean | null>(null)
const tools = ref<RegisteredTool[]>([])
const inputs = ref<Record<string, string>>({})
const outputs = ref<Record<string, string>>({})
const counter = ref(0)
const formStatus = ref('Waiting for a submit.')
const greeting = ref('')

function modelContext(): ModelContext | undefined {
  return (globalThis.document as Document & { modelContext?: ModelContext })?.modelContext
}

useWebMcpTool({
  name: 'set_counter',
  title: 'Set counter',
  description: 'Sets the demo counter on this page to a whole number between 0 and 100.',
  inputSchema: {
    type: 'object',
    properties: {
      value: { type: 'number', description: 'The number to set the counter to.' },
    },
    required: ['value'],
  },
  execute: ({ value }) => {
    const next = Math.round(Number(value))
    if (!Number.isFinite(next) || next < 0 || next > 100)
      return { content: [{ type: 'text', text: 'The counter must be a whole number between 0 and 100.' }], isError: true }
    counter.value = next
    return `Counter set to ${next}.`
  },
})

function onGreetSubmit(event: SubmitEvent) {
  event.preventDefault()
  const form = event.target as HTMLFormElement
  const name = String(new FormData(form).get('name') || '').trim()
  const message = name ? `Hello, ${name}!` : 'Please provide a name.'
  greeting.value = message

  // respondWith is only valid for a submit the agent triggered
  if (event.agentInvoked) {
    formStatus.value = 'Submitted by an agent.'
    event.respondWith?.(Promise.resolve(message))
  }
  else {
    formStatus.value = 'Submitted by a person.'
  }
}

async function refresh() {
  const ctx = modelContext()
  supported.value = !!ctx
  if (!ctx)
    return
  tools.value = await ctx.getTools()
  for (const tool of tools.value)
    inputs.value[tool.name] ??= '{}'
}

function runTool(tool: RegisteredTool) {
  outputs.value[tool.name] = 'Running...'
  const context = modelContext()
  if (!context) {
    outputs.value[tool.name] = 'Error: WebMCP is unavailable.'
    return
  }
  context.executeTool(tool, inputs.value[tool.name] || '{}')
    .then((result) => {
      outputs.value[tool.name] = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
    })
    .catch((error: unknown) => {
      outputs.value[tool.name] = `Error: ${error instanceof Error ? error.message : String(error)}`
    })
}

let registeredContext: ModelContext | undefined

function refreshTools() {
  refresh().catch((error: unknown) => {
    console.error('[nuxt-ai-ready] Failed to inspect WebMCP tools.', error)
  })
}

function onToolActivated(event: Event) {
  const { toolName } = event as Event & { toolName: string }
  formStatus.value = `An agent activated ${toolName}.`
}

function onToolCancel(event: Event) {
  const { toolName } = event as Event & { toolName: string }
  formStatus.value = `The agent cancelled ${toolName}.`
}

onMounted(() => {
  registeredContext = modelContext()
  refreshTools()
  registeredContext?.addEventListener('toolchange', refreshTools)
  window.addEventListener('toolactivated', onToolActivated)
  window.addEventListener('toolcancel', onToolCancel)
})

onUnmounted(() => {
  registeredContext?.removeEventListener('toolchange', refreshTools)
  window.removeEventListener('toolactivated', onToolActivated)
  window.removeEventListener('toolcancel', onToolCancel)
})
</script>

<template>
  <main class="harness">
    <h1>WebMCP harness</h1>
    <p>
      Registers this site's built-in tools plus a page-scoped <code>set_counter</code> tool, then lets you run
      any of them without an agent.
    </p>

    <!-- fixed height: this flips after hydration and must not move the page -->
    <h2>Browser support</h2>
    <p class="status">
      <template v-if="supported === null">
        Checking for <code>document.modelContext</code>...
      </template>
      <template v-else-if="supported">
        <strong>Available.</strong> {{ tools.length }} tools registered.
      </template>
      <template v-else>
        <strong>Not available.</strong> Use Chrome 149+ with
        <code>chrome://flags/#enable-webmcp-testing</code> enabled, then reload.
      </template>
    </p>

    <h2>Page-scoped tool</h2>
    <p>
      The <code>set_counter</code> tool is registered by <code>useWebMcpTool()</code> in this page's setup, so it
      unregisters when you navigate away. Counter: <strong>{{ counter }}</strong>
    </p>

    <h2>Declarative form tool</h2>
    <p>
      This form becomes the <code>say_hello</code> tool through <code>toolname</code> and
      <code>tooldescription</code> alone, with no JavaScript registration.
    </p>
    <form
      toolname="say_hello"
      tooldescription="Greets a person by name and shows the greeting on the page."
      @submit="onGreetSubmit"
    >
      <label for="greet-name">Name to greet</label>
      <input
        id="greet-name"
        name="name"
        toolparamdescription="The name of the person to greet."
        autocomplete="name"
      >
      <button type="submit">
        Greet
      </button>
    </form>
    <p class="status">
      {{ formStatus }}<template v-if="greeting"> {{ greeting }}</template>
    </p>

    <!-- rendered last so filling it after hydration shifts nothing above -->
    <h2>Registered tools</h2>
    <div class="tools">
      <p v-if="!tools.length" class="muted">
        No tools registered yet.
      </p>
      <section v-for="tool in tools" :key="tool.name" class="tool">
        <h3>{{ tool.name }}</h3>
        <p>{{ tool.description }}</p>
        <p class="muted">
          Read only: {{ tool.annotations?.readOnlyHint ?? false }} ·
          Untrusted content: {{ tool.annotations?.untrustedContentHint ?? false }} ·
          Origin: {{ tool.origin }}
        </p>
        <details>
          <summary>Input schema</summary>
          <pre>{{ tool.inputSchema }}</pre>
        </details>
        <label :for="`input-${tool.name}`">Arguments as JSON</label>
        <textarea :id="`input-${tool.name}`" v-model="inputs[tool.name]" rows="3" spellcheck="false" />
        <button type="button" @click="runTool(tool)">
          Run {{ tool.name }}
        </button>
        <pre v-if="outputs[tool.name]" class="output">{{ outputs[tool.name] }}</pre>
      </section>
    </div>
  </main>
</template>

<style scoped>
.harness {
  font-family: system-ui, sans-serif;
  max-width: 52rem;
  margin: 2rem auto;
  padding: 0 1rem;
  line-height: 1.5;
}

/* reserve two lines so the hydrated message cannot reflow the page */
.status {
  min-height: 3rem;
}

.muted {
  color: #666;
  font-size: 0.875rem;
}

.tool {
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 1rem;
  margin: 1rem 0;
}

.tool h3 {
  margin-top: 0;
  font-family: ui-monospace, monospace;
}

label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

input,
textarea {
  display: block;
  width: 100%;
  margin-bottom: 0.5rem;
  font-family: ui-monospace, monospace;
}

pre {
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.output {
  background: #f4f4f4;
  padding: 0.75rem;
  border-radius: 4px;
}
</style>
