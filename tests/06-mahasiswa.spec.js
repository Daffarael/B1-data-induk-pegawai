// tests/06-mahasiswa.spec.js
// Test CRUD lengkap: Modul Data Mahasiswa

const { test, expect } = require('@playwright/test');
const { loginMahasiswa } = require('./helpers/auth');

const NIM_TEST  = '9990000001';
const NAMA_TEST = 'PLAYWRIGHT TEST MAHASISWA';
const NAMA_EDIT = 'PLAYWRIGHT TEST MAHASISWA EDITED';

// ── Cleanup sebelum semua test ─────────────────────────────────────────
test.beforeAll(async ({ browser }) => {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await loginMahasiswa(page);
    for (let i = 0; i < 5; i++) {
      await page.goto('/mahasiswa?search=PLAYWRIGHT+TEST');
      await page.waitForTimeout(800);
      const delBtn = page.locator('button.action-btn.del').first();
      if (!await delBtn.isVisible()) break;
      await delBtn.click();
      await page.waitForSelector('#fw-delete-modal', { state: 'visible', timeout: 5000 });
      await page.locator('#fw-delete-form button[type="submit"]').click();
      await page.waitForURL(/\/mahasiswa/, { timeout: 8000 });
    }
  } catch (e) { /* ignore cleanup errors */ }
  await ctx.close();
});

