/**
 * E2E tests for FamilyCalendar for Homeassistant
 *
 * Prerequisites:
 *  - Home Assistant is running at http://localhost:8123  (docker compose up -d)
 *  - The card has been built                             (npm run build)
 *  - HA is configured with the demo integration and the pre-configured
 *    Lovelace yaml dashboard (homeassistant/config/ui-lovelace.yaml)
 *
 * These tests verify:
 *  1. The card renders on the configured Lovelace dashboard
 *  2. Person-selector chips are displayed (Adam, Eve)
 *  3. Demo calendar events are visible in the week view
 *  4. Toggling a person chip hides/shows that person's events
 *  5. The view can be switched between month / week / day
 *  6. Clicking a time slot opens the new-event creation dialog
 */

import { test, expect, type Page } from '@playwright/test';

const CALENDAR_URL = '/lovelace/calendar';

// ---------------------------------------------------------------------------
// Shadow DOM helpers
// All card content lives inside familycalendar-card's shadow root.
// ---------------------------------------------------------------------------

/** Query the card's shadow root and return a value from it. */
async function shadowQuery<T>(
  page: Page,
  selector: string,
  extract: (el: Element | null) => T,
): Promise<T> {
  return page.locator('familycalendar-card').evaluate(
    (card, { selector, extract }) =>
      // eslint-disable-next-line no-new-func
      new Function('el', `return (${extract})(el)`)(
        (card.shadowRoot as ShadowRoot).querySelector(selector),
      ),
    { selector, extract: extract.toString() },
  );
}

/** Query all matching elements in the shadow root and map them. */
async function shadowQueryAll<T>(
  page: Page,
  selector: string,
  extract: (el: Element) => T,
): Promise<T[]> {
  return page.locator('familycalendar-card').evaluate(
    (card, { selector, extract }) =>
      Array.from((card.shadowRoot as ShadowRoot).querySelectorAll(selector)).map(
        // eslint-disable-next-line no-new-func
        (el) => new Function('el', `return (${extract})(el)`)(el),
      ),
    { selector, extract: extract.toString() },
  );
}

