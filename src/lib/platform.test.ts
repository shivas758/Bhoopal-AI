import { expect, test } from 'vitest'
import { platformFrom } from './platform'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'
const ANDROID_FIREFOX = 'Mozilla/5.0 (Android 13; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0'
const ANDROID_WEBVIEW =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/420.0.0.0;]'
const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

test('iPhone and iPad, including the iPad that calls itself a Mac', () => {
  expect(platformFrom(IPHONE, 5)).toBe('ios')
  expect(platformFrom(IPAD_AS_MAC, 5)).toBe('ios')
  expect(platformFrom(IPAD_AS_MAC, 0)).toBe('other')
})

test('Android browsers, but not a WebView inside another app', () => {
  expect(platformFrom(ANDROID_CHROME, 5)).toBe('android')
  expect(platformFrom(ANDROID_FIREFOX, 5)).toBe('android')
  expect(platformFrom(ANDROID_WEBVIEW, 5)).toBe('other')
})

test('computers', () => {
  expect(platformFrom(WINDOWS_CHROME, 0)).toBe('other')
})
