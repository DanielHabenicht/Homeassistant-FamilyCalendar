/**
 * Skylight Calendar Card – Home Assistant Lovelace custom card
 *
 * Uses FullCalendar for rendering and provides:
 *  - Day / Week / Month views
 *  - Click-to-create new calendar entries
 *  - Person-selector switches to show/hide calendars
 *  - Configurable calendar list with optional person grouping
 */

import { LitElement, html, css, type PropertyValues, type TemplateResult, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { Calendar } from '@fullcalendar/core';
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
} from './utils.js';

// ---------------------------------------------------------------------------
// Card editor (simple config UI)
// ---------------------------------------------------------------------------
import './calendar-card-editor.js';

// ---------------------------------------------------------------------------
// Main card element
// ---------------------------------------------------------------------------

class SkylightCalendarCard extends LitElement {
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
    return document.createElement('skylight-calendar-card-editor');
  }

  static getStubConfig() {
    return {
      type: 'custom:skylight-calendar-card',
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
    this._calendar = new Calendar(container, {
      plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
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
      this._errorMessage = 'Please enter a title.';
      return;
    }
    if (!this._newEventCalendar) {
      this._errorMessage = 'Please select a calendar.';
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
          <span class="card-title">${title}</span>
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

    return html`
      <div class="dialog-overlay" @click=${this._closeDialog}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          <h3 class="dialog-title">New Event</h3>

          <label class="dialog-label">
            Title
            <input
              class="dialog-input"
              type="text"
              placeholder="Event title"
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
            All day
          </label>

          <label class="dialog-label">
            Start
            <input
              class="dialog-input"
              type="${inputType}"
              .value=${this._newEventStart}
              @input=${(e: Event) => (this._newEventStart = (e.target as HTMLInputElement).value)}
            />
          </label>

          <label class="dialog-label">
            End
            <input
              class="dialog-input"
              type="${inputType}"
              .value=${this._newEventEnd}
              @input=${(e: Event) => (this._newEventEnd = (e.target as HTMLInputElement).value)}
            />
          </label>

          <label class="dialog-label">
            Calendar
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
              Cancel
            </button>
            <button
              class="dialog-btn dialog-btn--save"
              ?disabled=${this._saving}
              @click=${this._saveEvent}
            >
              ${this._saving ? 'Saving…' : 'Save'}
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

  // -------------------------------------------------------------------------
  // Styles
  // -------------------------------------------------------------------------

  static styles = css`
    :host {
      display: block;
    }

    ha-card {
      padding: 0;
      overflow: hidden;
    }

    .card-header {
      display: flex;
      align-items: center;
      padding: 16px 16px 8px;
      gap: 8px;
    }

    .card-title {
      font-size: 1.1rem;
      font-weight: 500;
      color: var(--primary-text-color);
    }

    /* ---- Person selector chips ---- */
    .person-selectors {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 0 16px 12px;
    }

    .person-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px 4px 4px;
      border-radius: 20px;
      border: 2px solid var(--divider-color, #e0e0e0);
      background: transparent;
      cursor: pointer;
      font-size: 0.85rem;
      color: var(--primary-text-color);
      transition:
        background 0.2s,
        border-color 0.2s;
    }

    .person-chip.active {
      background: var(--primary-color, #03a9f4);
      border-color: var(--primary-color, #03a9f4);
      color: #fff;
    }

    .person-chip.active .person-avatar {
      background: rgba(255, 255, 255, 0.3);
      color: #fff;
    }

    .person-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--secondary-background-color, #e0e0e0);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.85rem;
    }

    .person-name {
      line-height: 1;
    }

    /* ---- Calendar wrapper ---- */
    .calendar-wrapper {
      padding: 0 8px 16px;
    }

    #fc-container {
      width: 100%;
    }

    /* Override FullCalendar styles to fit HA theme */
    #fc-container .fc {
      font-family: inherit;
      color: var(--primary-text-color);
    }

    #fc-container .fc-toolbar-title {
      font-size: 1rem;
      font-weight: 500;
    }

    #fc-container .fc-button {
      background: var(--secondary-background-color, #f5f5f5);
      border: 1px solid var(--divider-color, #e0e0e0);
      color: var(--primary-text-color);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 0.8rem;
      cursor: pointer;
    }

    #fc-container .fc-button:hover {
      background: var(--primary-color, #03a9f4);
      color: #fff;
      border-color: var(--primary-color, #03a9f4);
    }

    #fc-container .fc-button-active,
    #fc-container .fc-button-primary:not(:disabled).fc-button-active {
      background: var(--primary-color, #03a9f4);
      color: #fff;
      border-color: var(--primary-color, #03a9f4);
    }

    #fc-container .fc-daygrid-day-number,
    #fc-container .fc-col-header-cell-cushion {
      color: var(--primary-text-color);
      text-decoration: none;
    }

    #fc-container .fc-day-today {
      background: var(--primary-color-light, rgba(3, 169, 244, 0.1)) !important;
    }

    /* ---- New event dialog ---- */
    .dialog-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    }

    .dialog {
      background: var(--card-background-color, #fff);
      border-radius: 8px;
      padding: 24px;
      min-width: 320px;
      max-width: 480px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .dialog-title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 500;
      color: var(--primary-text-color);
    }

    .dialog-label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.85rem;
      color: var(--secondary-text-color, #666);
    }

    .dialog-label input[type='checkbox'] {
      margin-right: 6px;
    }

    .dialog-input {
      padding: 8px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px;
      font-size: 0.9rem;
      background: var(--input-fill-color, #f5f5f5);
      color: var(--primary-text-color);
    }

    .dialog-input:focus {
      outline: none;
      border-color: var(--primary-color, #03a9f4);
    }

    .dialog-error {
      color: var(--error-color, #f44336);
      font-size: 0.85rem;
      margin: 0;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }

    .dialog-btn {
      padding: 8px 16px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 500;
    }

    .dialog-btn--cancel {
      background: transparent;
      color: var(--primary-text-color);
    }

    .dialog-btn--cancel:hover {
      background: var(--secondary-background-color, #f5f5f5);
    }

    .dialog-btn--save {
      background: var(--primary-color, #03a9f4);
      color: #fff;
    }

    .dialog-btn--save:hover:not(:disabled) {
      opacity: 0.9;
    }

    .dialog-btn--save:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `;
}

customElements.define('skylight-calendar-card', SkylightCalendarCard);

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
  type: 'skylight-calendar-card',
  name: 'Skylight Calendar Card',
  description: 'A calendar card with day/week/month views and person selectors',
  preview: false,
});
