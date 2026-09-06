import { describe, expect, it } from 'vitest'
import { escapeHtml } from './html'

describe('escapeHtml', () => {
  it('passes plain text through unchanged', () => {
    expect(escapeHtml('Buy milk')).toBe('Buy milk')
  })

  it('escapes ampersands, angle brackets', () => {
    expect(escapeHtml('Tom & Jerry <script>')).toBe(
      'Tom &amp; Jerry &lt;script&gt;',
    )
  })

  it('escapes ampersands before angle brackets, not double-escaping the result', () => {
    // If '&' were escaped after '<'/'>' , the '&lt;' produced by escaping '<'
    // would itself get re-escaped into '&amp;lt;' — wrong.
    expect(escapeHtml('<')).toBe('&lt;')
  })
})
