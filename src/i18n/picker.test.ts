import { describe, expect, it } from 'vitest'
import { LANGS } from '../../shared/types'
import { en } from './en'
import { hi } from './hi'
import { kn } from './kn'
import { ml } from './ml'
import { PICKER_TEXT } from './picker'
import { ta } from './ta'
import { te } from './te'

const DICTS = { en, hi, te, ta, kn, ml }

describe('language screen text', () => {
  it.each(LANGS)('%s matches the dictionary', (lang) => {
    const dict = DICTS[lang]
    expect(PICKER_TEXT[lang]).toEqual({ language: dict['settings.language'], trust: dict['onboard.trust'], readAloud: dict['chat.readAloud'] })
  })

  it('every dictionary has every English key', () => {
    for (const lang of LANGS) expect(Object.keys(DICTS[lang]).sort()).toEqual(Object.keys(en).sort())
  })
})
