// tests/helpers/auth.js
// Helper untuk login — dipakai di semua test agar tidak perlu login berulang

const TEST_EMAIL    = 'admin.kepegawaian@fti.unand.ac.id';
const TEST_PASSWORD = 'Kepegawaian@2026';

const TEST_EMAIL_MAHASISWA    = 'admin.kemahasiswaan@fti.unand.ac.id';
const TEST_PASSWORD_MAHASISWA = 'Kemahasiswaan@2026';

/**
 * Login ke aplikasi dan tunggu sampai di halaman dashboard.
 * @param {import('@playwright/test').Page} page
 */
async function login(page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

/**
 * Login sebagai admin kemahasiswaan (untuk modul mahasiswa).
 * @param {import('@playwright/test').Page} page
 */
async function loginMahasiswa(page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', TEST_EMAIL_MAHASISWA);
  await page.fill('input[name="password"]', TEST_PASSWORD_MAHASISWA);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

module.exports = { login, loginMahasiswa, TEST_EMAIL, TEST_PASSWORD };
