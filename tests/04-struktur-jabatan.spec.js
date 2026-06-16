// tests/04-struktur-jabatan.spec.js
// Test: Fitur CRUD Struktur Jabatan

const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

test.describe('Modul Struktur Jabatan', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('halaman daftar struktur jabatan dapat diakses', async ({ page }) => {
    await page.goto('/struktur-jabatan');
    await expect(page).toHaveURL(/\/struktur-jabatan/);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('a[href="/struktur-jabatan/create"]').first()).toBeVisible();
  });

  test('tombol tambah jabatan ada dan berfungsi', async ({ page }) => {
    await page.goto('/struktur-jabatan');
    const btnTambah = page.locator('a[href="/struktur-jabatan/create"]').first();
    await expect(btnTambah).toBeVisible();
    await btnTambah.click();
    await expect(page).toHaveURL(/\/struktur-jabatan\/create/);
  });

  test('form tambah jabatan memiliki field wajib', async ({ page }) => {
    await page.goto('/struktur-jabatan/create');
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="grade"]')).toBeVisible();
    await expect(page.locator('select[name="parent_id"]')).toBeVisible();
  });

  test('submit form jabatan kosong ditolak validasi', async ({ page }) => {
    await page.goto('/struktur-jabatan/create');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/struktur-jabatan\/create/);
    await expect(page.locator('.cv-err').first()).toBeVisible();
  });

  test('fitur pencarian struktur jabatan berfungsi', async ({ page }) => {
    await page.goto('/struktur-jabatan');
    const searchInput = page.locator('input[name="search"], input[placeholder*="Cari"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('kepala');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/search=kepala/);
    }
  });

  test('halaman struktur jabatan terlindungi autentikasi', async ({ browser }) => {
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto('http://localhost:3000/struktur-jabatan');
    await expect(freshPage).toHaveURL(/\/login/);
    await freshContext.close();
  });

});
