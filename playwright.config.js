// playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  // Folder tempat file test berada
  testDir: './tests',

  // Timeout per test (45 detik)
  timeout: 45000,

  // Retry 1x jika gagal (mengatasi flaky login saat server sedang load)
  retries: 1,

  // Jalankan test satu per satu (bukan paralel) — penting karena pakai session login
  workers: 1,

  // Laporan hasil test
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],

  use: {
    // URL base aplikasi
    baseURL: 'http://localhost:3000',

    // Tampilkan browser (headed) agar bisa dilihat prosesnya
    headless: true,

    // Ambil screenshot kalau test gagal
    screenshot: 'only-on-failure',

    // Rekam video kalau test gagal
    video: 'retain-on-failure',

    // Slowmo 300ms agar lebih mudah dipantau
    launchOptions: {
      slowMo: 0,
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
