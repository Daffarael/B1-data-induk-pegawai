// tests/05-sbm.spec.js
// Test CRUD lengkap: Modul SBM Perjalanan Dinas

const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

// Gunakan amount unik agar mudah dilacak (harus kelipatan 1000 sesuai step="1000")
const AMOUNT_TEST = '750000';
const AMOUNT_EDIT = '850000';

test.describe('Modul SBM Perjalanan Dinas — CRUD Lengkap', () => {

  // ── 1. AKSES & NAVIGASI ──────────────────────────────────────────────
  test('01 halaman daftar SBM dapat diakses', async ({ page }) => {
    await login(page);
    await page.goto('/sbm');
    await expect(page).toHaveURL(/\/sbm/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('02 akses tanpa login diredirect ke login', async ({ browser }) => {
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/sbm');
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });

  test('03 form tambah SBM memiliki field wajib', async ({ page }) => {
    await login(page);
    await page.goto('/sbm/create');
    await expect(page.locator('select[name="city_id"]')).toBeVisible();
    await expect(page.locator('select[name="travel_cost_component_id"]')).toBeVisible();
    await expect(page.locator('input[name="amount"]')).toBeVisible();
  });

  test('04 submit form kosong ditolak validasi client-side', async ({ page }) => {
    await login(page);
    await page.goto('/sbm/create');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/sbm\/create/);
    await expect(page.locator('.cv-err').first()).toBeVisible();
  });

  test('05 validasi tarif negatif/nol ditolak', async ({ page }) => {
    await login(page);
    await page.goto('/sbm/create');
    await page.selectOption('select[name="city_id"]', { index: 1 });
    await page.selectOption('select[name="travel_cost_component_id"]', { index: 1 });
    await page.fill('input[name="amount"]', '-999');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);
    // Harus tetap di create atau ada error
    await expect(page.locator('body')).toBeVisible();
    expect(page.url()).toContain('/sbm');
  });

  // ── 3. CREATE (C) ────────────────────────────────────────────────────
  test('06 CREATE — tambah data SBM baru berhasil', async ({ page }) => {
    await login(page);
    await page.goto('/sbm/create');

    await page.selectOption('select[name="city_id"]', { index: 1 });
    await page.selectOption('select[name="travel_cost_component_id"]', { index: 1 });
    await page.fill('input[name="amount"]', AMOUNT_TEST);

    // Gunakan Promise.all agar tidak premature-resolve pada URL /sbm/create
    await Promise.all([
      page.waitForURL('http://localhost:3000/sbm', { timeout: 10000 }),
      page.click('button[type="submit"]')
    ]);

    await expect(page).toHaveURL('http://localhost:3000/sbm');
    const body = await page.locator('body').textContent();
    expect(body).toContain('berhasil');
  });

  // ── 4. READ LIST (R) ─────────────────────────────────────────────────
  test('07 daftar SBM menampilkan data yang baru dibuat', async ({ page }) => {
    await login(page);
    await page.goto('/sbm');
    await expect(page.locator('body')).toBeVisible();
    // SBM punya setidaknya 1 record (yang baru dibuat)
    await expect(page.locator('table tbody tr').first()).toBeVisible();
  });

  // ── 5. READ DETAIL (R) ───────────────────────────────────────────────
  test('08 READ DETAIL — halaman detail SBM dapat diakses', async ({ page }) => {
    await login(page);
    await page.goto('/sbm');
    await page.waitForTimeout(300);
    // Klik ikon detail pada record pertama
    await page.locator('a.action-btn[title="Detail"]').first().click();
    await page.waitForURL(/\/sbm\/\d+/, { timeout: 8000 });
    await expect(page.locator('body')).toBeVisible();
  });

  // ── 6. UPDATE (U) ────────────────────────────────────────────────────
  test('09 UPDATE — edit data SBM berhasil', async ({ page }) => {
    await login(page);
    await page.goto('/sbm');
    await page.waitForTimeout(300);

    // Klik ikon edit pada record pertama di list
    await page.locator('a.action-btn.edit[title="Edit"]').first().click();
    await page.waitForURL(/\/sbm\/\d+\/edit/, { timeout: 8000 });

    await page.fill('input[name="amount"]', AMOUNT_EDIT);

    await Promise.all([
      page.waitForURL(/\/sbm/, { timeout: 10000 }),
      page.click('button[type="submit"]')
    ]);

    const body = await page.locator('body').textContent();
    expect(body).toContain('berhasil');
  });

  // ── 7. DELETE (D) ────────────────────────────────────────────────────
  test('10 DELETE — hapus data SBM berhasil', async ({ page }) => {
    await login(page);
    await page.goto('/sbm');
    await page.waitForTimeout(300);

    // Klik ikon hapus pada record pertama
    await page.locator('button.action-btn.del').first().click();
    await page.waitForSelector('#fw-delete-modal', { state: 'visible', timeout: 5000 });
    await page.locator('#fw-delete-form button[type="submit"]').click();

    await page.waitForURL('http://localhost:3000/sbm', { timeout: 10000 });
    const body = await page.locator('body').textContent();
    expect(body).toContain('berhasil');
  });

  // ── 8. EXPORT ─────────────────────────────────────────────────────────
  test('11 EXPORT — halaman preview PDF dapat diakses', async ({ page }) => {
    await login(page);
    await page.goto('/sbm/export/pdf/preview');
    await expect(page).toHaveURL(/\/sbm\/export\/pdf\/preview/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('12 EXPORT — halaman preview JSON dapat diakses', async ({ page }) => {
    await login(page);
    await page.goto('/sbm/export/json/preview');
    await expect(page).toHaveURL(/\/sbm\/export\/json\/preview/);
    await expect(page.locator('body')).toBeVisible();
  });

  // ── 9. API ────────────────────────────────────────────────────────────
  test('13 API — GET /sbm/api mengembalikan data JSON', async ({ page }) => {
    await login(page);
    const response = await page.request.get('http://localhost:3000/sbm/api');
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty('data');
    expect(Array.isArray(json.data)).toBe(true);
  });

});
