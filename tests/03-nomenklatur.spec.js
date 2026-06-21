// tests/03-nomenklatur.spec.js
// Test CRUD lengkap: Modul Nomenklatur & Klasifikasi Jabatan

const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

const NAMA_TEST = 'Nomenklatur Playwright Test';
const NAMA_EDIT = 'Nomenklatur Playwright Test EDITED';

// -- Cleanup sebelum semua test -----------------------------------------
test.beforeAll(async ({ browser }) => {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await login(page);
    for (let i = 0; i < 5; i++) {
      await page.goto('/nomenklatur?search=Playwright+Test');
      await page.waitForTimeout(800);
      const delBtn = page.locator('button.action-btn.del').first();
      if (!await delBtn.isVisible()) break;
      await delBtn.click();
      await page.waitForSelector('#fw-delete-modal', { state: 'visible', timeout: 5000 });
      await page.locator('#fw-delete-form button[type="submit"]').click();
      await page.waitForURL(/\/nomenklatur/, { timeout: 8000 });
    }
  } catch (e) { /* ignore */ }
  await ctx.close();
});

test.describe('Modul Nomenklatur & Klasifikasi Jabatan — CRUD Lengkap', () => {

  test('01 halaman daftar nomenklatur dapat diakses', async ({ page }) => {
    await login(page);
    await page.goto('/nomenklatur');
    await expect(page).toHaveURL(/\/nomenklatur/);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('a[href="/nomenklatur/create"]').first()).toBeVisible();
  });

  test('02 akses tanpa login diredirect ke login', async ({ browser }) => {
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/nomenklatur');
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });

  test('03 form tambah nomenklatur memiliki field wajib', async ({ page }) => {
    await login(page);
    await page.goto('/nomenklatur/create');
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="grade"]')).toBeVisible();
    await expect(page.locator('textarea[name="qualification"]')).toBeVisible();
    await expect(page.locator('textarea[name="duties"]')).toBeVisible();
  });

  test('04 submit form kosong ditolak validasi client-side', async ({ page }) => {
    await login(page);
    await page.goto('/nomenklatur/create');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/nomenklatur\/create/);
    await expect(page.locator('.cv-err').first()).toBeVisible();
  });

  test('05 CREATE — tambah data nomenklatur baru berhasil', async ({ page }) => {
    await login(page);
    await page.goto('/nomenklatur/create');

    await page.fill('input[name="name"]', NAMA_TEST);
    await page.fill('input[name="grade"]', 'III/a');
    await page.fill('textarea[name="qualification"]', 'Kualifikasi pengujian otomatis Playwright minimal 10 karakter');
    await page.fill('textarea[name="duties"]', 'Tugas pengujian otomatis sistem Playwright minimal 10 karakter');

    await page.click('button[type="submit"]');
    await page.waitForURL(/\/nomenklatur/, { timeout: 10000 });

    await expect(page).toHaveURL(/\/nomenklatur/);
    const body = await page.locator('body').textContent();
    expect(body).toContain('berhasil');
  });

  test('06 fitur pencarian nomenklatur berfungsi', async ({ page }) => {
    await login(page);
    await page.goto('/nomenklatur');
    const searchInput = page.locator('input[name="search"], input[placeholder*="Cari"], input[type="search"]').first();
    await searchInput.fill('Playwright Test');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/search=/);
    const body = await page.locator('body').textContent();
    expect(body).toContain(NAMA_TEST);
  });

  test('07 READ DETAIL — halaman detail nomenklatur dapat diakses', async ({ page }) => {
    await login(page);
    await page.goto('/nomenklatur?search=Playwright+Test');
    await page.locator('a.action-btn[title="Detail"]').first().click();
    await page.waitForURL(/\/nomenklatur\/\d+/, { timeout: 8000 });
    await expect(page.locator('body')).toContainText('Playwright Test');
  });

  test('08 UPDATE — edit data nomenklatur berhasil', async ({ page }) => {
    await login(page);
    await page.goto('/nomenklatur?search=Playwright+Test');
    await page.locator('a.action-btn.edit[title="Edit"]').first().click();
    await page.waitForURL(/\/nomenklatur\/\d+\/edit/, { timeout: 8000 });
    await page.fill('input[name="name"]', NAMA_EDIT);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/nomenklatur/, { timeout: 10000 });
    const body = await page.locator('body').textContent();
    expect(body).toContain('berhasil');
  });

  test('09 DELETE — hapus data nomenklatur berhasil', async ({ page }) => {
    await login(page);
    await page.goto('/nomenklatur?search=Playwright+Test');
    await page.waitForTimeout(500);
    await page.locator('button.action-btn.del').first().click();
    await page.waitForSelector('#fw-delete-modal', { state: 'visible', timeout: 5000 });
    await page.locator('#fw-delete-form button[type="submit"]').click();
    await page.waitForURL(/\/nomenklatur/, { timeout: 10000 });
    const body = await page.locator('body').textContent();
    expect(body).toContain('berhasil');
    await page.goto('/nomenklatur?search=Playwright+Test+EDITED');
    const bodyAfter = await page.locator('body').textContent();
    expect(bodyAfter).not.toContain(NAMA_EDIT);
  });

  test('10 EXPORT — halaman preview PDF dapat diakses', async ({ page }) => {
    await login(page);
    await page.goto('/nomenklatur/export/pdf/preview');
    await expect(page).toHaveURL(/\/nomenklatur\/export\/pdf\/preview/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('11 EXPORT — halaman preview JSON dapat diakses', async ({ page }) => {
    await login(page);
    await page.goto('/nomenklatur/export/json/preview');
    await expect(page).toHaveURL(/\/nomenklatur\/export\/json\/preview/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('12 API — GET /nomenklatur/api mengembalikan data JSON', async ({ page }) => {
    await login(page);
    const response = await page.request.get('http://localhost:3000/nomenklatur/api');
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty('data');
    expect(Array.isArray(json.data)).toBe(true);
  });

});

