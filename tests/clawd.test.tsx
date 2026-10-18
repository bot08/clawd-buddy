import type { RenderPropsOf } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 80 } as unknown as RenderPropsOf['AbovePrompt'],
} as const
// Clawd is drawn in the terminal alone.
const SURFACES = ['terminal'] as const

test('Clawd stands above the prompt in the terminal', async $ => {
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'clawd-buddy', surface, ...BAND })
    expect(await ui.find({ key: 'clawd' })).toBeDefined()
    await ui.unmount()
  }
})

test('a failed tool call makes Clawd frown', async ($, on) => {
  on('tool.call', () => ({ deny: 'nope' }))
  await $.tool.call({ tool: 'Read', file_path: 'C:/x.txt' })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'clawd-buddy', surface, ...BAND })
    // Shut eyes, the lids drawn as dark slits.
    expect(await ui.find({ type: 'Text', text: /▂/, in: 'clawd' })).toBeDefined()
    await ui.unmount()
  }
})

test('a tip shows beside Clawd while a turn runs', async $ => {
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'clawd-buddy', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /Tip: / })).toBeDefined()
    await ui.unmount()
  }
})

test('a flurry of clicks turns Clawd round', async $ => {
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'clawd-buddy', surface, ...BAND })
    for (let i = 0; i < 4; i++) {
      await ui.pointer({ type: 'down', x: 3, y: 1, button: 'left' })
    }
    // The first quarter view of the turn.
    expect(await ui.find({ type: 'Text', text: /▐█▜██▛█/, in: 'clawd' })).toBeDefined()
    await ui.unmount()
  }
})

test("the spinner line moves beside Clawd and leaves its own row empty", async $ => {
  for (const surface of SURFACES) {
    const spin = await $.ui.mount({
      plugin: 'clawd-buddy',
      surface,
      component: 'Spinner',
      props: { word: 'Pondering', message: null, suffix: '…', mode: 'thinking' },
    })
    expect(await spin.find({ type: 'Text' })).toBeUndefined()
    const ui = await $.ui.mount({ plugin: 'clawd-buddy', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /Pondering…/ })).toBeDefined()
    await ui.unmount()
    await spin.unmount()
  }
})

test('/clawd off hides Clawd and /clawd on brings him back', async ($, on) => {
  mock.store(on)
  // Stands for the engine's own empty band beneath the plugin.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.command.run({ command: 'clawd', args: 'off' })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'clawd-buddy', surface, ...BAND })
    expect(await ui.find({ key: 'clawd' })).toBeUndefined()
    await ui.unmount()
  }
  await $.command.run({ command: 'clawd', args: 'on' })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'clawd-buddy', surface, ...BAND })
    expect(await ui.find({ key: 'clawd' })).toBeDefined()
    await ui.unmount()
  }
})

test('the desktop app keeps its own band and spinner', async ($, on) => {
  // Stand for the engine's own drawings beneath the plugin.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine spinner</Text>
  })
  const band = await $.ui.mount({ plugin: 'clawd-buddy', surface: 'desktop', ...BAND })
  expect(await band.find({ key: 'clawd' })).toBeUndefined()
  expect(await band.find({ type: 'Text', text: /engine band/ })).toBeDefined()
  const spin = await $.ui.mount({
    plugin: 'clawd-buddy',
    surface: 'desktop',
    component: 'Spinner',
    props: { word: 'Pondering', message: null, suffix: '…', mode: 'thinking' },
  })
  expect(await spin.find({ type: 'Text', text: /engine spinner/ })).toBeDefined()
})
