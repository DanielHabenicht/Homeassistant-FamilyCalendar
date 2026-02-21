/**
 * Utility functions for the Skylight Calendar Card
 */

import type { CalendarCardConfig, HomeAssistant, PersonGroup } from './types.js';

/** Default palette for auto-assigning colors to calendars/persons */
export const DEFAULT_COLORS = [
  '#039be5',
  '#33b679',
  '#8e24aa',
  '#e67c73',
  '#f6c026',
  '#f5511d',
  '#0b8043',
  '#d50000',
  '#e4c441',
  '#616161',
];

/**
 * Returns a list of all calendar entity IDs derived from the config.
 * Merges `config.calendars` and calendars listed in `config.persons`.
 */
export function getAllCalendarIds(config: CalendarCardConfig): string[] {
  const ids = new Set<string>(config.calendars ?? []);
  for (const person of config.persons ?? []) {
    for (const cal of person.calendars) {
      ids.add(cal);
    }
  }
  return Array.from(ids);
}

/**
 * Resolves the color for a given calendar entity id.
 * Calendars inside a PersonGroup inherit that group's color if no explicit
 * per-calendar color mapping is defined (future extension).
 */
export function getCalendarColor(
  entityId: string,
  config: CalendarCardConfig,
  index: number,
): string {
  for (const person of config.persons ?? []) {
    if (person.calendars.includes(entityId) && person.color) {
      return person.color;
    }
  }
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

/**
 * Find the PersonGroup for a given calendar entity id, or undefined.
 */
export function getPersonForCalendar(
  entityId: string,
  config: CalendarCardConfig,
): PersonGroup | undefined {
  return (config.persons ?? []).find((p) => p.calendars.includes(entityId));
}

/**
 * Fetch calendar events from Home Assistant for a given entity and date range.
 */
export async function fetchCalendarEvents(
  hass: HomeAssistant,
  entityId: string,
  start: Date,
  end: Date,
): Promise<
  Array<{
    summary: string;
    description?: string;
    start: string;
    end: string;
    allDay: boolean;
  }>
> {
  const startStr = start.toISOString();
  const endStr = end.toISOString();
  const path = `calendars/${entityId}?start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}`;

  const events = await hass.callApi<
    Array<{
      summary: string;
      description?: string;
      start: { dateTime?: string; date?: string };
      end: { dateTime?: string; date?: string };
    }>
  >('GET', path);

  return events.map((ev) => {
    const allDay = !ev.start.dateTime;
    return {
      summary: ev.summary,
      description: ev.description,
      start: ev.start.dateTime ?? ev.start.date ?? '',
      end: ev.end.dateTime ?? ev.end.date ?? '',
      allDay,
    };
  });
}

/**
 * Format a Date to YYYY-MM-DDTHH:MM for use in datetime-local inputs.
 */
export function formatDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Format a Date to YYYY-MM-DD for use in date inputs.
 */
export function formatDateLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Resolve the preferred locale from Home Assistant, with browser fallback.
 */
export function getPreferredLocale(hass?: HomeAssistant): string {
  const hassLocale = hass?.locale?.language;
  const browserLocale =
    typeof navigator !== 'undefined' && Array.isArray(navigator.languages)
      ? (navigator.languages[0] ?? navigator.language)
      : undefined;

  const locale = (hassLocale ?? browserLocale ?? 'en').trim();
  return locale.replace(/_/g, '-');
}
