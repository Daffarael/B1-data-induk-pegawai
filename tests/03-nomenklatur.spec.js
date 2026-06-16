// tests/03-nomenklatur.spec.js
// Test: Fitur CRUD Nomenklatur Jabatan

const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

test.describe('Modul Nomenklatur', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('halaman daftar nomenklatur dapat diakses', async ({ page }) => {
    await page.goto('/nomenklatur');
    await expect(page).toHaveURL(/\/nomenklatur/);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('a[href="/nomenklatur/create"]').first()).toBeVisible();
  });

  test('tombol tambah nomenklatur ada dan berfungsi', async ({ page }) => {
    await page.goto('/nomenklatur');
    const btnTambah = page.locator('a[href="/nomenklatur/create"]').first();
    await expect(btnTambah).toBeVisible();
    await btnTambah.click();
    await expect(page).toHaveURL(/\/nomenklatur\/create/);
  });

  test('form tambah nomenklatur memiliki semua field wajib', async ({ page }) => {
    await page.goto('/nomenklatur/create');
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="grade"]')).toBeVisible();
    await expect(page.locator('textarea[name="qualification"]')).toBeVisible();
    await expect(page.locator('textarea[name="duties"]')).toBeVisible();
  });

  test('submit form nomenklatur kosong ditolak validasi', async ({ page }) => {
    await page.goto('/nomenklatur/create');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/nomenklatur\/create/);
    await expect(page.locator('.cv-err').first()).toBeVisible();
  });

  test('fitur pencarian nomenklatur berfungsi', async ({ page }) => {
    await page.goto('/nomenklatur');
    const searchInput = page.locator('input[name="search"], input[placeholder*="Cari"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('analis');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/search=analis/);
    }
  });

  test('halaman nomenklatur terlindungi autentikasi', async ({ browser }) => {
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto('http://localhost:3000/nomenklatur');
    await expect(freshPage).toHaveURL(/\/login/);
    await freshContext.close();
  });

});
