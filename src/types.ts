/**
 * Types for FamilyCalendar for Homeassistant
 */

// Home Assistant types
export interface HomeAssistant {
  states: Record<string, HassEntity>;
  callService(domain: string, service: string, serviceData: Record<string, unknown>): Promise<void>;
  callApi<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    parameters?: Record<string, unknown>,
  ): Promise<T>;
  locale: {
    language: string;
  };
  themes: {
    darkMode: boolean;
  };
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

// Calendar API types
export interface CalendarEvent {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  uid?: string;
}

export interface CalendarEventResponse {
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay?: boolean;
  entityId?: string;
}

// Card config types
export interface PersonGroup {
  /** Display name for the person/group */
  name: string;
  /** Entity IDs of calendars belonging to this person */
  calendars: string[];
  /** Optional color for this person's events */
  color?: string;
  /** Optional icon (mdi icon name, e.g. mdi:account) */
  icon?: string;
}

export interface CalendarCardConfig {
  type: string;
  /** List of calendar entity IDs to display */
  calendars?: string[];
  /** Group calendars by person */
  persons?: PersonGroup[];
  /** Initial view: dayGridMonth | timeGridWeek | timeGridDay */
  initial_view?: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';
  /** Initial scroll time for time-grid views. Format HH:mm or HH:mm:ss */
  initial_time?: string;
  /** Show current time indicator in time-grid views */
  show_now_indicator?: boolean;
  /** Calendar height in CSS units (e.g. '600px', 'auto', '80vh') */
  height?: string;
  /** Card title */
  title?: string;
}

// FullCalendar event source type
export interface FCEventSource {
  id: string;
  entityId: string;
  color?: string;
}

// Dialog types for creating new events
export interface NewEventData {
  start: Date;
  end: Date;
  allDay: boolean;
}
