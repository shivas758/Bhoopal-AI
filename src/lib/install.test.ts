import { expect, test } from 'vitest'
import { installScreenState, type InstallFacts } from './install'

const base: InstallFacts = {
  platform: 'android',
  standalone: false,
  hasPrompt: false,
  justInstalled: false,
  requested: false,
  installed: false,
  dismissed: false,
}
const state = (facts: Partial<InstallFacts>) => installScreenState({ ...base, ...facts })

test('never inside the installed app, on a computer, or inside another app', () => {
  expect(state({ standalone: true, hasPrompt: true })).toBe('skip')
  expect(state({ platform: 'ios', standalone: true })).toBe('skip')
  expect(state({ platform: 'other', hasPrompt: true })).toBe('skip')
  expect(state({ platform: 'other', requested: true })).toBe('skip')
  expect(state({ standalone: true, requested: true })).toBe('skip')
})

test('Android: one-tap button when Chrome offers it, otherwise the steps', () => {
  expect(state({ hasPrompt: true })).toBe('android-prompt')
  expect(state({})).toBe('android-manual')
})

test('iPhone: always the steps', () => {
  expect(state({ platform: 'ios' })).toBe('ios-steps')
  expect(state({ platform: 'ios', hasPrompt: true })).toBe('ios-steps')
})

test('shown once per phone, then only when asked for from the More page', () => {
  expect(state({ dismissed: true })).toBe('skip')
  expect(state({ dismissed: true, hasPrompt: true })).toBe('skip')
  expect(state({ dismissed: true, requested: true })).toBe('android-manual')
  expect(state({ dismissed: true, requested: true, hasPrompt: true })).toBe('android-prompt')
  expect(state({ platform: 'ios', dismissed: true, requested: true })).toBe('ios-steps')
})

test('already installed on this phone', () => {
  expect(state({ installed: true })).toBe('skip')
  expect(state({ installed: true, requested: true })).toBe('installed')
  // Chrome offers the prompt again only after an uninstall.
  expect(state({ installed: true, requested: true, hasPrompt: true })).toBe('android-prompt')
})

test('just installed in this tab', () => {
  expect(state({ justInstalled: true })).toBe('installed')
  expect(state({ justInstalled: true, installed: true })).toBe('installed')
  // From the Home card after "Not now": no full-screen takeover.
  expect(state({ justInstalled: true, dismissed: true })).toBe('skip')
  expect(state({ justInstalled: true, dismissed: true, requested: true })).toBe('installed')
})
