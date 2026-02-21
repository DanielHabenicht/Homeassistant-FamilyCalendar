/**
 * FamilyCalendar for Homeassistant – Home Assistant Lovelace custom card
 *
 * Uses FullCalendar for rendering and provides:
 *  - Day / Week / Month views
 *  - Click-to-create new calendar entries
 *  - Person-selector switches to show/hide calendars
 *  - Configurable calendar list with optional person grouping
 */

import {
  LitElement,
  html,
  unsafeCSS,
  type PropertyValues,
  type TemplateResult,
  nothing,
} from 'lit';
import { property, state } from 'lit/decorators.js';
import { Calendar } from '@fullcalendar/core';
import allLocales from '@fullcalendar/core/locales-all';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

import type { EventInput } from '@fullcalendar/core';
import type { HomeAssistant, CalendarCardConfig, NewEventData } from './types.js';
import {
  getAllCalendarIds,
  getCalendarColor,
  getPersonForCalendar,
  fetchCalendarEvents,
  formatDateTimeLocal,
  formatDateLocal,
  getPreferredLocale,
} from './utils.js';
import styles from './familycalendar-card.scss';

// ---------------------------------------------------------------------------
// Card editor (simple config UI)
// ---------------------------------------------------------------------------
import './familycalendar-card-editor.js';

// ---------------------------------------------------------------------------
// Main card element
// ---------------------------------------------------------------------------

class FamilyCalendarForHomeassistantCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config?: CalendarCardConfig;

  /** IDs of calendars currently visible */
  @state() private _visibleCalendars: Set<string> = new Set();

  /** Controls the new-event creation dialog */
  @state() private _newEventData?: NewEventData;
  @state() private _newEventTitle = '';
  @state() private _newEventStart = '';
  @state() private _newEventEnd = '';
  @state() private _newEventCalendar = '';
  @state() private _newEventAllDay = false;
  @state() private _saving = false;
  @state() private _errorMessage = '';

  private _calendar?: Calendar;

  // FullCalendar instance is created once and reused
  private _fcInitialized = false;

  private _getLocale(): string {
    return getPreferredLocale(this.hass);
  }

  private _getText(
    key:
      | 'newEvent'
      | 'title'
      | 'placeholder'
      | 'allDay'
      | 'start'
      | 'end'
      | 'calendar'
      | 'cancel'
      | 'save'
      | 'saving'
      | 'titleError'
      | 'calendarError',
  ): string {
    const locale = this._getLocale().toLowerCase();
    const isGerman = locale.startsWith('de');

    const de: Record<typeof key, string> = {
      newEvent: 'Neuer Termin',
      title: 'Titel',
      placeholder: 'Termintitel',
      allDay: 'Ganztägig',
      start: 'Start',
      end: 'Ende',
      calendar: 'Kalender',
      cancel: 'Abbrechen',
      save: 'Speichern',
      saving: 'Speichere…',
      titleError: 'Bitte einen Titel eingeben.',
      calendarError: 'Bitte einen Kalender auswählen.',
    };

    const en: Record<typeof key, string> = {
      newEvent: 'New Event',
      title: 'Title',
      placeholder: 'Event title',
      allDay: 'All day',
      start: 'Start',
      end: 'End',
      calendar: 'Calendar',
      cancel: 'Cancel',
      save: 'Save',
      saving: 'Saving…',
      titleError: 'Please enter a title.',
      calendarError: 'Please select a calendar.',
    };

    return (isGerman ? de : en)[key];
  }

  static get properties() {
    return {
      hass: { attribute: false },
      _config: { state: true },
      _visibleCalendars: { state: true },
      _newEventData: { state: true },
    };
  }

  // HA card config interface
  setConfig(config: CalendarCardConfig) {
    if (!config) throw new Error('Invalid configuration');
    this._config = config;
    const allIds = getAllCalendarIds(config);
    this._visibleCalendars = new Set(allIds);
    this._newEventCalendar = allIds[0] ?? '';
  }

  static getConfigElement() {
    return document.createElement('familycalendar-for-homeassistant-editor');
  }

  static getStubConfig() {
    return {
      type: 'custom:familycalendar-for-homeassistant',
      title: 'Calendar',
      calendars: [],
      persons: [],
      initial_view: 'dayGridMonth',
    };
  }

  // Build unique person groups (or synthetic ones for ungrouped calendars)
  private get _personGroups(): Array<{
    key: string;
    label: string;
    ids: string[];
    color?: string;
    icon?: string;
  }> {
    if (!this._config) return [];
    const allIds = getAllCalendarIds(this._config);
    const groups: Array<{
      key: string;
      label: string;
      ids: string[];
      color?: string;
      icon?: string;
    }> = [];
    const grouped = new Set<string>();

    for (const person of this._config.persons ?? []) {
      groups.push({
        key: person.name,
        label: person.name,
        ids: person.calendars,
        color: person.color,
        icon: person.icon,
      });
      person.calendars.forEach((id) => grouped.add(id));
    }

    // Ungrouped calendars get their own synthetic entry
    const ungrouped = allIds.filter((id) => !grouped.has(id));
    for (const id of ungrouped) {
      groups.push({ key: id, label: id.replace('calendar.', '').replace(/_/g, ' '), ids: [id] });
    }

    return groups;
  }

  private _isGroupVisible(group: { ids: string[] }): boolean {
    return group.ids.some((id) => this._visibleCalendars.has(id));
  }

  private _toggleGroup(group: { ids: string[] }) {
    const visible = new Set(this._visibleCalendars);
    const currentlyVisible = this._isGroupVisible(group);
    for (const id of group.ids) {
      if (currentlyVisible) {
        visible.delete(id);
      } else {
        visible.add(id);
      }
    }
    this._visibleCalendars = visible;
    this._refreshCalendarSources();
  }

  // -------------------------------------------------------------------------
  // FullCalendar lifecycle
  // -------------------------------------------------------------------------

  private _initCalendar(container: HTMLDivElement) {
    if (!this._config) return;

    const self = this;
    const locale = this._getLocale();
    this._calendar = new Calendar(container, {
      plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
      locales: allLocales,
      locale,
      initialView: this._config.initial_view ?? 'dayGridMonth',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay',
      },
      height: 'auto',
      editable: false,
      selectable: true,
      selectMirror: true,
      dayMaxEvents: true,
      // Click on a time slot or day cell opens the new-event dialog
      select(info) {
        self._openNewEventDialog({
          start: info.start,
          end: info.end,
          allDay: info.allDay,
        });
      },
      dateClick(info) {
        // Fallback for month view single-day clicks
        const start = info.date;
        const end = new Date(start);
        end.setHours(start.getHours() + 1);
        self._openNewEventDialog({ start, end, allDay: info.allDay });
      },
      eventSources: self._buildEventSources(),
    });

    this._calendar.render();
    this._fcInitialized = true;
  }

  private _buildEventSources() {
    if (!this._config || !this.hass) return [];

    const allIds = getAllCalendarIds(this._config);
    return allIds
      .filter((id) => this._visibleCalendars.has(id))
      .map((entityId, idx) => {
        const color = getCalendarColor(entityId, this._config!, idx);
        const hass = this.hass;
        return {
          id: entityId,
          color,
          events: async (
            fetchInfo: { start: Date; end: Date },
            successCallback: (events: EventInput[]) => void,
            failureCallback: (error: Error) => void,
          ) => {
            try {
              const evs = await fetchCalendarEvents(hass, entityId, fetchInfo.start, fetchInfo.end);
              successCallback(
                evs.map((ev) => ({
                  title: ev.summary,
                  start: ev.start,
                  end: ev.end,
                  allDay: ev.allDay,
                  extendedProps: { description: ev.description, entityId },
                })),
              );
            } catch (e) {
              failureCallback(e as Error);
            }
          },
        };
      });
  }

  private _refreshCalendarSources() {
    if (!this._calendar || !this._config) return;

    // Remove all existing sources and re-add with current visibility filter
    this._calendar.getEventSources().forEach((src) => src.remove());
    const allIds = getAllCalendarIds(this._config);
    allIds
      .filter((id) => this._visibleCalendars.has(id))
      .forEach((entityId, idx) => {
        const color = getCalendarColor(entityId, this._config!, idx);
        const hass = this.hass;
        this._calendar!.addEventSource({
          id: entityId,
          color,
          events: async (
            fetchInfo: { start: Date; end: Date },
            successCallback: (events: EventInput[]) => void,
            failureCallback: (error: Error) => void,
          ) => {
            try {
              const evs = await fetchCalendarEvents(hass, entityId, fetchInfo.start, fetchInfo.end);
              successCallback(
                evs.map((ev) => ({
                  title: ev.summary,
                  start: ev.start,
                  end: ev.end,
                  allDay: ev.allDay,
                  extendedProps: { description: ev.description, entityId },
                })),
              );
            } catch (e) {
              failureCallback(e as Error);
            }
          },
        });
      });
  }

  // -------------------------------------------------------------------------
  // New-event dialog
  // -------------------------------------------------------------------------

  private _openNewEventDialog(data: NewEventData) {
    this._newEventData = data;
    this._newEventTitle = '';
    this._newEventAllDay = data.allDay;
    if (data.allDay) {
      this._newEventStart = formatDateLocal(data.start);
      const endDate = new Date(data.end);
      endDate.setDate(endDate.getDate() - 1); // FC end is exclusive
      this._newEventEnd = formatDateLocal(endDate);
    } else {
      this._newEventStart = formatDateTimeLocal(data.start);
      this._newEventEnd = formatDateTimeLocal(data.end);
    }
    const allIds = getAllCalendarIds(this._config!);
    if (!allIds.includes(this._newEventCalendar)) {
      this._newEventCalendar = allIds[0] ?? '';
    }
    this._errorMessage = '';
  }

  private _closeDialog() {
    this._newEventData = undefined;
    this._calendar?.unselect();
  }

  private async _saveEvent() {
    if (!this._newEventTitle.trim()) {
      this._errorMessage = this._getText('titleError');
      return;
    }
    if (!this._newEventCalendar) {
      this._errorMessage = this._getText('calendarError');
      return;
    }

    this._saving = true;
    this._errorMessage = '';
    try {
      const startVal = this._newEventStart;
      const endVal = this._newEventEnd;

      if (this._newEventAllDay) {
        await this.hass.callService('calendar', 'create_event', {
          entity_id: this._newEventCalendar,
          summary: this._newEventTitle.trim(),
          start_date: startVal,
          end_date: endVal,
        });
      } else {
        await this.hass.callService('calendar', 'create_event', {
          entity_id: this._newEventCalendar,
          summary: this._newEventTitle.trim(),
          start_date_time: startVal,
          end_date_time: endVal,
        });
      }

      this._closeDialog();
      // Refresh all event sources
      this._calendar?.getEventSources().forEach((src) => src.refetch());
    } catch (e) {
      this._errorMessage = `Failed to create event: ${(e as Error).message}`;
    } finally {
      this._saving = false;
    }
  }

  // -------------------------------------------------------------------------
  // Lit lifecycle
  // -------------------------------------------------------------------------

  protected updated(changed: PropertyValues) {
    super.updated(changed);
    if (!this._fcInitialized && this._config && this.hass) {
      const container = this.shadowRoot?.querySelector<HTMLDivElement>('#fc-container');
      if (container) {
        this._initCalendar(container);
      }
    } else if (this._fcInitialized && changed.has('hass')) {
      const previousHass = changed.get('hass') as HomeAssistant | undefined;
      const previousLocale = getPreferredLocale(previousHass);
      const currentLocale = this._getLocale();
      if (previousLocale !== currentLocale) {
        this._calendar?.setOption('locale', currentLocale);
      }
      // Refetch when hass updates (e.g. entity state changes)
      this._calendar?.getEventSources().forEach((src) => src.refetch());
    }
  }

  protected render(): TemplateResult {
    if (!this._config) return html`<div>No configuration</div>`;

    const groups = this._personGroups;
    const title = this._config.title ?? 'Calendar';

    return html`
      <ha-card>
        <div class="card-header">
          <span class="card-title">Tester${title}</span>
        </div>

        ${groups.length > 1
          ? html`
              <div class="person-selectors">
                ${groups.map(
                  (group) => html`
                    <button
                      class="person-chip ${this._isGroupVisible(group) ? 'active' : ''}"
                      title="${group.label}"
                      @click=${() => this._toggleGroup(group)}
                    >
                      ${group.icon
                        ? html`<ha-icon icon="${group.icon}"></ha-icon>`
                        : html`<span class="person-avatar"
                            >${group.label.charAt(0).toUpperCase()}</span
                          >`}
                      <span class="person-name">${group.label}</span>
                    </button>
                  `,
                )}
              </div>
            `
          : nothing}

        <div class="calendar-wrapper">
          <div id="fc-container"></div>
        </div>

        ${this._newEventData ? this._renderDialog() : nothing}
      </ha-card>
    `;
  }

  private _renderDialog(): TemplateResult {
    const allIds = getAllCalendarIds(this._config!);
    const inputType = this._newEventAllDay ? 'date' : 'datetime-local';
    const locale = this._getLocale();

    return html`
      <div class="dialog-overlay" @click=${this._closeDialog}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          <h3 class="dialog-title">${this._getText('newEvent')}</h3>

          <label class="dialog-label">
            ${this._getText('title')}
            <input
              class="dialog-input"
              type="text"
              placeholder="${this._getText('placeholder')}"
              .value=${this._newEventTitle}
              @input=${(e: Event) => (this._newEventTitle = (e.target as HTMLInputElement).value)}
              @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this._saveEvent()}
            />
          </label>

          <label class="dialog-label">
            <input
              type="checkbox"
              .checked=${this._newEventAllDay}
              @change=${(e: Event) => {
                this._newEventAllDay = (e.target as HTMLInputElement).checked;
                // Re-format dates when toggling all-day
                if (this._newEventData) this._openNewEventDialog(this._newEventData);
              }}
            />
            ${this._getText('allDay')}
          </label>

          <label class="dialog-label">
            ${this._getText('start')}
            <input
              class="dialog-input"
              type="${inputType}"
              lang="${locale}"
              .value=${this._newEventStart}
              @input=${(e: Event) => (this._newEventStart = (e.target as HTMLInputElement).value)}
            />
          </label>

          <label class="dialog-label">
            ${this._getText('end')}
            <input
              class="dialog-input"
              type="${inputType}"
              lang="${locale}"
              .value=${this._newEventEnd}
              @input=${(e: Event) => (this._newEventEnd = (e.target as HTMLInputElement).value)}
            />
          </label>

          <label class="dialog-label">
            ${this._getText('calendar')}
            <select
              class="dialog-input"
              .value=${this._newEventCalendar}
              @change=${(e: Event) =>
                (this._newEventCalendar = (e.target as HTMLSelectElement).value)}
            >
              ${allIds.map(
                (id) => html`
                  <option value="${id}" ?selected=${id === this._newEventCalendar}>
                    ${this._calendarLabel(id)}
                  </option>
                `,
              )}
            </select>
          </label>

          ${this._errorMessage ? html`<p class="dialog-error">${this._errorMessage}</p>` : nothing}

          <div class="dialog-actions">
            <button class="dialog-btn dialog-btn--cancel" @click=${this._closeDialog}>
              ${this._getText('cancel')}
            </button>
            <button
              class="dialog-btn dialog-btn--save"
              ?disabled=${this._saving}
              @click=${this._saveEvent}
            >
              ${this._saving ? this._getText('saving') : this._getText('save')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private _calendarLabel(entityId: string): string {
    const person = getPersonForCalendar(entityId, this._config!);
    if (person) return `${person.name} – ${entityId.replace('calendar.', '').replace(/_/g, ' ')}`;
    return entityId.replace('calendar.', '').replace(/_/g, ' ');
  }

  static styles = unsafeCSS(styles);
}

customElements.define('familycalendar-for-homeassistant', FamilyCalendarForHomeassistantCard);

// Register card in HA's custom card registry
(window as unknown as Record<string, unknown>)['customCards'] =
  (window as unknown as Record<string, unknown[]>)['customCards'] ?? [];
(
  (window as unknown as Record<string, unknown[]>)['customCards'] as Array<{
    type: string;
    name: string;
    description: string;
    preview: boolean;
  }>
).push({
  type: 'familycalendar-for-homeassistant',
  name: 'FamilyCalendar for Homeassistant',
  description: 'A calendar card with day/week/month views and person selectors',
  preview: false,
});
