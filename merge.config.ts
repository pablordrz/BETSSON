// Used by the CI "report" job to merge the per-market blob reports into one published site:
//   site/index.html            → pass/fail per check, scenario and market
//   site/playwright/index.html → full Playwright report (screenshots, traces, videos)
export default {
  testDir: 'tests',
  reporter: [
    ['html', { outputFolder: 'site/playwright', open: 'never' }],
    ['./src/reporter/checks-reporter.ts', { outputDir: 'site', playwrightReportHref: 'playwright/index.html' }],
  ],
};
