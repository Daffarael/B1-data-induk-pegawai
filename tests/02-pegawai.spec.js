// tests/02-pegawai.spec.js
// Test CRUD lengkap: Modul Pegawai & Dosen

const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

const NIP_TEST   = '9990000001';
const NAMA_TEST  = 'PLAYWRIGHT TEST STAF';
const NAMA_EDIT  = 'PLAYWRIGHT TEST STAF EDITED';

// ── Cleanup sebelum semua test ─────────────────────────────────────────
test.beforeAll(async ({ browser }) => {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await login(page);
    // Hapus semua data test yang mungkin tertinggal dari run sebelumnya
    for (let i = 0; i < 5; i++) {
      await page.goto('/pegawai?search=PLAYWRIGHT+TEST');
      await page.waitForTimeout(800);
      const delBtn = page.locator('button.action-btn.del').first();
      if (!await delBtn.isVisible()) break;
      await delBtn.click();
      await page.waitForSelector('#fw-delete-modal', { state: 'visible', timeout: 5000 });
      await page.locator('#fw-delete-form button[type="submit"]').click();
      await page.waitForURL(/\/pegawai/, { timeout: 8000 });
    }
  } catch (e) { /* ignore cleanup errors */ }
  await ctx.close();
});

test.describe('Modul Pegawai / Dosen — CRUD Lengkap', () => {

  // ── 1. AKSES & NAVIGASI ──────────────────────────────────────────────
  test('01 halaman daftar pegawai dapat diakses', async ({ page }) => {
    await page.waitForTimeout(2000); // beri server waktu settle setelah beforeAll cleanup
    await login(page);
    await page.goto('/pegawai');
    await expect(page).toHaveURL(/\/pegawai/);
    await expect(page.locator('a[href="/pegawai/create"]').first()).toBeVisible();
  });

  test('02 akses tanpa login diredirect ke login', async ({ browser }) => {
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/pegawai');
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });

  // ── 2. FORM & VALIDASI ───────────────────────────────────────────────
  test('03 form tambah pegawai memiliki semua field wajib', async ({ page }) => {
    await login(page);
    await page.goto('/pegawai/create');
    await expect(page.locator('input[name="employee_number"]')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="birth_place"]')).toBeVisible();
    await expect(page.locator('input[name="birth_date"]')).toBeVisible();
    await expect(page.locator('select[name="gender"]')).toBeVisible();
    await expect(page.locator('textarea[name="address"]')).toBeVisible();
    await expect(page.locator('select[name="organization_unit_id"]')).toBeVisible();
    await expect(page.locator('select[name="employment_status_id"]')).toBeVisible();
    await expect(page.locator('input[name="hire_date"]')).toBeVisible();
    await expect(page.locator('select[name="status"]')).toBeVisible();
  });

  test('04 submit form kosong ditolak validasi client-side', async ({ page }) => {
    await login(page);
    await page.goto('/pegawai/create');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/pegawai\/create/);
    await expect(page.locator('.cv-err').first()).toBeVisible();
  });

  // ── 3. CREATE (C) ────────────────────────────────────────────────────
  test('05 CREATE — tambah data pegawai baru berhasil', async ({ page }) => {
    await login(page);
    await page.goto('/pegawai/create');

    await page.fill('input[name="employee_number"]', NIP_TEST);
    await page.fill('input[name="name"]', NAMA_TEST);
    await page.fill('input[name="birth_place"]', 'Padang');
    await page.fill('input[name="birth_date"]', '1990-01-15');
    await page.selectOption('select[name="gender"]', 'male');
    await page.fill('textarea[name="address"]', 'Jl. Playwright No. 1, Padang');
    await page.selectOption('select[name="organization_unit_id"]', { index: 1 });
    await page.selectOption('select[name="employment_status_id"]', { index: 1 });
    await page.fill('input[name="hire_date"]', '2020-01-01');
    await page.selectOption('select[name="status"]', 'active');

    await page.click('button[type="submit"]');
    await page.waitForURL(/\/pegawai$/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/pegawai$/);
    const body = await page.locator('body').textContent();
    expect(body).toContain('berhasil');
  });

  // ── 4. READ LIST & SEARCH (R) ────────────────────────────────────────
  test('06 fitur pencarian pegawai berfungsi', async ({ page }) => {
    await login(page);
    await page.goto('/pegawai');
    const searchInput = page.locator('input[name="search"]').first();
    await searchInput.fill('PLAYWRIGHT TEST');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/search=/);
    const body = await page.locator('body').textContent();
    expect(body).toContain(NAMA_TEST);
  });

  // ── 5. READ DETAIL (R) ───────────────────────────────────────────────
  test('07 READ DETAIL — halaman detail pegawai dapat diakses', async ({ page }) => {
    await login(page);
    await page.goto('/pegawai?search=PLAYWRIGHT+TEST');
    await page.locator('a.action-btn[title="Detail"]').first().click();
    await page.waitForURL(/\/pegawai\/\d+/, { timeout: 8000 });
    await expect(page.locator('body')).toContainText(NIP_TEST);
  });

  // ── 6. UPDATE (U) ────────────────────────────────────────────────────
  test('08 UPDATE — edit data pegawai berhasil', async ({ page }) => {
    await login(page);
    await page.goto('/pegawai?search=PLAYWRIGHT+TEST');
    await page.locator('a.action-btn.edit[title="Edit"]').first().click();
    await page.waitForURL(/\/pegawai\/\d+\/edit/, { timeout: 8000 });
    await page.fill('input[name="name"]', NAMA_EDIT);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/pegawai/, { timeout: 10000 });
    const body = await page.locator('body').textContent();
    expect(body).toContain('berhasil');
  });

  // ── 7. DELETE (D) ────────────────────────────────────────────────────
  test('09 DELETE — hapus data pegawai berhasil', async ({ page }) => {
    await login(page);
    await page.goto('/pegawai?search=PLAYWRIGHT+TEST');
    await page.waitForTimeout(500);
    await page.locator('button.action-btn.del').first().click();
    await page.waitForSelector('#fw-delete-modal', { state: 'visible', timeout: 5000 });
    await page.locator('#fw-delete-form button[type="submit"]').click();
    await page.waitForURL(/\/pegawai/, { timeout: 10000 });
    const body = await page.locator('body').textContent();
    expect(body).toContain('berhasil');
    await page.goto('/pegawai?search=PLAYWRIGHT+TEST');
    const bodyAfter = await page.locator('body').textContent();
    expect(bodyAfter).not.toContain(NIP_TEST);
  });

  // ── 8. EXPORT PDF PREVIEW ────────────────────────────────────────────
  test('10 EXPORT — halaman preview PDF dapat diakses', async ({ page }) => {
    await login(page);
    await page.goto('/pegawai/export/pdf/preview');
    await expect(page).toHaveURL(/\/pegawai\/export\/pdf\/preview/);
    await expect(page.locator('body')).toBeVisible();
  });

  // ── 9. EXPORT JSON PREVIEW ───────────────────────────────────────────
  test('11 EXPORT — halaman preview JSON dapat diakses', async ({ page }) => {
    await login(page);
    await page.goto('/pegawai/export/json/preview');
    await expect(page).toHaveURL(/\/pegawai\/export\/json\/preview/);
    await expect(page.locator('body')).toBeVisible();
  });

  // ── 10. API GET JSON ─────────────────────────────────────────────────
  test('12 API — GET /pegawai/api mengembalikan data JSON', async ({ page }) => {
    await login(page);
    const response = await page.request.get('http://localhost:3000/pegawai/api');
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty('data');
    expect(Array.isArray(json.data)).toBe(true);
  });

});
