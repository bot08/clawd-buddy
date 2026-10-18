import type { ClientModule } from 'claude-code'

// One sprite row as runs of glyphs; a `lid` run is drawn inverted, a dark slit.
export type SpriteProps = { rows: { text: string; lid: boolean }[][]; color: string }

// Draws Clawd and hears clicks on him, without the highlight a Button gets under the pointer.
const Sprite: ClientModule<SpriteProps> = (props, surface) => {
  const { Box, Text } = surface.elements
  surface.onPointer(e => {
    if (e.type === 'down' && e.button === 'left') {
      surface.post('poke')
    }
  })

  return (
    <Box flexDirection="column">
      {props.rows.map(row => (
        <Text>
          {row.map(run => (
            <Text color={props.color} inverse={run.lid}>
              {run.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}

export default Sprite
