import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Clawd, Mood } from '../types'
import type { SpriteProps } from './sprite'

const clawd = atom({ plugin: 'clawd-buddy', key: 'clawd' } as const, {
  mood: 'idle',
  since: 0,
  tool: null,
  play: null,
  playFrom: 0,
} as Clawd)
const frame = atom({ plugin: 'clawd-buddy', key: 'frame' } as const, 0)
// Claude Code's own spinner tips (its tips are switched off in settings), one
// picked per prompt and shown beside Clawd while the turn runs.
const TIPS = [
  'Use git worktrees to run multiple Claude sessions in parallel.',
  'Running multiple Claude sessions? Use /color and /rename to tell them apart at a glance.',
  'Use /memory to view and manage Claude memory',
  'Use /theme to change the color theme',
  'Use /statusline to set up a custom status line that will display beneath the input box',
  'Hit Enter to queue up additional messages while Claude is working.',
  'Send messages to Claude while it works to steer Claude in real-time',
  'Use /permissions to pre-approve and pre-deny bash, edit, and MCP tools',
  'Did you know you can drag and drop image files into your terminal?',
  'Double-tap esc to rewind the code and/or conversation to a previous point in time',
  'Run claude --continue or claude --resume to resume a conversation',
  'Name your conversations with /rename to find them easily in /resume later',
  'Create skills by adding .md files to .claude/skills/ in your project or ~/.claude/skills/ for skills that work in any project',
  'Hit shift+tab to cycle between manual mode, auto-accept edit mode, and plan mode',
  'Use ctrl+v to paste images from your clipboard',
  'Use --agent <agent_name> to directly start a conversation with a subagent',
  'Try the new fullscreen renderer — flicker-free output, mouse support, auto-copy on select · /tui fullscreen',
]
let tip = TIPS[0] ?? ''

// The engine's spinner and turn-duration lines, hidden where the engine draws them
// and drawn beside Clawd instead. Drawing may not write state, so they live here;
// the band redraws every tick anyway.
let spin: { word: string; suffix: string } | null = null
// The frame the turn began on; its elapsed time is counted in ticks.
let turnStart = 0
let streamed = 0
let done: { word: string | null; durationMs: number } | null = null

// No `✳`: Windows draws it as a green emoji.
const SPIN_GLYPHS = ['·', '✢', '*', '✶', '✻', '✽']

