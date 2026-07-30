import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  // En hel bingorunde tar tid: hvert trekk er et rundskudd gjennom serveren.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // Serveren holder alle rom i ett prosessminne, og testene deler den. Rommene
  // er isolerte fra hverandre, men én arbeider gjør feilsøking langt enklere.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // HTTP holder i test — sertifikatet er der for kameraet på ekte telefoner.
    command: `FORCE_HTTP=1 PORT=${PORT} npx tsx server.ts`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
