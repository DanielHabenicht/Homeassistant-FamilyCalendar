/**
 * Playwright setup: Home Assistant onboarding and authentication
 *
 * This file runs once before all tests. It:
 *  1. Checks whether HA has already been onboarded
 *  2. If not, walks through the onboarding wizard to create the test user
 *  3. Logs in and saves the browser auth state to tests/.auth.json
 *     so subsequent tests skip the login step.
 *
 * Credentials used: testuser / testpassword1
 * These are only intended for the local dev environment.
 */

import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const AUTH_FILE = path.join(__dirname, '.auth.json');

const HA_USERNAME = 'testuser';
const HA_PASSWORD = 'testpassword1';
const HA_NAME = 'Test User';

setup('Home Assistant onboarding & login', async ({ page }) => {
  // If auth state already exists and HA is running, reuse it
  if (fs.existsSync(AUTH_FILE)) {
    // Quick validation: load the state and confirm we can reach a page
    await page.context().addCookies([]);
    await page.goto('/lovelace/calendar');
    // If we land on a real HA page (not auth), auth state is still valid
    await page.waitForLoadState('networkidle');
    if (!page.url().includes('auth/authorize') && !page.url().includes('onboarding')) {
      return; // Auth state is still valid — skip re-login
    }
  }

  await page.goto('/');

  // Wait for either the onboarding page or the login page
  await page.waitForURL(/\/(onboarding\.html|auth\/authorize)/, { timeout: 30_000 });

  // -----------------------------------------------------------------------
  // Onboarding (only runs on a fresh HA instance)
  // -----------------------------------------------------------------------
  if (page.url().includes('onboarding')) {
    // Step 1: Welcome → Create my smart home
    await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible();
    await page.getByRole('button', { name: 'Create my smart home' }).click();

    // Step 2: Create user
    await expect(page.getByRole('heading', { name: 'Create user' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Name*' }).fill(HA_NAME);
    await page.getByRole('textbox', { name: 'Username*' }).fill(HA_USERNAME);
    await page.getByRole('textbox', { name: 'Password*', exact: true }).fill(HA_PASSWORD);
    await page.getByRole('textbox', { name: 'Confirm password*' }).fill(HA_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Step 3: Home location – skip by clicking Next
    await expect(page.getByRole('heading', { name: 'Home location' })).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 4: Country / units – click Next
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 5: Analytics – click Next
    await expect(page.getByRole('heading', { name: 'Help us help you' })).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 6: Discovered devices – click Finish
    await page.getByRole('button', { name: 'Finish' }).click();

    // After finishing onboarding, HA redirects to the auth callback which
    // may briefly show an error page before settling. Wait for the login form.
    await page.waitForURL(/auth\/authorize/, { timeout: 20_000 });
  }

  // -----------------------------------------------------------------------
  // Login
  // -----------------------------------------------------------------------
  await expect(page.getByRole('heading', { name: 'Welcome home!' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Username' }).fill(HA_USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).fill(HA_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();

  // Wait until we land on a real HA page (not auth)
  await page.waitForURL(/localhost:8123\/(home|lovelace|.+)/, { timeout: 20_000 });
  await expect(page).not.toHaveURL(/auth\/authorize/);

  // -----------------------------------------------------------------------
  // Save auth state for subsequent tests
  // -----------------------------------------------------------------------
  await page.context().storageState({ path: AUTH_FILE });
});
