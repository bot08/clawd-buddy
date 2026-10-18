export type Mood =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'editing'
  | 'running'
  | 'browsing'
  | 'delegating'
  | 'error'
  | 'happy'
  | 'surprised'
  | 'sad'

// `play` is an animation running over the mood (a poke, a celebration), from frame `playFrom`.
export type Clawd = { mood: Mood; since: number; tool: string | null; play: string | null; playFrom: number }

declare module 'claude-code' {
  interface PluginState {
    'clawd-buddy': { clawd: Clawd; frame: number }
  }
}
