import { describe, expect, it } from 'vitest'
import { applyContentSignalPolicy, resolveContentSignalPolicy } from '../../src/utils/content-signal'

function robotsGroup(option: Parameters<typeof resolveContentSignalPolicy>[0]) {
  const groups: Record<string, unknown>[] = []
  applyContentSignalPolicy(groups, resolveContentSignalPolicy(option))
  return groups[0]
}

describe('content signal policy', () => {
  it('omits Content-Usage for a configured policy by default', () => {
    // Lighthouse 13.6.0 robots-txt fails Content-Usage as an unknown directive.
    const group = robotsGroup({ aiTrain: true, search: true, aiInput: true })

    expect(group).toEqual({
      userAgent: ['*'],
      disallow: [''],
      contentSignal: ['ai-train=yes, search=yes, ai-input=yes'],
    })
  })

  it('emits Content-Usage when contentUsage is true', () => {
    const group = robotsGroup({ aiTrain: false, contentUsage: true, search: true, aiInput: true })

    expect(group?.contentUsage).toEqual(['train-ai=n'])
    expect(group?.contentSignal).toEqual(['ai-train=no, search=yes, ai-input=yes'])
  })
})
