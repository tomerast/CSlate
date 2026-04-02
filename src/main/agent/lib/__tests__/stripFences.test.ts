import { describe, it, expect } from 'vitest'
import { stripFences } from '@cslate/shared/agent'

describe('stripFences', () => {
  it('strips jsx fences', () => {
    const input = '```jsx\nconst App = () => <div>Hello</div>\n```'
    const expected = 'const App = () => <div>Hello</div>'
    expect(stripFences(input)).toBe(expected)
  })

  it('strips tsx fences', () => {
    const input = '```tsx\nconst App: React.FC = () => <div>Hello</div>\n```'
    const expected = 'const App: React.FC = () => <div>Hello</div>'
    expect(stripFences(input)).toBe(expected)
  })

  it('strips typescript fences', () => {
    const input = '```typescript\ninterface Props { name: string }\n```'
    const expected = 'interface Props { name: string }'
    expect(stripFences(input)).toBe(expected)
  })

  it('strips javascript fences', () => {
    const input = '```javascript\nconst x = 42\n```'
    const expected = 'const x = 42'
    expect(stripFences(input)).toBe(expected)
  })

  it('strips ts fences', () => {
    const input = '```ts\ntype Foo = string\n```'
    const expected = 'type Foo = string'
    expect(stripFences(input)).toBe(expected)
  })

  it('strips js fences', () => {
    const input = '```js\nconsole.log("hi")\n```'
    const expected = 'console.log("hi")'
    expect(stripFences(input)).toBe(expected)
  })

  it('strips bare fences', () => {
    const input = '```\nconst foo = "bar"\n```'
    const expected = 'const foo = "bar"'
    expect(stripFences(input)).toBe(expected)
  })

  it('returns unchanged code without fences', () => {
    const input = 'const foo = "bar"'
    expect(stripFences(input)).toBe(input)
  })

  it('handles multiline code correctly', () => {
    const input = '```jsx\nconst App = () => {\n  return <div>Hello</div>\n}\n```'
    const expected = 'const App = () => {\n  return <div>Hello</div>\n}'
    expect(stripFences(input)).toBe(expected)
  })

  it('does not affect internal template literal backticks', () => {
    const input = '```tsx\nconst str = `Hello ${name}`\n```'
    const expected = 'const str = `Hello ${name}`'
    expect(stripFences(input)).toBe(expected)
  })

  it('preserves code with backticks but no fences', () => {
    const input = 'const str = `template literal`'
    expect(stripFences(input)).toBe(input)
  })

  it('handles empty code block', () => {
    const input = '```jsx\n\n```'
    const expected = ''
    expect(stripFences(input)).toBe(expected)
  })
})
