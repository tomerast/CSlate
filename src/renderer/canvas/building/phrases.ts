import type { BuildPhase } from './types'

export interface PhraseContext {
  componentName?: string
  file?: string
  task?: string
}

const pools: Record<BuildPhase, string[]> = {
  think: [
    'Let me think about this...',
    'Getting a feel for what you need...',
    'Thinking through the approach...',
    'Considering a few angles...',
    'Figuring out the best way to build this...',
    'On it...',
    "Let's see what makes sense here...",
    'Mulling this over...',
    "Looking at what we've built before...",
    'Checking for similar work...',
  ],
  plan: [
    'Sketching out {componentName}...',
    'Planning the structure...',
    'Mapping out the pieces...',
    'Deciding how to organize this...',
    'Laying the groundwork...',
    'Working out the details...',
    'Got a plan forming...',
    'Breaking this down...',
    'Figuring out the right files...',
    'Shaping {componentName}...',
  ],
  build: [
    'Writing {file}...',
    'Wiring up {task}...',
    'Putting {file} together...',
    'Working on {task}...',
    'Building out {file}...',
    'Getting {file} ready...',
    'Almost done with {file}...',
    'Finishing up {file}...',
    'Coding up the logic...',
    'Pulling the pieces together...',
  ],
  test: [
    'Putting it all together...',
    'Seeing if it runs...',
    'Checking everything fits...',
    'Assembling the pieces...',
    'Making sure it works...',
    'Trying it out...',
    'One last check...',
    'Wrapping things up...',
    'Running a quick test...',
    'Almost there...',
  ],
  done: [
    'All set!',
    'Here you go!',
    'Ready for you.',
    'Done!',
    'Built and ready.',
  ],
}

function fill(phrase: string, ctx: PhraseContext): string {
  let result = phrase
  if (ctx.componentName) result = result.replace('{componentName}', ctx.componentName)
  if (ctx.file) result = result.replace('{file}', ctx.file)
  if (ctx.task) result = result.replace('{task}', ctx.task)
  // Remove unfilled tokens — fall back to a generic phrase instead
  if (result.includes('{')) {
    const pool = pools['think']
    return pool[Math.floor(Math.random() * pool.length)]
  }
  return result
}

export function pickPhrase(phase: BuildPhase, ctx: PhraseContext): string {
  const pool = pools[phase]
  const phrase = pool[Math.floor(Math.random() * pool.length)]
  return fill(phrase, ctx)
}
