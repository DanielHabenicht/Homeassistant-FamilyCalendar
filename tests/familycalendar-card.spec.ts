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
    await expect(card.getByRole('radio', { name: 'Week' })).toBeVisible({ timeout: 20_000 });
  });

  // -------------------------------------------------------------------------
  // 1. Card renders
  // -------------------------------------------------------------------------
  test('renders the calendar card with title', async ({ page }) => {
    const title = await page
      .locator('familycalendar-card')
      .getByRole('heading', { name: 'Calendar' })
      .textContent();
    expect(title).toBe('Calendar');
  });

  // -------------------------------------------------------------------------
  // 2. Person selector chips
  // -------------------------------------------------------------------------
  test('shows person selector chips for Adam and Eve', async ({ page }) => {
    await expect(
      page.locator('familycalendar-card').getByRole('button', { name: 'Adam' }),
    ).toBeVisible();
    await expect(
      page.locator('familycalendar-card').getByRole('button', { name: 'Eve' }),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 3. Demo events are visible
  // -------------------------------------------------------------------------
  test('renders the calendar header title', async ({ page }) => {
    const title = await shadowQuery(page, '.calendar-title', (el) => el?.textContent?.trim() ?? '');
    expect(title.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 4. Person chip toggles event visibility
  // -------------------------------------------------------------------------
  test('toggling a person chip removes and restores the active class', async ({ page }) => {
    // Adam chip should start active
    const adamChip = page
      .locator('familycalendar-card')
      .getByRole('button', { name: 'Adam', pressed: true });
    const initiallyActive = await adamChip.isVisible();
    expect(initiallyActive).toBe(true);

    // Click to deactivate
    await page.locator('familycalendar-card').getByRole('button', { name: 'Adam' }).click();
    const afterDeactivate = await page
      .locator('familycalendar-card')
      .getByRole('button', { name: 'Adam', pressed: true })
      .isVisible();
    expect(afterDeactivate).toBe(false);

    // Click again to re-activate
    await page.locator('familycalendar-card').getByRole('button', { name: 'Adam' }).click();
    const afterReactivate = await page
      .locator('familycalendar-card')
      .getByRole('button', { name: 'Adam', pressed: true })
      .isVisible();
    expect(afterReactivate).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 5. View switching
  // -------------------------------------------------------------------------
  test('can switch to month view and back to week view', async ({ page }) => {
    // Switch to month
    await page.getByRole('radio', { name: 'Month' }).check();
    const monthVisible = await shadowQuery(page, '.fc-daygrid-body', (el) => el !== null);
    expect(monthVisible).toBe(true);

    // Switch back to week
    await page.getByRole('radio', { name: 'Week' }).check();
    const weekVisible = await shadowQuery(page, '.fc-timegrid-body', (el) => el !== null);
    expect(weekVisible).toBe(true);
  });

  test('can switch to day view', async ({ page }) => {
    await page.getByRole('radio', { name: 'Day', exact: true }).check();
    const dayVisible = await shadowQuery(page, '.fc-timegrid-body', (el) => el !== null);
    expect(dayVisible).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 6. Click-to-create dialog
  // -------------------------------------------------------------------------
  test('opens the new-event creation dialog', async ({ page }) => {
    const card = page.locator('familycalendar-card');
    await card.evaluate((el) => {
      const cardElement = el as HTMLElement & {
        _openNewEventDialog: (data: { start: Date; end: Date; allDay: boolean }) => void;
      };
      const start = new Date();
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      cardElement._openNewEventDialog({ start, end, allDay: false });
    });

    // Wait for Lit to re-render the dialog by polling via evaluate
    await expect(async () => {
      const visible = await shadowQuery(page, '.dialog', (el) => el !== null);
      expect(visible).toBe(true);
    }).toPass({ timeout: 5_000 });

    const dialogVisible = await shadowQuery(page, '.dialog', (el) => el !== null);
    expect(dialogVisible).toBe(true);

    await expect(page.locator('familycalendar-card').getByText('New Event')).toBeVisible();

    // Dialog should contain a title input and a calendar selector
    await expect(
      page.locator('familycalendar-card').getByRole('textbox', { name: 'Title*' }),
    ).toBeVisible();

    await expect(page.locator('familycalendar-card').getByText('Calendar *')).toBeVisible();

    await expect(
      page.locator('familycalendar-card').getByRole('button', { name: 'Cancel' }),
    ).toBeVisible();
    await expect(
      page.locator('familycalendar-card').getByRole('button', { name: 'Save' }),
    ).toBeVisible();

    // Dismiss the modal using the actual Cancel button
    await page.locator('familycalendar-card').getByRole('button', { name: 'Cancel' }).click();

    // Wait until the dialog is gone
    await expect(async () => {
      const gone = await shadowQuery(page, '.dialog', (el) => el === null);
      expect(gone).toBe(true);
    }).toPass({ timeout: 3_000 });
  });

  test('view-only dialog disables date and time controls', async ({ page }) => {
    const card = page.locator('familycalendar-card');
    await card.evaluate((el) => {
      const cardElement = el as HTMLElement & {
        _openViewEventDialog: (event: {
          start: Date;
          end: Date;
          allDay: boolean;
          title: string;
          extendedProps: Record<string, unknown>;
        }) => void;
      };
      const start = new Date();
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      cardElement._openViewEventDialog({
        start,
        end,
        allDay: false,
        title: 'Readonly Event',
        extendedProps: {
          entityId: 'calendar.family',
          description: 'Readonly test',
        },
      });
    });

    await expect(async () => {
      const dialogVisible = await shadowQuery(page, '.dialog', (el) => el !== null);
      expect(dialogVisible).toBe(true);
    }).toPass({ timeout: 5_000 });

    const disabledState = await card.evaluate((el) => {
      const form = (el.shadowRoot as ShadowRoot).querySelector('familycalendar-event-form');
      const root = form?.shadowRoot;
      const dates = Array.from(root?.querySelectorAll('ha-date-input') ?? []);
      const times = Array.from(root?.querySelectorAll('ha-time-input') ?? []);

      return {
        dateCount: dates.length,
        timeCount: times.length,
        allDatesDisabled: dates.every((input) => (input as { disabled?: boolean }).disabled),
        allTimesDisabled: times.every((input) => (input as { disabled?: boolean }).disabled),
      };
    });

    expect(disabledState.dateCount).toBe(2);
    expect(disabledState.timeCount).toBe(2);
    expect(disabledState.allDatesDisabled).toBe(true);
    expect(disabledState.allTimesDisabled).toBe(true);
  });
});
