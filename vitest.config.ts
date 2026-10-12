import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so tests don't start the Cloudflare and PWA plugins.
export default defineConfig({
  test: {
    include: ['{worker,shared,src}/**/*.test.ts'],
    environment: 'node',
  },
})