// As the engine writes them: `18s`, `1m 4s`; `1.2k`.
const duration = (ms: number) => {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}
const tokens = (n: number) => (n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`)

// Claude Code's own Clawd steps its click animations every 60 ms.
const TICK_MS = 60
const BODY = 'rgb(215,119,87)'
const WIDTH = 9
const ROWS = 3
// Clawd stands on the band's bottom row; the row above is room to hop into.
const BASE = 1

// Frames a passing mood lasts before Clawd settles again.
const TTL: Partial<Record<Mood, number>> = { error: 40, happy: 45, surprised: 50, sad: 80 }
const SLEEP_AFTER = 1500
const IDLE_PLAY_EVERY = 200
// Most tools finish in milliseconds; Clawd keeps acting one out for at least this long.
const TOOL_MIN = 33

// The sprite, as Claude Code draws it: arms around a row of eyes, a body row, feet.
// `▂` in an eye row is a shut lid, drawn inverted so it reads as a dark slit.
type Eyes = 'open' | 'closed' | 'wink'
type Arms = 'down' | 'up' | 'one-up' | 'left-up'
type Feet = 'both' | 'left' | 'right'
type Facing = keyof typeof TURN

const ARMS: Record<Arms, { r1L: string; r1R: string; r2L: string; r2R: string }> = {
  down: { r1L: ' ▐', r1R: '', r2L: '▝▜', r2R: '█▀' },
  up: { r1L: '▗▟', r1R: '▄', r2L: ' ▜', r2R: '█▘' },
  'one-up': { r1L: ' ▐', r1R: '▄', r2L: '▝▜', r2R: '█▘' },
  // The mirror of `one-up`, not one of Claude Code's own: the left arm raised.
  'left-up': { r1L: '▗▟', r1R: '', r2L: ' ▜', r2R: '█▀' },
}
const EYES: Record<Eyes, string> = {
  open: '▛███▛█',
  closed: '▂███▂█',
  wink: '▛███▂█',
}
const FEET: Record<Feet, string> = { both: ' ▝▝   ▝▝ ', left: ' ▝▝      ', right: '      ▝▝ ' }
// Clawd turning round on the spot, a quarter view at a time.
const TURN = {
  'right-12': [' ▐█▜██▛█ ', '▝▜██████▀', ' ▝▝   ▝▝ '],
  'right-30': ['  █▛██▛▌ ', ' ▝█████▛ ', '  ▘▘  ▘▘ '],
  'right-55': ['  ▐█▛█▜  ', '  ▐████  ', '  ▝▝ ▝▝  '],
  'right-75': ['   ██▛▌  ', '   ███▌  ', '   ▘  ▘  '],
  edge: ['   ▐██   ', '   ▐██   ', '   ▝ ▝   '],
  'back-105': ['   ███▌  ', '   ███▌  ', '   ▘  ▘  '],
  'back-125': ['  ▐████  ', '  ▐████  ', '  ▝▝ ▝▝  '],
  'back-150': ['  █████▌ ', ' ▝█████▛ ', '  ▘▘  ▘▘ '],
  back: [' ▐██████ ', '▝▜██████▀', ' ▝▝   ▝▝ '],
  'left-75': ['   ▛██▌  ', '   ███▌  ', '   ▘  ▘  '],
  'left-55': ['  ▐▜▛██  ', '  ▐████  ', '  ▝▝ ▝▝  '],
  'left-30': ['  ▛██▛█▌ ', ' ▝█████▛ ', '  ▘▘  ▘▘ '],
  'left-12': [' ▐▛███▜█ ', '▝▜██████▀', ' ▝▝   ▝▝ '],
} as const

type Pose = { eyes: Eyes; arms: Arms; feet: Feet } | { facing: Facing }
type Frame = { pose: Pose; offset: number; x: number; poof?: 'dot' | 'wave'; shadow?: 'wide' | 'narrow' }

const ho = (eyes: Eyes, arms: Arms = 'down', feet: Feet = 'both'): Pose => ({ eyes, arms, feet })
const NAMED = {
  default: ho('open'),
  'arms-up': ho('open', 'up'),
  // Claude Code glances sideways here; that reads as looking up, so Clawd shuts his eyes instead.
  'look-left': ho('closed'),
  'look-right': ho('closed'),
}
const REST: Frame = { pose: NAMED.default, offset: 0, x: 0 }

const Ne = (pose: Pose | keyof typeof NAMED, n: number, o: Partial<Omit<Frame, 'pose'>> = {}): Frame[] =>
  Array.from({ length: n }, () => ({
    pose: typeof pose === 'string' ? NAMED[pose] : pose,
    offset: o.offset ?? 0,
    x: o.x ?? 0,
    poof: o.poof,
    shadow: o.shadow,
  }))
const Br = (): Frame[] => [
  { ...REST, offset: 1, poof: 'dot' },
  { ...REST, offset: 1, poof: 'wave' },
]
const Or = (faces: Facing[], shadow?: 'wide' | 'narrow'): Frame[] =>
  faces.map(facing => ({ pose: { facing }, offset: 0, x: 0, shadow }))
const Ls = [...Ne(ho('closed'), 1), REST]

// Claude Code's own click animations, frame for frame.
const jump = [...Br(), ...Ne('arms-up', 3), ...Ne('default', 1), ...Br(), ...Ne('arms-up', 3), ...Ne('default', 1)]
const SEQUENCES: Record<string, Frame[]> = {
  jump,
  look: [...Ne('look-right', 5), ...Ne('look-left', 5), ...Ne('default', 1)],
  celebrate: [...jump, ...Ne('default', 3, { offset: 1 })],
  skip: [
    ...Ne('default', 1, { offset: 1, x: -9 }),
    ...Ne('arms-up', 2, { x: -6 }),
    ...Ne('default', 1, { x: -6 }),
    ...Ne('default', 1, { offset: 1, x: -6 }),
    ...Ne('arms-up', 2, { x: -3 }),
    ...Ne('default', 1, { x: -3 }),
    ...Ne('default', 1, { offset: 1, x: -3 }),
    ...Ne('arms-up', 2),
    ...Br(),
    ...Ne('default', 1),
  ],
  spin: [
    ...Ne('look-left', 2),
    ...Ne('look-right', 2),
    ...Ne('look-left', 2),
    ...Ne('arms-up', 3),
    ...Ne('default', 1),
  ],
  peekaboo: [
    ...Ne('default', 1, { offset: 3 }),
    ...Ne('default', 3, { offset: 2 }),
    ...Ne('look-right', 3, { offset: 2 }),
    ...Ne('look-left', 3, { offset: 2 }),
    ...Ne('default', 2, { offset: 2 }),
    ...Ne('default', 1, { offset: 1 }),
    ...Ne('arms-up', 4),
    ...Ne('default', 2),
    ...Ls,
  ],
  drop: [
    ...Ne('arms-up', 1, { offset: -3 }),
    ...Ne('arms-up', 2, { offset: -2 }),
    ...Ne('arms-up', 2, { offset: -1 }),
    ...Ne('arms-up', 1),
    ...Br(),
    ...Ne('default', 3),
    ...Ls,
  ],
  waddle: [
    ...Ne('look-right', 1, { x: -9 }),
    ...[-6, -5, -4, -3, -2, -1].flatMap(x => Ne(ho('open', 'down', x % 2 === 0 ? 'left' : 'right'), 2, { x })),
    ...Ne('look-right', 2),
    ...Ne('default', 2),
    ...Ls,
  ],
  peek: [
    ...Ne('look-right', 1, { x: -9 }),
    ...Ne('look-right', 5, { x: -6 }),
    ...Ne('look-right', 3, { x: -9 }),
    ...Ne('look-right', 4, { x: -5 }),
    ...Ne('arms-up', 2, { x: -3 }),
    ...Ne('arms-up', 2),
    ...Br(),
    REST,
  ],
  wink: [...Ne(ho('wink'), 5), REST],
  boop: [
    ...Ne(ho('closed'), 1, { offset: 1, poof: 'dot' }),
    ...Ne(ho('closed'), 2, { offset: 1, poof: 'wave' }),
    ...Ne('look-left', 4),
    ...Ne('default', 2),
    ...Ls,
  ],
  tap: [
    ...Ne(ho('open', 'down', 'left'), 2),
    ...Ne(ho('open', 'down', 'right'), 2),
    ...Ne(ho('open', 'down', 'left'), 2),
    ...Ne(ho('open', 'down', 'right'), 2),
    ...Ne(ho('open', 'down', 'left'), 1),
    ...Ne(ho('open', 'down', 'right'), 1),
    ...Ne('arms-up', 3),
    REST,
  ],
  sneeze: [
    ...Ne(ho('closed', 'up'), 4),
    ...Ne(ho('closed'), 2, { offset: 1, poof: 'wave' }),
    ...Ne(ho('closed'), 2),
    ...Ne('default', 2),
    ...Ls,
  ],
  turn: [
    ...Or(['right-12', 'right-30', 'right-55', 'right-75', 'edge']),
    ...Or(['back-105', 'back-125', 'back-150', 'back', 'back']),
    ...Or(['back-150', 'back-125', 'back-105', 'edge']),
    ...Or(['left-75', 'left-55', 'left-30', 'left-12']),
    REST,
  ],
  'coin-hop': [
    ...Ne('default', 2, { offset: 1 }),
    ...Ne('arms-up', 1, { shadow: 'wide' }),
    ...Or(['right-55', 'edge', 'back-125', 'back'], 'narrow'),
    ...Or(['back-125', 'edge', 'left-55'], 'narrow'),
    ...Ne('arms-up', 1, { shadow: 'wide' }),
    ...Br(),
    REST,
  ],
}
const POKES = Object.keys(SEQUENCES).filter(n => !['celebrate', 'look', 'spin'].includes(n))
const IDLE_PLAYS = ['wink', 'tap', 'jump', 'boop']
// Tricks that suit Clawd mid-thought: none that has him walk in from the side.
const THINKING_PLAYS = ['wink', 'tap', 'jump', 'boop', 'sneeze', 'coin-hop', 'turn']
// Chance per frame while thinking: one trick every eight seconds or so.
const THINKING_PLAY_CHANCE = 1 / 130

const moodOf = (tool: string): Mood => {
  if (/^(Read|Grep|Glob|LS|NotebookRead)$/.test(tool)) return 'reading'
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return 'editing'
  if (/^(WebSearch|WebFetch)$/.test(tool) || /chrome|browser/i.test(tool)) return 'browsing'
  if (/^(Agent|Task)$/.test(tool)) return 'delegating'
  return 'running'
}

type Scene = Frame & { walk: number; label: string; color?: string }

// Position on a back-and-forth walk.
const pace = (t: number, span: number) => {
  const p = t % (span * 2)
  return p < span ? p : span * 2 - p
}

// A short shut every `period` frames, a double blink every third time.
const blinks = (f: number, period: number) => f % period === 0 || f % (period * 3) === 3

const still = (pose: Pose, o: Partial<Scene> = {}): Scene => ({ ...REST, pose, walk: 0, label: '', ...o })

const scene = (c: Clawd, f: number, isWorking: boolean): Scene => {
  const age = f - c.since
  const shut = (eyes: Eyes, period: number): Eyes => (blinks(f, period) ? 'closed' : eyes)

  switch (c.mood) {
    case 'thinking':
      // Eyes shut for a while now and then, mulling it over.
      return still(ho(f % 100 >= 70 ? 'closed' : shut('open', 50)))
    case 'reading':
      // Strolls along, a step every quarter second.
      return still(ho(shut('open', 60), 'down', (f >> 2) % 2 ? 'left' : 'right'), { walk: pace(f >> 2, 6) })
    case 'running':
      return still(ho(shut('open', 60), 'down', (f >> 1) % 2 ? 'left' : 'right'), { walk: pace(f >> 1, 10) })
    case 'editing': {
      // Types: a burst of left-right keystrokes, then a short pause to read it back.
      const p = f % 30
      const arms = p < 18 ? ((p >> 1) % 2 ? 'left-up' : 'one-up') : 'down'
      return still(ho(shut('open', 50), arms))
    }
    case 'browsing':
      return still(ho(f % 64 >= 48 ? 'closed' : shut('open', 60)))
    case 'delegating':
      return still(ho(shut('open', 50), (f >> 3) % 2 ? 'up' : 'down'))
    case 'error':
      return still(ho('closed'), { offset: 1, walk: age < 16 ? (f >> 1) % 2 : 0 })
    case 'happy':
      return still(ho(shut('open', 45), 'up'))
    case 'surprised':
      return still(ho('open', 'up'))
    case 'sad':
      return still(ho('closed'), { offset: 1 })
    default:
      if (!isWorking && age > SLEEP_AFTER) {
        return still(ho('closed'), { offset: 1, label: 'zZz'.slice(0, ((f >> 4) % 3) + 1) })
      }
      return still(ho(shut('open', 45)))
  }
}

// The frame of an animation that is playing, over whatever the mood draws.
const current = (c: Clawd, f: number, isWorking: boolean): Scene => {
  const s = scene(c, f, isWorking)
  const step = c.play === null ? undefined : SEQUENCES[c.play]?.[f - c.playFrom]
  if (c.play === null || step === undefined) {
    return s
  }
  return { ...s, ...step }
}

const rowsOf = (pose: Pose): string[] => {
  if ('facing' in pose) {
    return [...TURN[pose.facing]]
  }
  const a = ARMS[pose.arms]
  return [a.r1L + EYES[pose.eyes] + a.r1R, a.r2L + '█████' + a.r2R, FEET[pose.feet]]
}

const setMood = async ($: EngineInterface, mood: Mood, tool: string | null = null) => {
  lingering = false
  const f = await read($, frame)
  await update($, clawd, c => ({ ...c, mood, since: f, tool }))
}

const startPlay = async ($: EngineInterface, name: string) => {
  const f = await read($, frame)
  await update($, clawd, c => ({ ...c, play: name, playFrom: f }))
}

const pick = (names: string[]) => names[Math.floor(Math.random() * names.length)] ?? 'jump'

// Recent pokes, so a flurry of them spins Clawd round.
let pokes: number[] = []
let lastIdlePlay = 0
// A tool has finished but its animation is still playing out; Clawd goes back to thinking after.
let lingering = false
// Switched off with /clawd: the engine draws its own lines again and Clawd stands still.
// Kept in the plugin's store, so it holds across sessions.
let isOff = false

const poke = async ($: EngineInterface) => {
  const f = await read($, frame)
  pokes = [...pokes.filter(p => f - p < 35), f]
  await startPlay($, pokes.length >= 4 ? 'turn' : pick(POKES))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isOff = (await $.store.get('isOff')) === true
    await $.command.register({
      name: 'clawd',
      description: 'Show or hide Clawd above the prompt',
      argumentHint: '[on|off]',
    })
    $.clock.every(TICK_MS, async () => {
      if (isOff) {
        return
      }
      const f = (await read($, frame)) + 1
      await update($, frame, () => f)
      const c = await read($, clawd)
      const seq = c.play === null ? undefined : SEQUENCES[c.play]
      if (c.play !== null && (seq === undefined || f - c.playFrom >= seq.length)) {
        await update($, clawd, x => ({ ...x, play: null }))
      }
      if (lingering && f - c.since >= TOOL_MIN) {
        lingering = false
        await update($, clawd, (x): Clawd => ({ ...x, mood: 'thinking', since: f, tool: null }))
      }
      const ttl = TTL[c.mood]
      if (ttl !== undefined && f - c.since > ttl) {
        const mood: Mood = c.mood === 'error' ? 'thinking' : 'idle'
        await update($, clawd, x => ({ ...x, mood, since: f, tool: null }))
      }
      if (c.mood === 'thinking' && c.play === null && Math.random() < THINKING_PLAY_CHANCE) {
        await startPlay($, pick(THINKING_PLAYS))
      }
      // Now and then, standing around, Clawd plays one of his own tricks.
      if (c.mood === 'idle' && c.play === null && f - lastIdlePlay > IDLE_PLAY_EVERY && f - c.since < SLEEP_AFTER) {
        lastIdlePlay = f
        if (f - c.since > 60) {
          await startPlay($, pick(IDLE_PLAYS))
        }
      }
    })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    tip = pick(TIPS)
    turnStart = await read($, frame)
    streamed = 0
    done = null
    await setMood($, 'thinking')

    return next(e)
  })

  // Counts what the model streams, for the spinner's token estimate (about four characters a token).
  on('turn.step', async function* ($, e, next) {
    const stream = next(e)
    for await (const chunk of stream) {
      if (e.agentId === undefined) {
        streamed +=
          chunk.kind === 'text' || chunk.kind === 'thinking'
            ? chunk.text.length
            : chunk.kind === 'input'
              ? chunk.json.length
              : 0
      }
      yield chunk
    }

    return stream.result
  })

  on('command.run', { command: 'clawd' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    isOff = arg === 'off' ? true : arg === 'on' ? false : !isOff
    await $.store.set('isOff', isOff)
    $.ui.invalidate('ui.render')

    return { text: isOff ? 'Clawd is hidden. /clawd on brings him back.' : 'Clawd is back.' }
  })

  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    if (isOff) {
      return next(e)
    }
    spin = { word: e.props.message ?? e.props.word, suffix: e.props.suffix }
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  // Every turn's closing line is hidden; the latest one's word is kept for beside Clawd.
  on('ui.render', { component: 'TurnDuration' }, ($, e, next) => {
    if (isOff) {
      return next(e)
    }
    if (done !== null && e.props.durationMs === done.durationMs) {
      done = { ...done, word: e.props.word }
    }
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  on('tool.call', async ($, e, next) => {
    await setMood($, moodOf(e.tool), e.tool)
    const r = await next(e)
    if (r.deny !== undefined || r.isError) {
      await setMood($, 'error')
    } else {
      const c = await read($, clawd)
      if ((await read($, frame)) - c.since >= TOOL_MIN) {
        await setMood($, 'thinking')
      } else {
        lingering = true
      }
    }

    return r
  })

  on('ui.message', async ($, e, next) => {
    if (e.data === 'poke') {
      await poke($)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      spin = null
      done = { word: null, durationMs: e.durationMs }
      const mood: Mood = e.reason === 'answer' ? 'happy' : e.reason === 'aborted' ? 'surprised' : 'sad'
      await setMood($, mood)
      if (mood === 'happy') {
        await startPlay($, 'celebrate')
      } else if (mood === 'surprised') {
        await startPlay($, 'drop')
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (isOff || e.props.hasSurvey) {
      return next(e)
    }

    const table = $.ui.resolve(e)
    const { Box, Text } = table
    const Client = 'Client' in table ? table.Client : undefined
    const f = await read($, frame)
    const s = current(await read($, clawd), f, e.props.isWorking)
    const glyph = SPIN_GLYPHS[pace(f >> 1, SPIN_GLYPHS.length - 1)] ?? '✶'
    const elapsed = duration((f - turnStart) * TICK_MS)
    const counted = streamed >= 4 ? ` · ↓ ${tokens(Math.round(streamed / 4))} tokens` : ''
    const rows = rowsOf(s.pose).map(row =>
      row
        .split(/(▂+)/)
        .filter(Boolean)
        .map(text => ({ text, lid: text.startsWith('▂') })),
    )
    const sprite: SpriteProps = { rows, color: BODY }
    const poof = s.poof === 'dot' ? '·' : s.poof === 'wave' ? '~' : undefined
    const shadow =
      s.shadow === 'wide' ? { glyphs: '▁▁▁', left: 3 } : s.shadow === 'narrow' ? { glyphs: '▁', left: 4 } : undefined

    return (
      <Box flexDirection="row" alignItems="center">
        <Box marginLeft={s.walk} width={WIDTH} height={ROWS + 1} flexDirection="column" overflow="hidden">
          <Box marginTop={BASE + s.offset} marginLeft={s.x} flexDirection="column" flexShrink={0}>
            {Client ? (
              <Client key="clawd" module="./sprite.tsx" props={sprite} width={WIDTH} height={ROWS} />
            ) : (
              rows.map(row => (
                <Text>
                  {row.map(run => (
                    <Text color={BODY} inverse={run.lid}>
                      {run.text}
                    </Text>
                  ))}
                </Text>
              ))
            )}
          </Box>
          {poof && s.offset > 0 ? (
            <Box position="absolute" top={BASE + ROWS - 1} left={0}>
              <Text color="inactive">{poof}</Text>
            </Box>
          ) : null}
          {poof && s.offset > 0 ? (
            <Box position="absolute" top={BASE + ROWS - 1} right={0}>
              <Text color="inactive">{poof}</Text>
            </Box>
          ) : null}
          {shadow ? (
            <Box position="absolute" top={BASE + ROWS - 1} left={shadow.left}>
              <Text color="inactive">{shadow.glyphs}</Text>
            </Box>
          ) : null}
        </Box>
        <Box marginLeft={12 - s.walk} flexDirection="column" flexShrink={1}>
          {e.props.isWorking ? (
            <Text color={BODY}>
              {glyph} {spin ? spin.word + spin.suffix : 'Working…'} <Text dimColor>({elapsed}{counted})</Text>
            </Text>
          ) : null}
          {e.props.isWorking ? <Text dimColor>⎿  Tip: {tip}</Text> : null}
          {!e.props.isWorking && done !== null && s.label === '' ? (
            <Text dimColor>
              ✻ {done.word ?? 'Worked'} for {duration(done.durationMs)}
            </Text>
          ) : null}
          {s.label !== '' ? <Text dimColor>{s.label}</Text> : null}
        </Box>
      </Box>
    )
  })
}
