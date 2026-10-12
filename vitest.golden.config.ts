import { defineConfig } from 'vitest/config'

// `npm run golden`: real AI questions against `npm run dev` (costs Gemini quota; see golden/golden.test.ts).
export default defineConfig({
  test: {
    include: ['golden/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
})
