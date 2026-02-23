/**
 * FamilyCalendar for Homeassistant – Home Assistant Lovelace custom card
 *
 * Uses FullCalendar for rendering and provides:
 *  - Day / 3-Day / Week / Month views
 *  - Click-to-create new calendar entries
 *  - Person-selector switches to show/hide calendars
 *  - Configurable calendar list with optional person grouping
 */

import {
  LitElement,
  html,
  unsafeCSS,
  type TemplateResult,
  type PropertyValues,
  nothing,
} from 'lit';
import { property, state } from 'lit/decorators.js';
import { Calendar } from '@fullcalendar/core';
import allLocales from '@fullcalendar/core/locales-all';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

import type { EventApi, EventClickArg, EventInput, EventMountArg } from '@fullcalendar/core';
import type { HomeAssistant, CalendarCardConfig, NewEventData } from './types.js';
import { getCardDictionary, type CardTextKey } from './i18n.js';
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
import './familycalendar-event-form.js';

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
  @state() private _newEventDescription = '';
  @state() private _newEventStart = '';
  @state() private _newEventEnd = '';
  @state() private _newEventCalendar = '';
  @state() private _newEventAllDay = false;
  @state() private _dialogMode: 'create' | 'view' = 'create';
  @state() private _saving = false;
  @state() private _errorMessage = '';
  @state() private _currentView: CalendarCardConfig['initial_view'] = 'dayGridMonth';
  @state() private _calendarTitle = '';
  @state() private _isViewingToday = true;

  private _calendar?: Calendar;
  private _calendarContainer?: HTMLDivElement;

  // FullCalendar instance is created once and reused
  private _fcInitialized = false;

  private _getLocale(): string {
    return getPreferredLocale(this.hass);
  }

  private _getInitialScrollTime(): string {
    const value = this._config?.initial_time?.trim();
    if (!value) return '00:00:00';

    const match = value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return '00:00:00';

    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    const seconds = Number.parseInt(match[3] ?? '00', 10);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
      return '00:00:00';
    }

    return `${match[1]}:${match[2]}:${(match[3] ?? '00').padStart(2, '0')}`;
  }

  private _getText(key: CardTextKey): string {
    return getCardDictionary(this._getLocale())[key];
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
    this._currentView = config.initial_view ?? 'dayGridMonth';
  }

  static getConfigElement() {
    return document.createElement('familycalendar-card-editor');
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

  private _setGroupVisible(group: { ids: string[] }, shouldBeVisible: boolean) {
    const visible = new Set(this._visibleCalendars);
    for (const id of group.ids) {
      if (shouldBeVisible) {
        visible.add(id);
      } else {
        visible.delete(id);
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

    // Workaround: Home Assistant can reattach this card in a new shadow root after tab/view
    // switches. In that case FullCalendar's runtime-injected styles may not follow, so we
    // mirror the global FullCalendar stylesheet into this shadow root before rendering.
    this._ensureFullCalendarStyles();

    this._calendarContainer = container;

    const self = this;
    const locale = this._getLocale();
    this._calendar = new Calendar(container, {
      plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
      locales: allLocales,
      locale,
      initialView: this._currentView,
      views: {
        timeGridThreeDay: {
          type: 'timeGrid',
          duration: { days: 3 },
        },
      },
      headerToolbar: false,
      height: this._config.height ?? 'auto',
      editable: false,
      selectable: true,
      selectMirror: true,
      dayMaxEvents: true,
      nowIndicator: this._config.show_now_indicator ?? true,
      scrollTime: this._getInitialScrollTime(),
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
      eventClick(info: EventClickArg) {
        info.jsEvent.preventDefault();
        info.jsEvent.stopPropagation();
        self._openViewEventDialog(info.event);
      },
      eventDidMount(info: EventMountArg) {
        info.el.style.cursor = 'pointer';
        info.el.setAttribute('data-familycalendar-event-id', info.event.id);
        info.el.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          self._openViewEventDialog(info.event);
        });
      },
      eventSources: self._buildEventSources(),
    });

    this._calendar.render();
    this._updateCalendarTitle();
    container.addEventListener('click', this._onCalendarContainerClick, true);
    this._fcInitialized = true;
  }

  private _teardownCalendar() {
    this._calendarContainer?.removeEventListener('click', this._onCalendarContainerClick, true);
    this._calendar?.destroy();
    this._calendar = undefined;
    this._calendarContainer = undefined;
    this._fcInitialized = false;
  }

  private _ensureFullCalendarStyles() {
    if (!this.shadowRoot) return;

    const rootStyle = document.querySelector<HTMLStyleElement>('style[data-fullcalendar]');
    if (!rootStyle) return;

    let rootCssText = '';
    try {
      const sheet = rootStyle.sheet as CSSStyleSheet | null;
      if (sheet?.cssRules) {
        rootCssText = Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join('\n');
      }
    } catch {
      rootCssText = '';
    }

    if (!rootCssText) {
      rootCssText = rootStyle.textContent ?? '';
    }

    if (!rootCssText) return;

    let shadowStyle = this.shadowRoot.querySelector<HTMLStyleElement>('style[data-fullcalendar]');
    if (!shadowStyle) {
      shadowStyle = document.createElement('style');
      shadowStyle.setAttribute('data-fullcalendar', '');
      this.shadowRoot.insertBefore(shadowStyle, this.shadowRoot.firstChild);
    }

    if (shadowStyle.textContent !== rootCssText) {
      shadowStyle.textContent = rootCssText;
    }
  }

  private _onCalendarContainerClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || !this._calendar) return;

    const eventEl = target.closest<HTMLElement>('[data-familycalendar-event-id], .fc-event');
    if (!eventEl) return;

    const eventId = eventEl.getAttribute('data-familycalendar-event-id');
    if (!eventId) return;

    const calendarEvent = this._calendar.getEventById(eventId);
    if (!calendarEvent) return;

    event.preventDefault();
    event.stopPropagation();
    this._openViewEventDialog(calendarEvent);
  };

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
                evs.map((ev) => {
                  const eventId =
                    ev.uid ?? `${entityId}__${ev.start}__${ev.end}__${ev.summary ?? 'event'}`;
                  return {
                    id: eventId,
                    title: ev.summary,
                    start: ev.start,
                    end: ev.end,
                    allDay: ev.allDay,
                    extendedProps: { description: ev.description, entityId, uid: ev.uid },
                  };
                }),
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

    if (!this.isConnected) return;
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
                evs.map((ev) => {
                  const eventId =
                    ev.uid ?? `${entityId}__${ev.start}__${ev.end}__${ev.summary ?? 'event'}`;
                  return {
                    id: eventId,
                    title: ev.summary,
                    start: ev.start,
                    end: ev.end,
                    allDay: ev.allDay,
                    extendedProps: { description: ev.description, entityId, uid: ev.uid },
                  };
                }),
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
    this._dialogMode = 'create';
    this._newEventData = data;
    this._newEventTitle = '';
    this._newEventDescription = '';
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

  private _openViewEventDialog(event: EventApi) {
    const start = event.start ?? (event.startStr ? new Date(event.startStr) : null);
    if (!start) return;

    const end = event.end ?? new Date(start.getTime() + 60 * 60 * 1000);
    const extendedProps = event.extendedProps as Record<string, unknown>;
    const entityId = typeof extendedProps.entityId === 'string' ? extendedProps.entityId : '';
    this._dialogMode = 'view';
    this._newEventData = { start, end, allDay: event.allDay };
    this._newEventTitle = event.title;
    this._newEventAllDay = event.allDay;

    if (event.allDay) {
      this._newEventStart = formatDateLocal(start);
      const endDate = new Date(end);
      endDate.setDate(endDate.getDate() - 1); // FC end is exclusive
      this._newEventEnd = formatDateLocal(endDate);
    } else {
      this._newEventStart = formatDateTimeLocal(start);
      this._newEventEnd = formatDateTimeLocal(end);
    }

    this._newEventCalendar = entityId;
    const description =
      typeof extendedProps.description === 'string' ? extendedProps.description : '';
    this._newEventDescription = description;
    this._errorMessage = '';
  }

  private _handleAllDayToggle(checked: boolean) {
    const previousAllDay = this._newEventAllDay;
    if (previousAllDay === checked) return;

    const parseInput = (value: string, allDay: boolean): Date | undefined => {
      if (!value) return undefined;
      const normalizedValue = allDay ? `${value}T00:00:00` : value.replace(' ', 'T');
      const date = new Date(normalizedValue);
      return Number.isNaN(date.getTime()) ? undefined : date;
    };

    const fallbackStart = this._newEventData?.start;
    const fallbackEnd = this._newEventData?.end;
    const parsedStart = parseInput(this._newEventStart, previousAllDay) ?? fallbackStart;
    const parsedEnd = parseInput(this._newEventEnd, previousAllDay) ?? fallbackEnd;

    if (!parsedStart || !parsedEnd) return;

    this._newEventAllDay = checked;
    if (checked) {
      this._newEventStart = formatDateLocal(parsedStart);
      this._newEventEnd = formatDateLocal(parsedEnd);
    } else {
      this._newEventStart = formatDateTimeLocal(parsedStart);
      this._newEventEnd = formatDateTimeLocal(parsedEnd);
    }
  }

  private _readValue(event: Event): string {
    const target = event.target as { value?: string } | null;
    return target?.value ?? '';
  }

  private _readSelectValue(event: Event): string {
    const customEvent = event as CustomEvent<{ value?: string }>;
    const detailValue = customEvent.detail?.value;
    if (typeof detailValue === 'string') {
      return detailValue;
    }
    return this._readValue(event);
  }

  private _setCalendarView(event: Event) {
    const value = this._readSelectValue(event) as CalendarCardConfig['initial_view'];
    if (!value || value === this._currentView) return;
    this._currentView = value;
    this._calendar?.changeView(value);
    this._updateCalendarTitle();
  }

  private _updateCalendarTitle() {
    if (!this._calendar) return;
    this._calendarTitle = this._calendar.view.title;
    this._checkIsViewingToday();
  }

  private _checkIsViewingToday() {
    if (!this._calendar) return;
    const view = this._calendar.view;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const viewStart = new Date(view.currentStart);
    viewStart.setHours(0, 0, 0, 0);

    const viewEnd = new Date(view.currentEnd);
    viewEnd.setHours(0, 0, 0, 0);

    this._isViewingToday = today >= viewStart && today < viewEnd;
  }

  private _goToPrev() {
    this._calendar?.prev();
    this._updateCalendarTitle();
  }

  private _goToNext() {
    this._calendar?.next();
    this._updateCalendarTitle();
  }

  private _goToToday() {
    this._calendar?.today();
    this._updateCalendarTitle();
  }

  private _closeDialog() {
    this._newEventData = undefined;
    this._dialogMode = 'create';
    this._newEventDescription = '';
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
        const allDayData: Record<string, unknown> = {
          entity_id: this._newEventCalendar,
          summary: this._newEventTitle.trim(),
          start_date: startVal,
          end_date: endVal,
        };
        if (this._newEventDescription.trim()) {
          allDayData.description = this._newEventDescription.trim();
        }
        await this.hass.callService('calendar', 'create_event', allDayData);
      } else {
        const timedData: Record<string, unknown> = {
          entity_id: this._newEventCalendar,
          summary: this._newEventTitle.trim(),
          start_date_time: startVal,
          end_date_time: endVal,
        };
        if (this._newEventDescription.trim()) {
          timedData.description = this._newEventDescription.trim();
        }
        await this.hass.callService('calendar', 'create_event', timedData);
      }

      this._closeDialog();
      // Refresh all event sources
      this._calendar?.getEventSources().forEach((src) => src.refetch());
    } catch (e) {
      this._errorMessage = `${this._getText('createError')}: ${(e as Error).message}`;
    } finally {
      this._saving = false;
    }
  }

  // -------------------------------------------------------------------------
  // Lit lifecycle
  // -------------------------------------------------------------------------

  disconnectedCallback() {
    this._teardownCalendar();
    super.disconnectedCallback();
  }

  protected updated(changed: PropertyValues) {
    super.updated(changed);
    if (!this.isConnected) return;
    if (!this._config || !this.hass) return;

    const container = this.shadowRoot?.querySelector<HTMLDivElement>('#fc-container');
    if (!container) return;

    if (!this._fcInitialized) {
      this._initCalendar(container);
      return;
    }

    if (this._calendarContainer !== container) {
      this._teardownCalendar();
      this._initCalendar(container);
      return;
    }

    if (changed.has('hass')) {
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
    if (!this._config) return html`<div>${this._getText('noConfiguration')}</div>`;

    const groups = this._personGroups;
    const title = this._config.title ?? this._getText('calendarFallbackTitle');

    return html`
      <ha-card .header=${title}>
        ${groups.length > 1
          ? html`
              <div class="person-selectors">
                ${groups.map((group) => {
                  const personColor = group.color || 'var(--primary-color, #03a9f4)';
                  const isVisible = this._isGroupVisible(group);
                  const chipStyle = isVisible
                    ? `--md-filter-chip-selected-container-color: ${personColor}; --md-filter-chip-outline-color: ${personColor}; --md-sys-color-on-secondary-container: #fff;`
                    : '';
                  return html`
                    <ha-filter-chip
                      class="person-chip"
                      .label=${group.label}
                      ?selected=${isVisible}
                      style=${chipStyle}
                      @click=${() => this._setGroupVisible(group, !isVisible)}
                    >
                      ${group.icon
                        ? html`<ha-icon slot="leading-icon" icon="${group.icon}"></ha-icon>`
                        : nothing}
                    </ha-filter-chip>
                  `;
                })}
              </div>
            `
          : nothing}

        <div class="calendar-navigation">
          <div class="calendar-nav-left">
            <ha-button @click=${this._goToPrev} appearance="plain" variant="neutral">
              <ha-icon icon="mdi:chevron-left" slot="start"></ha-icon>
            </ha-button>
            <ha-button
              @click=${this._goToToday}
              appearance="plain"
              variant="neutral"
              ?disabled=${this._isViewingToday}
            >
              ${this._getText('today')}
            </ha-button>
            <ha-button @click=${this._goToNext} appearance="plain" variant="neutral">
              <ha-icon icon="mdi:chevron-right" slot="end"></ha-icon>
            </ha-button>
          </div>
          <div class="calendar-nav-center">
            <div class="calendar-title">${this._calendarTitle}</div>
          </div>
          <div class="calendar-nav-right">
            <ha-control-select
              .value=${this._currentView}
              .options=${[
                { value: 'dayGridMonth', label: this._getText('month') },
                { value: 'timeGridWeek', label: this._getText('week') },
                { value: 'timeGridThreeDay', label: this._getText('threeDays') },
                { value: 'timeGridDay', label: this._getText('day') },
              ]}
              @value-changed=${this._setCalendarView}
              hide-label
            ></ha-control-select>
          </div>
        </div>

        <div class="calendar-wrapper">
          <div id="fc-container"></div>
        </div>

        ${this._newEventData ? this._renderDialog() : nothing}
      </ha-card>
    `;
  }

  private _renderDialog(): TemplateResult {
    const allIds = getAllCalendarIds(this._config!);
    const locale = this._getLocale();
    const dictionary = getCardDictionary(locale);
    const heading = this._dialogMode === 'view' ? dictionary.viewEvent : dictionary.newEvent;

    return html`
      <ha-dialog class="dialog" open .heading=${heading} @closed=${this._closeDialog}>
        <familycalendar-event-form
          .hass=${this.hass}
          .title=${this._newEventTitle}
          .description=${this._newEventDescription}
          .allDay=${this._newEventAllDay}
          .start=${this._newEventStart}
          .end=${this._newEventEnd}
          .calendar=${this._newEventCalendar}
          .calendarOptions=${allIds.map((id) => ({ value: id, label: this._calendarLabel(id) }))}
          .errorMessage=${this._errorMessage}
          .readOnly=${this._dialogMode === 'view'}
          .dictionary=${dictionary}
          @familycalendar-title-changed=${(e: CustomEvent<{ value: string }>) =>
            (this._newEventTitle = e.detail.value)}
          @familycalendar-description-changed=${(e: CustomEvent<{ value: string }>) =>
            (this._newEventDescription = e.detail.value)}
          @familycalendar-all-day-changed=${(e: CustomEvent<{ value: boolean }>) =>
            this._handleAllDayToggle(e.detail.value)}
          @familycalendar-start-changed=${(e: CustomEvent<{ value: string }>) =>
            (this._newEventStart = e.detail.value)}
          @familycalendar-end-changed=${(e: CustomEvent<{ value: string }>) =>
            (this._newEventEnd = e.detail.value)}
          @familycalendar-calendar-changed=${(e: CustomEvent<{ value: string }>) =>
            (this._newEventCalendar = e.detail.value)}
          @familycalendar-submit=${this._saveEvent}
        ></familycalendar-event-form>

        <ha-button slot="secondaryAction" appearance="plain" @click=${this._closeDialog}>
          ${this._dialogMode === 'view' ? this._getText('close') : this._getText('cancel')}
        </ha-button>
        ${this._dialogMode === 'create'
          ? html`
              <ha-button
                slot="primaryAction"
                appearance="filled"
                ?disabled=${this._saving}
                @click=${this._saveEvent}
              >
                ${this._saving ? this._getText('saving') : this._getText('save')}
              </ha-button>
            `
          : nothing}
      </ha-dialog>
    `;
  }

  private _calendarLabel(entityId: string): string {
    const person = getPersonForCalendar(entityId, this._config!);
    if (person) return `${person.name} – ${entityId.replace('calendar.', '').replace(/_/g, ' ')}`;
    return entityId.replace('calendar.', '').replace(/_/g, ' ');
  }

  static styles = unsafeCSS(styles);
}

customElements.define('familycalendar-card', FamilyCalendarForHomeassistantCard);

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
  type: 'familycalendar-card',
  name: 'FamilyCalendar for Homeassistant',
  description: 'A calendar card with day/week/month views and person selectors',
  preview: false,
});