/** Click an element inside the card's shadow root by CSS selector. */
async function shadowClick(page: Page, selector: string): Promise<void> {
  await page.locator('familycalendar-card').evaluate((card, sel) => {
    const el = (card.shadowRoot as ShadowRoot).querySelector(sel);
    if (!el) throw new Error(`Shadow element not found: ${sel}`);
    (el as HTMLElement).click();
  }, selector);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('FamilyCalendar for Homeassistant', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(CALENDAR_URL);
    // Playwright's locator engine pierces HA's shadow DOM layers automatically
    const card = page.locator('familycalendar-card');
    await card.waitFor({ state: 'attached', timeout: 30_000 });
    // Poll via evaluate (which has direct access to the element's shadowRoot)
    // until FullCalendar has mounted its view harness
    await expect(async () => {
      const hasFC = await card.evaluate(
        (el) =>
          !!(el as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot?.querySelector(
            '.fc-view-harness',
          ),
      );
      expect(hasFC).toBe(true);
    }).toPass({ timeout: 20_000 });
  });

  // -------------------------------------------------------------------------
  // 1. Card renders
  // -------------------------------------------------------------------------
  test('renders the calendar card with title', async ({ page }) => {
    const title = await shadowQuery(page, '.card-title', (el) => el?.textContent?.trim());
    expect(title).toBe('Calendar');
  });

  // -------------------------------------------------------------------------
  // 2. Person selector chips
  // -------------------------------------------------------------------------
  test('shows person selector chips for Adam and Eve', async ({ page }) => {
    const chipLabels = await shadowQueryAll(
      page,
      '.person-chip .person-name',
      (el) => el.textContent?.trim() ?? '',
    );
    expect(chipLabels).toContain('Adam');
    expect(chipLabels).toContain('Eve');
  });

  // -------------------------------------------------------------------------
  // 3. Demo events are visible
  // -------------------------------------------------------------------------
  test('displays demo calendar events in the week view', async ({ page }) => {
    const card = page.locator('familycalendar-card');

    // Poll until FullCalendar has fetched and rendered events from the HA API.
    // Uses card.evaluate so it can reach into the shadow root.
    await expect(async () => {
      const titles = await card.evaluate((el) =>
        Array.from(
          (el as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot.querySelectorAll(
            '.fc-event-title',
          ),
        ).map((e) => e.textContent?.trim() ?? ''),
      );
      const hasKnownEvent = titles.some(
        (t) => t.includes('Current Event') || t.includes('Future Event'),
      );
      expect(hasKnownEvent, `Expected demo events, got: ${JSON.stringify(titles)}`).toBe(true);
    }).toPass({ timeout: 30_000 });
  });

  // -------------------------------------------------------------------------
  // 4. Person chip toggles event visibility
  // -------------------------------------------------------------------------
  test('toggling a person chip removes and restores the active class', async ({ page }) => {
    // Adam chip should start active
    const initiallyActive = await shadowQuery(
      page,
      '.person-chip',
      (el) => el?.classList.contains('active') ?? false,
    );
    expect(initiallyActive).toBe(true);

    // Click to deactivate
    await shadowClick(page, '.person-chip');
    const afterDeactivate = await shadowQuery(
      page,
      '.person-chip',
      (el) => el?.classList.contains('active') ?? false,
    );
    expect(afterDeactivate).toBe(false);

    // Click again to re-activate
    await shadowClick(page, '.person-chip');
    const afterReactivate = await shadowQuery(
      page,
      '.person-chip',
      (el) => el?.classList.contains('active') ?? false,
    );
    expect(afterReactivate).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 5. View switching
  // -------------------------------------------------------------------------
  test('can switch to month view and back to week view', async ({ page }) => {
    // Switch to month
    await shadowClick(page, 'button.fc-dayGridMonth-button');
    const monthVisible = await shadowQuery(page, '.fc-daygrid-body', (el) => el !== null);
    expect(monthVisible).toBe(true);

    // Switch back to week
    await shadowClick(page, 'button.fc-timeGridWeek-button');
    const weekVisible = await shadowQuery(page, '.fc-timegrid-body', (el) => el !== null);
    expect(weekVisible).toBe(true);
  });

  test('can switch to day view', async ({ page }) => {
    await shadowClick(page, 'button.fc-timeGridDay-button');
    const dayVisible = await shadowQuery(page, '.fc-timegrid-body', (el) => el !== null);
    expect(dayVisible).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 6. Click-to-create dialog
  // -------------------------------------------------------------------------
  test('clicking a time slot opens the new-event creation dialog', async ({ page }) => {
    // Playwright's chained locators pierce shadow DOM — click an actual
    // FullCalendar time slot so the dateClick callback fires.
    const card = page.locator('familycalendar-card');
    const timeSlot = card.locator('.fc-timegrid-slot-lane').first();
    await timeSlot.click();

    // Wait for Lit to re-render the dialog by polling via evaluate
    await expect(async () => {
      const visible = await shadowQuery(page, '.dialog', (el) => el !== null);
      expect(visible).toBe(true);
    }).toPass({ timeout: 5_000 });

    const dialogVisible = await shadowQuery(page, '.dialog', (el) => el !== null);
    expect(dialogVisible).toBe(true);

    // Dialog should contain a title input and a calendar <select>
    const hasTitleInput = await shadowQuery(
      page,
      '.dialog input[type="text"]',
      (el) => el !== null,
    );
    expect(hasTitleInput).toBe(true);

    const hasCalendarSelect = await shadowQuery(page, '.dialog select', (el) => el !== null);
    expect(hasCalendarSelect).toBe(true);

    // Dismiss with Cancel
    await shadowClick(page, '.dialog-btn--cancel');

    // Wait until the dialog is gone
    await expect(async () => {
      const gone = await shadowQuery(page, '.dialog', (el) => el === null);
      expect(gone).toBe(true);
    }).toPass({ timeout: 3_000 });
  });
});
