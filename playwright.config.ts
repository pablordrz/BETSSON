import 'dotenv/config';
import { defineConfig } from '@playwright/test';
import { contextOptionsFor } from './src/auth/login';
import { markets } from './src/config/markets';
import type { TestOptions, WorkerOptions } from './tests/fixtures';

const CI = !!process.env.CI;
const es = markets.es;

export default defineConfig<TestOptions, WorkerOptions>({
  testDir: 'tests',
  timeout: 8 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  // Real money: never retry automatically (a retry is another paid spin).
  retries: 0,
  reporter: CI
    ? [['list'], ['blob', { fileName: 'report-es.zip' }], ['./src/reporter/checks-reporter.ts', { outputDir: 'reports' }]]
    : [['list'], ['html', { outputFolder: 'reports/playwright', open: 'never' }], ['./src/reporter/checks-reporter.ts', { outputDir: 'reports' }]],
  use: {
    // betsson.es tags its UI with data-test-id (inside web components; getByTestId pierces shadow DOM)
    testIdAttribute: 'data-test-id',
    // Headed by default: WebGL games render reliably. In CI it runs under xvfb.
    headless: process.env.HEADLESS === '1',
    channel: process.env.PW_CHANNEL || undefined,
    trace: 'on',
    video: 'on',
    screenshot: 'off', // our own masked/annotated screenshots are attached instead
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    launchOptions: {
      executablePath: process.env.PW_EXECUTABLE_PATH || undefined,
      args: ['--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  projects: [
    { name: es.site, testMatch: /scenarios[\\/].*\.spec\.ts$/, use: { marketId: 'es', ...contextOptionsFor(es) } },
    { name: `calibrate-${es.site}`, testMatch: /calibrate\.spec\.ts$/, use: { marketId: 'es', ...contextOptionsFor(es) } },
    { name: `series-${es.site}`, testMatch: /series[\\/].*\.spec\.ts$/, use: { marketId: 'es', ...contextOptionsFor(es) } },
    // balance validations that never spend money (person A): zero-balance account, game vs header balance
    { name: `balance-${es.site}`, testMatch: /balance[\\/].*\.spec\.ts$/, use: { marketId: 'es', ...contextOptionsFor(es) } },
    { name: `demo-${es.site}`, testMatch: /demo[\\/].*\.spec\.ts$/, use: { marketId: 'es', ...contextOptionsFor(es) } },
    { name: `login-${es.site}`, testMatch: /login-manual\.spec\.ts$/, use: { marketId: 'es' } },
    { name: 'unit', testMatch: /unit[\\/].*\.spec\.ts$/ },
  ],
});
