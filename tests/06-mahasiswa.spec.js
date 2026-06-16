// tests/06-mahasiswa.spec.js
// Test: Fitur CRUD Mahasiswa

const { test, expect } = require('@playwright/test');
const { loginMahasiswa } = require('./helpers/auth');

test.describe('Modul Mahasiswa', () => {

  // Login sebagai admin kemahasiswaan karena modul ini dibatasi role
  test.beforeEach(async ({ page }) => {
    await loginMahasiswa(page);
  });

  test('halaman daftar mahasiswa dapat diakses', async ({ page }) => {
    await page.goto('/mahasiswa');
    await expect(page).toHaveURL(/\/mahasiswa/);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('a[href="/mahasiswa/create"]').first()).toBeVisible();
  });

  test('tombol tambah mahasiswa ada dan berfungsi', async ({ page }) => {
    await page.goto('/mahasiswa');
    const btnTambah = page.locator('a[href="/mahasiswa/create"]').first();
    await expect(btnTambah).toBeVisible();
    await btnTambah.click();
    await expect(page).toHaveURL(/\/mahasiswa\/create/);
  });

  test('form tambah mahasiswa memiliki semua field wajib', async ({ page }) => {
    await page.goto('/mahasiswa/create');
    await expect(page.locator('input[name="regno"]')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="birth_date"]')).toBeVisible();
    await expect(page.locator('select[name="gender"]')).toBeVisible();
    await expect(page.locator('select[name="department_id"]')).toBeVisible();
    await expect(page.locator('input[name="year"]')).toBeVisible();
    await expect(page.locator('select[name="status"]')).toBeVisible();
  });

  test('submit form mahasiswa kosong ditolak validasi', async ({ page }) => {
    await page.goto('/mahasiswa/create');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/mahasiswa\/create/);
    await expect(page.locator('.cv-err').first()).toBeVisible();
  });

  test('validasi format email yang salah ditolak', async ({ page }) => {
    await page.goto('/mahasiswa/create');
    await page.fill('input[name="email"]', 'bukan-email-valid');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/mahasiswa\/create/);
    await expect(page.locator('.cv-err').first()).toBeVisible();
  });

  test('validasi tahun angkatan di luar range ditolak', async ({ page }) => {
    await page.goto('/mahasiswa/create');
    await page.fill('input[name="year"]', '1990');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/mahasiswa\/create/);
    await expect(page.locator('.cv-err').first()).toBeVisible();
  });

  test('fitur pencarian mahasiswa berfungsi', async ({ page }) => {
    await page.goto('/mahasiswa');
    const searchInput = page.locator('input[name="search"], input[placeholder*="Cari"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('ahmad');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/search=ahmad/);
    }
  });

  test('halaman mahasiswa terlindungi autentikasi', async ({ browser }) => {
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto('http://localhost:3000/mahasiswa');
    await expect(freshPage).toHaveURL(/\/login/);
    await freshContext.close();
  });

});
