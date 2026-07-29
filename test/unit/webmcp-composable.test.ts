// @vitest-environment happy-dom

import type { WebMcpModelContext, WebMcpTool, WebMcpToolRegistrationState } from '../../src/runtime/webmcp'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h, KeepAlive, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { useWebMcpTool } from '../../src/runtime/app/composables/webmcp'
import { setWebMcpDefaults } from '../../src/runtime/app/webmcp-config'

const tool: WebMcpTool = {
  name: 'noop',
  description: 'Does nothing.',
  execute: () => ({ ok: true }),
}

function mountTool(enabled = ref(true)) {
  let state: Readonly<{ value: WebMcpToolRegistrationState }> | undefined
  const component = defineComponent({
    setup() {
      const registration = useWebMcpTool(tool, { enabled })
      state = registration.state
      return () => h('div')
    },
  })
  return { wrapper: mount(component), state: () => state! }
}

afterEach(() => {
  delete (document as Document & { modelContext?: WebMcpModelContext }).modelContext
  setWebMcpDefaults({})
})

describe('useWebMcpTool', () => {
  function setModelContext(modelContext: WebMcpModelContext) {
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: modelContext,
    })
  }

  it('keeps support false during SSR and exposes registration success after mount', async () => {
    const modelContext = { registerTool: vi.fn(() => Promise.resolve()) } as unknown as WebMcpModelContext
    setModelContext(modelContext)

    const serverState = ref<WebMcpToolRegistrationState>()
    await renderToString(createSSRApp(defineComponent({
      setup() {
        serverState.value = useWebMcpTool(tool).state.value
        return () => h('div')
      },
    })))
    expect(serverState.value?._tag).toBe('Unsupported')
    expect(modelContext.registerTool).not.toHaveBeenCalled()

    const { wrapper, state } = mountTool()
    await flushPromises()
    expect(state().value._tag).toBe('Registered')
    wrapper.unmount()
  })

  it('reacts to enabled state', async () => {
    const modelContext = { registerTool: vi.fn(() => Promise.resolve()) } as unknown as WebMcpModelContext
    setModelContext(modelContext)
    const enabled = ref(false)
    const { wrapper, state } = mountTool(enabled)

    await flushPromises()
    expect(state().value._tag).toBe('Inactive')
    expect(modelContext.registerTool).not.toHaveBeenCalled()

    enabled.value = true
    await nextTick()
    await flushPromises()
    expect(state().value._tag).toBe('Registered')
    expect(modelContext.registerTool).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('unregisters while a kept-alive tool is deactivated', async () => {
    const signals: AbortSignal[] = []
    const modelContext = {
      registerTool: vi.fn((_tool, options) => {
        signals.push(options.signal)
        return Promise.resolve()
      }),
    } as unknown as WebMcpModelContext
    setModelContext(modelContext)
    const visible = ref(true)
    const child = defineComponent({
      setup() {
        useWebMcpTool(tool)
        return () => h('div')
      },
    })
    const wrapper = mount(defineComponent({
      setup: () => () => h(KeepAlive, null, {
        default: () => visible.value ? h(child) : h('div'),
      }),
    }))

    await flushPromises()
    expect(signals[0]?.aborted).toBe(false)

    visible.value = false
    await nextTick()
    expect(signals[0]?.aborted).toBe(true)
    wrapper.unmount()
  })

  it('surfaces registration failure', async () => {
    const error = new Error('duplicate tool')
    const modelContext = { registerTool: vi.fn(() => Promise.reject(error)) } as unknown as WebMcpModelContext
    setModelContext(modelContext)

    const { wrapper, state } = mountTool()
    await flushPromises()
    expect(state().value).toEqual({ _tag: 'Failed', error })
    wrapper.unmount()
  })

  it('uses global origin exposure unless the tool overrides it', async () => {
    const options: Array<{ exposedTo?: string[] }> = []
    const modelContext = {
      registerTool: vi.fn((_tool, registerOptions) => {
        options.push(registerOptions)
        return Promise.resolve()
      }),
    } as unknown as WebMcpModelContext
    setModelContext(modelContext)
    setWebMcpDefaults({ exposedTo: ['https://agent.example.com'] })

    const global = mountTool()
    await flushPromises()
    expect(options[0]?.exposedTo).toEqual(['https://agent.example.com'])
    global.wrapper.unmount()

    let explicit: ReturnType<typeof useWebMcpTool> | undefined
    const wrapper = mount(defineComponent({
      setup() {
        explicit = useWebMcpTool(tool, { exposedTo: ['https://other.example.com'] })
        return () => h('div')
      },
    }))
    await flushPromises()
    expect(explicit?.state.value._tag).toBe('Registered')
    expect(options[1]?.exposedTo).toEqual(['https://other.example.com'])
    wrapper.unmount()
  })
})
