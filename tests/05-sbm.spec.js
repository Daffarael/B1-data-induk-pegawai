// tests/05-sbm.spec.js
// Test: Fitur CRUD SBM (Standar Biaya Masukan)

const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

test.describe('Modul SBM (Standar Biaya Masukan)', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('halaman daftar SBM dapat diakses', async ({ page }) => {
    await page.goto('/sbm');
    await expect(page).toHaveURL(/\/sbm/);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('a[href="/sbm/create"]').first()).toBeVisible();
  });

  test('tombol tambah SBM ada dan berfungsi', async ({ page }) => {
    await page.goto('/sbm');
    const btnTambah = page.locator('a[href="/sbm/create"]').first();
    await expect(btnTambah).toBeVisible();
    await btnTambah.click();
    await expect(page).toHaveURL(/\/sbm\/create/);
  });

  test('form tambah SBM memiliki semua field wajib', async ({ page }) => {
    await page.goto('/sbm/create');
    await expect(page.locator('select[name="city_id"]')).toBeVisible();
    await expect(page.locator('select[name="travel_cost_component_id"]')).toBeVisible();
    await expect(page.locator('input[name="amount"]')).toBeVisible();
  });

  test('submit form SBM kosong ditolak validasi', async ({ page }) => {
    await page.goto('/sbm/create');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/sbm\/create/);
    await expect(page.locator('.cv-err').first()).toBeVisible();
  });

  test('validasi tarif negatif ditolak', async ({ page }) => {
    await page.goto('/sbm/create');
    await page.fill('input[name="amount"]', '-1000');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/sbm\/create/);
    await expect(page.locator('.cv-err').first()).toBeVisible();
  });

  test('fitur pencarian SBM berfungsi', async ({ page }) => {
    await page.goto('/sbm');
    const searchInput = page.locator('input[name="search"], input[placeholder*="Cari"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('Jakarta');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/search=Jakarta/);
    }
  });

  test('halaman SBM terlindungi autentikasi', async ({ browser }) => {
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto('http://localhost:3000/sbm');
    await expect(freshPage).toHaveURL(/\/login/);
    await freshContext.close();
  });

});
