import { describe, expect, it } from 'vitest'
import { markdownToPreviewText } from './message-preview'

describe('markdownToPreviewText', () => {
  it('strips inline markdown formatting markers', () => {
    expect(
      markdownToPreviewText('This has **bold**, _italic_, `code`, and ~~strike~~.'),
    ).toBe('This has bold, italic, code, and strike.')
  })

  it('keeps readable text for links, headings, quotes, and lists', () => {
    const input = [
      '# Heading',
      '',
      '> Quoted line',
      '',
      '- First item',
      '1. Second item',
      '',
      'See [the docs](https://example.com).',
    ].join('\n')

    expect(markdownToPreviewText(input)).toBe(
      ['Heading', '', 'Quoted line', 'First item', 'Second item', '', 'See the docs.'].join(
        '\n',
      ),
    )
  })

  it('drops fenced code markers without leaking backticks', () => {
    const input = ['Before', '```ts', 'const x = 1', '```', 'After'].join('\n')

    expect(markdownToPreviewText(input)).toBe(
      ['Before', 'const x = 1', 'After'].join('\n'),
    )
  })
})
