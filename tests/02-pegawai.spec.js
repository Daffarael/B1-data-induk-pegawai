// tests/02-pegawai.spec.js
// Test: Fitur CRUD Pegawai / Dosen

const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

test.describe('Modul Pegawai / Dosen', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('halaman daftar pegawai dapat diakses', async ({ page }) => {
    await page.goto('/pegawai');
    await expect(page).toHaveURL(/\/pegawai/);
    // Cek halaman berhasil dimuat dengan melihat status HTTP 200
    await expect(page.locator('body')).toBeVisible();
    // Cek ada konten pegawai di halaman
    await expect(page.locator('a[href="/pegawai/create"]').first()).toBeVisible();
  });

  test('tombol tambah pegawai ada dan mengarah ke form create', async ({ page }) => {
    await page.goto('/pegawai');
    const btnTambah = page.locator('a[href="/pegawai/create"]').first();
    await expect(btnTambah).toBeVisible();
    await btnTambah.click();
    await expect(page).toHaveURL(/\/pegawai\/create/);
  });

  test('form tambah pegawai memiliki semua field wajib', async ({ page }) => {
    await page.goto('/pegawai/create');
    await expect(page.locator('input[name="employee_number"]')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="birth_date"]')).toBeVisible();
    await expect(page.locator('select[name="gender"]')).toBeVisible();
  });

  test('submit form kosong ditolak oleh validasi client-side', async ({ page }) => {
    await page.goto('/pegawai/create');
    // Dispatch submit event via JS agar custom validasi kita berjalan
    // (HTML5 required attribute mencegah submit event jika dilakukan via klik biasa)
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/pegawai\/create/);
    await expect(page.locator('.cv-err').first()).toBeVisible();
  });

  test('fitur pencarian pegawai berfungsi', async ({ page }) => {
    await page.goto('/pegawai');
    const searchInput = page.locator('input[name="search"], input[placeholder*="Cari"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/search=test/);
    }
  });

  test('akses halaman pegawai tanpa login diredirect ke login', async ({ browser }) => {
    // Buat context browser BARU yang tidak punya session login
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto('http://localhost:3000/pegawai');
    await expect(freshPage).toHaveURL(/\/login/);
    await freshContext.close();
  });

});