test.describe('Modul Data Mahasiswa — CRUD Lengkap', () => {

  // ── 1. AKSES & NAVIGASI ──────────────────────────────────────────────
  test('01 halaman daftar mahasiswa dapat diakses', async ({ page }) => {
    await loginMahasiswa(page);
    await page.goto('/mahasiswa');
    await expect(page).toHaveURL(/\/mahasiswa/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('02 akses tanpa login diredirect ke login', async ({ browser }) => {
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/mahasiswa');
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });

  // ── 2. FORM & VALIDASI ───────────────────────────────────────────────
  test('03 form tambah mahasiswa memiliki field wajib', async ({ page }) => {
    await loginMahasiswa(page);
    await page.goto('/mahasiswa/create');
    await expect(page.locator('input[name="regno"]')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="birth_date"]')).toBeVisible();
    await expect(page.locator('select[name="gender"]')).toBeVisible();
    await expect(page.locator('select[name="department_id"]')).toBeVisible();
    await expect(page.locator('input[name="year"]')).toBeVisible();
    await expect(page.locator('select[name="status"]')).toBeVisible();
  });

  test('04 submit form kosong ditolak validasi client-side', async ({ page }) => {
    await loginMahasiswa(page);
    await page.goto('/mahasiswa/create');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/mahasiswa\/create/);
    await expect(page.locator('.cv-err').first()).toBeVisible();
  });

  test('05 validasi email format salah ditolak', async ({ page }) => {
    await loginMahasiswa(page);
    await page.goto('/mahasiswa/create');
    await page.fill('input[name="regno"]', '8880000001');
    await page.fill('input[name="name"]', 'Test Email Invalid');
    await page.fill('input[name="birth_date"]', '2000-01-01');
    await page.selectOption('select[name="gender"]', '1');
    await page.selectOption('select[name="department_id"]', { index: 1 });
    await page.fill('input[name="year"]', '2024');
    await page.selectOption('select[name="status"]', { index: 1 });
    await page.fill('input[name="email"]', 'email-tidak-valid');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/mahasiswa\/create/);
    const body = await page.locator('body').textContent();
    expect(body).toContain('email');
  });

  test('06 validasi tahun angkatan di luar range ditolak', async ({ page }) => {
    await loginMahasiswa(page);
    await page.goto('/mahasiswa/create');
    await page.fill('input[name="regno"]', '8880000002');
    await page.fill('input[name="name"]', 'Test Tahun Invalid');
    await page.fill('input[name="birth_date"]', '2000-01-01');
    await page.selectOption('select[name="gender"]', '1');
    await page.selectOption('select[name="department_id"]', { index: 1 });
    await page.fill('input[name="year"]', '1999'); // di bawah 2000
    await page.selectOption('select[name="status"]', { index: 1 });
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/mahasiswa\/create/);
  });

  // ── 3. CREATE (C) ────────────────────────────────────────────────────
  test('07 CREATE — tambah data mahasiswa baru berhasil', async ({ page }) => {
    await loginMahasiswa(page);
    await page.goto('/mahasiswa/create');

    await page.fill('input[name="regno"]', NIM_TEST);
    await page.fill('input[name="name"]', NAMA_TEST);
    await page.fill('input[name="birth_date"]', '2000-06-15');
    await page.selectOption('select[name="gender"]', '1');
    await page.selectOption('select[name="department_id"]', { index: 1 });
    await page.fill('input[name="year"]', '2024');
    await page.selectOption('select[name="status"]', { index: 1 });

    // Gunakan Promise.all agar tidak premature-resolve (URL /mahasiswa/create juga cocok /mahasiswa/)
    await Promise.all([
      page.waitForURL('http://localhost:3000/mahasiswa', { timeout: 10000 }),
      page.click('button[type="submit"]')
    ]);

    await expect(page).toHaveURL('http://localhost:3000/mahasiswa');
    const body = await page.locator('body').textContent();
    expect(body).toContain('berhasil');
  });

  // ── 4. READ LIST & SEARCH (R) ────────────────────────────────────────
  test('08 fitur pencarian mahasiswa berfungsi', async ({ page }) => {
    await loginMahasiswa(page);
    await page.goto('/mahasiswa');
    const searchInput = page.locator('input[name="search"]').first();
    await searchInput.fill('PLAYWRIGHT TEST');
    await page.keyboard.press('Enter');
    await page.waitForURL(/search=/, { timeout: 8000 });
    const body = await page.locator('body').textContent();
    expect(body).toContain(NAMA_TEST);
  });

  // ── 5. READ DETAIL (R) ───────────────────────────────────────────────
  test('09 READ DETAIL — halaman detail mahasiswa dapat diakses', async ({ page }) => {
    await loginMahasiswa(page);
    await page.goto('/mahasiswa?search=PLAYWRIGHT+TEST');
    await page.waitForTimeout(300);
    // Klik ikon detail (mata)
    await page.locator('a.action-btn[title="Detail"]').first().click();
    await page.waitForURL(/\/mahasiswa\/\d+/, { timeout: 8000 });
    await expect(page.locator('body')).toContainText('PLAYWRIGHT TEST');
  });

  // ── 6. UPDATE (U) ────────────────────────────────────────────────────
  test('10 UPDATE — edit data mahasiswa berhasil', async ({ page }) => {
    await loginMahasiswa(page);
    await page.goto('/mahasiswa?search=PLAYWRIGHT+TEST');
    await page.waitForTimeout(300);
    await page.locator('a.action-btn.edit[title="Edit"]').first().click();
    await page.waitForURL(/\/mahasiswa\/\d+\/edit/, { timeout: 8000 });
    await page.fill('input[name="name"]', NAMA_EDIT);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/mahasiswa\/\d+/, { timeout: 10000 });
    const body = await page.locator('body').textContent();
    expect(body).toContain('berhasil');
  });

  // ── 7. DELETE (D) ────────────────────────────────────────────────────
  test('11 DELETE — hapus data mahasiswa berhasil', async ({ page }) => {
    await loginMahasiswa(page);
    await page.goto('/mahasiswa?search=PLAYWRIGHT+TEST');
    await page.waitForTimeout(500);
    await page.locator('button.action-btn.del').first().click();
    await page.waitForSelector('#fw-delete-modal', { state: 'visible', timeout: 5000 });
    await page.locator('#fw-delete-form button[type="submit"]').click();
    await page.waitForURL('http://localhost:3000/mahasiswa', { timeout: 10000 });
    const body = await page.locator('body').textContent();
    expect(body).toContain('berhasil');
    await page.goto('/mahasiswa?search=PLAYWRIGHT+TEST+EDITED');
    const bodyAfter = await page.locator('body').textContent();
    expect(bodyAfter).not.toContain(NIM_TEST);
  });

  // ── 8. EXPORT ─────────────────────────────────────────────────────────
  test('12 EXPORT — halaman preview PDF dapat diakses', async ({ page }) => {
    await loginMahasiswa(page);
    await page.goto('/mahasiswa/export/pdf/preview');
    await expect(page).toHaveURL(/\/mahasiswa\/export\/pdf\/preview/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('13 EXPORT — halaman preview JSON dapat diakses', async ({ page }) => {
    await loginMahasiswa(page);
    await page.goto('/mahasiswa/export/json/preview');
    await expect(page).toHaveURL(/\/mahasiswa\/export\/json\/preview/);
    await expect(page.locator('body')).toBeVisible();
  });

  // ── 9. API ────────────────────────────────────────────────────────────
  test('14 API — GET /mahasiswa/api mengembalikan data JSON', async ({ page }) => {
    await loginMahasiswa(page);
    const response = await page.request.get('http://localhost:3000/mahasiswa/api');
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty('data');
    expect(Array.isArray(json.data)).toBe(true);
  });

});
