import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: process.env.PLAYWRIGHT_CHANNEL } },
  ],
  webServer: [
    {
      command: 'npm run start -w @relay/api',
      url: 'http://127.0.0.1:4000/api/auth/get-session',
      env: {
        NODE_ENV: 'development',
        API_PORT: '4000',
        API_HOST: '127.0.0.1',
        BETTER_AUTH_URL: 'http://localhost:3000',
        BETTER_AUTH_SECRET: 'relay-e2e-only-secret-do-not-use-in-production',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: '1025',
        SMTP_SECURE: 'false',
        SMTP_USER: '',
        SMTP_PASSWORD: '',
        EMAIL_FROM: 'Relay <verification@example.com>',
      },
    },
    {
      command: 'npm run start -w @relay/web',
      url: 'http://localhost:3000',
    },
  ],
});
