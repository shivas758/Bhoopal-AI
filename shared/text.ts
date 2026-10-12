/**
 * Normalizes text for searching: NFC, no zero-width joiners/non-joiners (Telugu and Kannada keyboards insert
 * U+200C/U+200D inconsistently, e.g. "బీట్‌రూట్"), lowercase, single spaces.
 */
export const fold = (s: string) =>
  s
    .normalize('NFC')
    .replace(/[​-‍⁠﻿]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

// Devanagari, Bengali, Gurmukhi, Gujarati, Oriya, Tamil, Telugu, Kannada, Malayalam digit blocks all start at …66.
const INDIC_ZEROS = [0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66]

/** Replaces Indian-script digits with 0-9 (one char for one char, so string positions are unchanged). */
export function asciiDigits(s: string) {
  return s.replace(/[०-९০-৯੦-੯૦-૯୦-୯௦-௯౦-౯೦-೯൦-൯]/g, (d) => {
    const code = d.charCodeAt(0)
    const zero = INDIC_ZEROS.find((z) => code >= z && code <= z + 9)!
    return String(code - zero)
  })
}
