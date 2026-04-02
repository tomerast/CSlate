import { describe, it, expect } from 'vitest'
import { classifyCommand } from '../permissions'

describe('bash permissions classifier', () => {
  it('allows read operations', () => {
    expect(classifyCommand('cat package.json')).toBe('allow')
    expect(classifyCommand('ls -la')).toBe('allow')
    expect(classifyCommand('head -20 src/index.ts')).toBe('allow')
    expect(classifyCommand('tail -f logs/app.log')).toBe('allow')
    expect(classifyCommand('pwd')).toBe('allow')
    expect(classifyCommand('echo hello')).toBe('allow')
    expect(classifyCommand('find . -name "*.ts"')).toBe('allow')
  })

  it('allows build and lint commands', () => {
    expect(classifyCommand('tsc --noEmit')).toBe('allow')
    expect(classifyCommand('eslint src/')).toBe('allow')
    expect(classifyCommand('prettier --check src/')).toBe('allow')
    expect(classifyCommand('npm run build')).toBe('allow')
    expect(classifyCommand('npx tsc')).toBe('allow')
  })

  it('allows git read commands', () => {
    expect(classifyCommand('git status')).toBe('allow')
    expect(classifyCommand('git log --oneline')).toBe('allow')
    expect(classifyCommand('git diff HEAD')).toBe('allow')
  })

  it('prompts for destructive file operations', () => {
    expect(classifyCommand('rm -rf dist/')).toBe('prompt')
    expect(classifyCommand('rm file.ts')).toBe('prompt')
    expect(classifyCommand('rmdir old/')).toBe('prompt')
  })

  it('prompts for git write operations', () => {
    expect(classifyCommand('git push origin main')).toBe('prompt')
    expect(classifyCommand('git reset --hard HEAD~1')).toBe('prompt')
    expect(classifyCommand('git checkout -- .')).toBe('prompt')
  })

  it('prompts for network and install commands', () => {
    expect(classifyCommand('npm install lodash')).toBe('prompt')
    expect(classifyCommand('curl https://example.com')).toBe('prompt')
    expect(classifyCommand('wget https://example.com/file')).toBe('prompt')
  })

  it('prompts for process management', () => {
    expect(classifyCommand('kill 1234')).toBe('prompt')
    expect(classifyCommand('pkill node')).toBe('prompt')
  })

  it('denies eval and shell escape', () => {
    expect(classifyCommand('eval "rm -rf /"')).toBe('deny')
    expect(classifyCommand('bash -c "dangerous"')).toBe('deny')
    expect(classifyCommand('sh -c "rm /etc/passwd"')).toBe('deny')
  })

  it('denies access to sensitive files', () => {
    expect(classifyCommand('cat .env')).toBe('deny')
    expect(classifyCommand('cat .env.production')).toBe('deny')
    expect(classifyCommand('cat ~/.ssh/id_rsa')).toBe('deny')
  })
})
