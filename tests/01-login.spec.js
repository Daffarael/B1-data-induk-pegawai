// tests/01-login.spec.js
// Test: Fitur Login & Logout

const { test, expect } = require('@playwright/test');
const { login, TEST_EMAIL, TEST_PASSWORD } = require('./helpers/auth');

test.describe('Login & Logout', () => {

  test('halaman login dapat diakses', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/login/i);
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('login berhasil dengan kredensial valid', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('login gagal dengan password salah', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', 'password_salah_123');
    await page.click('button[type="submit"]');
    // Harus tetap di halaman login (redirect balik)
    await expect(page).toHaveURL(/\/login/);
  });

  test('login gagal dengan email kosong', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/login/);
  });

  test('akses dashboard tanpa login diredirect ke login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout berhasil dan diredirect ke login', async ({ page }) => {
    await login(page);
    await page.goto('/logout');
    await expect(page).toHaveURL(/\/login/);
    // Setelah logout, akses dashboard harus redirect ke login
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

});
