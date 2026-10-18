# clawd-buddy

A Claude Code mod that puts Clawd, the pixel crab, in the band above the prompt
and animates him according to what Claude is doing.

```
  ▐▛███▛█     ✶ Fiddle-faddling… (18s · ↓ 1.2k tokens)
 ▝▜██████▀    ⎿  Tip: Double-tap esc to rewind …
  ▝▝   ▝▝
```

The sprite, poses and click animations are Claude Code's own, copied frame for
frame from the CLI's welcome-screen Clawd (2.1.302), stepped every 60 ms.

## What he does

| When Claude is…                     | Clawd                                                         |
| ----------------------------------- | ------------------------------------------------------------- |
| thinking                            | stands, blinks, shuts his eyes to mull it over; now and then plays a trick |
| reading or searching code           | strolls back and forth                                        |
| running a command                   | walks faster                                                  |
| editing a file                      | types, left claw and right claw in turn                      |
| searching the web                   | stands, shutting his eyes now and then                       |
| starting a subagent                 | raises and lowers his arms                                   |
| hitting a tool error                | crouches with his eyes shut and shakes                       |
| done                                | plays `celebrate`, then holds his arms up                    |
| interrupted                         | plays `drop`                                                  |
| idle                                | blinks, now and then winks, taps, jumps or boops; falls asleep (`zZz`) after ~90 s |

Each tool's animation is held for at least 2 seconds, so even an instant edit
shows.

**Click him** (left mouse button) for a random one of Claude Code's own click
animations: jump, celebrate, skip, peekaboo, drop, waddle, peek, wink, boop, tap,
sneeze, turn, coin-hop. Click four times quickly and he turns round.

**Beside him** while Claude works: the spinner line (word, elapsed time, a token
estimate) and a tip. After the turn: `✻ Cogitated for 18s`. These lines are no
longer drawn in their usual place.

## Commands

- `/clawd` shows or hides Clawd; `/clawd on` and `/clawd off` set it. The choice
  is kept across sessions. While hidden, Claude Code draws its own spinner and
  turn-duration lines again.

## Install

From this folder, once:

```
claude plugin marketplace add E:\clawd-buddy
claude plugin install clawd-buddy@clawd-buddy
```

The plugin is read from this folder itself, so after editing a file run
`/reload-plugins` in a session.

For one session only, without installing:

```
claude --plugin-dir E:\clawd-buddy
```

### Spinner tips

Claude Code's own tips (`⎿ Tip: …` under the spinner) cannot be read by a mod, so
the mod shows its own copy of the built-in tips beside Clawd. To avoid seeing
them twice, turn Claude Code's off in `~/.claude/settings.json`:

```json
{ "spinnerTipsEnabled": false }
```

## Notes

- The token count is an estimate from the streamed text (about four characters
  a token), so it can differ a little from Claude Code's.
- Elapsed time is counted in animation frames; if the terminal lags, it can
  fall a little behind.
- Hiding the turn-duration line hides it in older messages of the transcript
  too.
- Clicking needs a surface that draws a `Client` (the terminal and the desktop
  app); elsewhere Clawd is drawn without clicks.

## Layout

```
.claude-plugin/plugin.json       manifest
.claude-plugin/marketplace.json  makes this folder installable
hooks/hooks.json                 lists the hooks module
hooks/register.tsx               moods, animations, the band, /clawd
hooks/sprite.tsx                 draws the sprite and hears clicks
types/index.d.ts                 the mod's state contract
tests/clawd.test.tsx             claude plugin test
```

## Develop

```
claude plugin validate E:\clawd-buddy
claude plugin test E:\clawd-buddy
```

Once Claude Code has loaded the mod it writes the API types to
`.claude-plugin/types/` (ignored by git), and `tsc -p .` type-checks it.
