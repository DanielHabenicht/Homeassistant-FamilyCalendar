/**
 * FamilyCalendar for Homeassistant – Lovelace card editor
 *
 * Provides a simple UI for configuring the card inside Home Assistant's
 * card editor dialog (gear icon on the card).
 */

import { LitElement, html, unsafeCSS, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { CalendarCardConfig, PersonGroup } from './types.js';
import styles from './familycalendar-card-editor.scss';

class FamilyCalendarForHomeassistantEditor extends LitElement {
  @property({ attribute: false }) public hass?: {
    states: Record<string, { entity_id: string; attributes: { friendly_name?: string } }>;
  };
  @state() private _config?: CalendarCardConfig;

  setConfig(config: CalendarCardConfig) {
    this._config = { ...config };
  }

  private _dispatchConfig(config: CalendarCardConfig) {
    const event = new CustomEvent('config-changed', {
      detail: { config },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  /** All calendar entities from HA states */
  private get _calendarEntities(): string[] {
    if (!this.hass) return [];
    return Object.keys(this.hass.states).filter((id) => id.startsWith('calendar.'));
  }

  private _setTitle(e: Event) {
    this._dispatchConfig({ ...this._config!, title: this._readSelectorValue(e, '') });
  }

  private _setView(e: Event) {
    const value = this._readSelectorValue(e, this._config?.initial_view ?? 'dayGridMonth');
    this._dispatchConfig({
      ...this._config!,
      initial_view: value as CalendarCardConfig['initial_view'],
    });
  }

  private _setInitialTime(e: Event) {
    const value = this._readSelectorValue(e, '');
    this._dispatchConfig({
      ...this._config!,
      initial_time: value ? `${value}:00` : undefined,
    });
  }

  private _setShowNowIndicator(e: Event) {
    this._dispatchConfig({
      ...this._config!,
      show_now_indicator: this._readSelectorValue(e, true),
    });
  }

  private _setHeight(e: Event) {
    const value = this._readSelectorValue(e, '').trim();
    this._dispatchConfig({
      ...this._config!,
      height: value || 'auto',
    });
  }

  private _readSelectorValue<T>(event: Event, fallback: T): T {
    const customEvent = event as CustomEvent<{ value?: T }>;
    return customEvent.detail?.value ?? fallback;
  }

  private _addCalendar(entityId: string) {
    const current = this._config?.calendars ?? [];
    if (!current.includes(entityId)) {
      this._dispatchConfig({ ...this._config!, calendars: [...current, entityId] });
    }
  }

  private _removeCalendar(entityId: string) {
    this._dispatchConfig({
      ...this._config!,
      calendars: (this._config?.calendars ?? []).filter((c) => c !== entityId),
    });
  }

  private _addPerson() {
    const persons: PersonGroup[] = [
      ...(this._config?.persons ?? []),
      { name: 'New Person', calendars: [] },
    ];
    this._dispatchConfig({ ...this._config!, persons });
  }

  private _updatePersonName(idx: number, value: string) {
    const persons = [...(this._config?.persons ?? [])];
    persons[idx] = { ...persons[idx], name: value };
    this._dispatchConfig({ ...this._config!, persons });
  }

  private _updatePersonColor(idx: number, value: string) {
    const persons = [...(this._config?.persons ?? [])];
    persons[idx] = { ...persons[idx], color: value };
    this._dispatchConfig({ ...this._config!, persons });
  }

  private _removePerson(idx: number) {
    const persons = [...(this._config?.persons ?? [])];
    persons.splice(idx, 1);
    this._dispatchConfig({ ...this._config!, persons });
  }

  private _addCalendarToPerson(personIdx: number, entityId: string) {
    const persons = [...(this._config?.persons ?? [])];
    if (!persons[personIdx].calendars.includes(entityId)) {
      persons[personIdx] = {
        ...persons[personIdx],
        calendars: [...persons[personIdx].calendars, entityId],
      };
    }
    this._dispatchConfig({ ...this._config!, persons });
  }

  private _removeCalendarFromPerson(personIdx: number, calId: string) {
    const persons = [...(this._config?.persons ?? [])];
    persons[personIdx] = {
      ...persons[personIdx],
      calendars: persons[personIdx].calendars.filter((c) => c !== calId),
    };
    this._dispatchConfig({ ...this._config!, persons });
  }

  protected render(): TemplateResult {
    if (!this._config) return html``;

    const availableForGlobal = this._calendarEntities.filter(
      (id) => !(this._config?.calendars ?? []).includes(id),
    );

    return html`
      <div class="editor">
        <h3>General</h3>

        <ha-selector
          .hass=${this.hass}
          .selector=${{ text: {} }}
          .label=${'Title'}
          .value=${this._config.title ?? ''}
          @value-changed=${this._setTitle}
        ></ha-selector>

        <ha-selector
          .hass=${this.hass}
          .selector=${{
            select: {
              mode: 'dropdown',
              options: [
                { value: 'dayGridMonth', label: 'Month' },
                { value: 'timeGridWeek', label: 'Week' },
                { value: 'timeGridDay', label: 'Day' },
              ],
            },
          }}
          .label=${'Default view'}
          .value=${this._config.initial_view ?? 'dayGridMonth'}
          @value-changed=${this._setView}
        ></ha-selector>

        <ha-selector
          .hass=${this.hass}
          .selector=${{ time: {} }}
          .label=${'Initial time (week/day)'}
          .value=${(this._config.initial_time ?? '00:00:00').slice(0, 5)}
          @value-changed=${this._setInitialTime}
        ></ha-selector>

        <ha-selector
          .hass=${this.hass}
          .selector=${{ boolean: {} }}
          .label=${'Show current time indicator (week/day)'}
          .value=${this._config.show_now_indicator ?? true}
          @value-changed=${this._setShowNowIndicator}
        ></ha-selector>

        <ha-selector
          .hass=${this.hass}
          .selector=${{ text: {} }}
          .label=${'Calendar height'}
          .value=${this._config.height ?? 'auto'}
          @value-changed=${this._setHeight}
        ></ha-selector>
        <ha-input-helper-text class="hint">e.g. 600px, 80vh, auto</ha-input-helper-text>

        <h3>Calendars</h3>
        <ha-input-helper-text class="hint"
          >Add calendar entities to display on the card.</ha-input-helper-text
        >

        ${(this._config.calendars ?? []).map(
          (cal) => html`
            <div class="list-item">
              <span>${cal}</span>
              <ha-icon-button
                class="remove-btn"
                .path=${'M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19M19,4H15.5L14.79,3.29C14.42,2.92 13.91,2.71 13.38,2.71H10.62C10.09,2.71 9.58,2.92 9.21,3.29L8.5,4H5V6H19V4Z'}
                .label=${'Remove calendar'}
                @click=${() => this._removeCalendar(cal)}
              ></ha-icon-button>
            </div>
          `,
        )}
        ${availableForGlobal.length
          ? html`
              <ha-selector
                class="add-select"
                .hass=${this.hass}
                .selector=${{
                  entity: {
                    multiple: false,
                    include_entities: availableForGlobal,
                  },
                }}
                .label=${'Add calendar'}
                .value=${''}
                @value-changed=${(e: Event) => {
                  const val = this._readSelectorValue(e, '');
                  if (val) this._addCalendar(val);
                }}
              ></ha-selector>
            `
          : html``}

        <h3>
          Person Groups
          <ha-button class="small-btn" appearance="accent" @click=${this._addPerson}
            >Add Person</ha-button
          >
        </h3>
        <ha-input-helper-text class="hint"
          >Group calendars under a person to get a quick visibility toggle.</ha-input-helper-text
        >

        ${(this._config.persons ?? []).map(
          (person, idx) => html`
            <div class="person-block">
              <div class="person-row">
                <ha-selector
                  class="inline-field"
                  .hass=${this.hass}
                  .selector=${{ text: {} }}
                  .label=${'Name'}
                  .value=${person.name}
                  @value-changed=${(e: Event) =>
                    this._updatePersonName(idx, this._readSelectorValue(e, person.name))}
                ></ha-selector>
                <ha-selector
                  class="inline-field"
                  .hass=${this.hass}
                  .selector=${{ text: {} }}
                  .label=${'Color'}
                  .value=${person.color ?? '#039be5'}
                  @value-changed=${(e: Event) =>
                    this._updatePersonColor(idx, this._readSelectorValue(e, person.color ?? ''))}
                ></ha-selector>
                <ha-icon-button
                  class="remove-btn"
                  .path=${'M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19M19,4H15.5L14.79,3.29C14.42,2.92 13.91,2.71 13.38,2.71H10.62C10.09,2.71 9.58,2.92 9.21,3.29L8.5,4H5V6H19V4Z'}
                  .label=${'Remove person'}
                  @click=${() => this._removePerson(idx)}
                ></ha-icon-button>
              </div>

              ${person.calendars.map(
                (cal) => html`
                  <div class="list-item indent">
                    <span>${cal}</span>
                    <ha-icon-button
                      class="remove-btn"
                      .path=${'M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19M19,4H15.5L14.79,3.29C14.42,2.92 13.91,2.71 13.38,2.71H10.62C10.09,2.71 9.58,2.92 9.21,3.29L8.5,4H5V6H19V4Z'}
                      .label=${'Remove calendar from person'}
                      @click=${() => this._removeCalendarFromPerson(idx, cal)}
                    ></ha-icon-button>
                  </div>
                `,
              )}
              ${this._calendarEntities.filter((id) => !person.calendars.includes(id)).length
                ? html`
                    <ha-selector
                      class="add-select indent"
                      .hass=${this.hass}
                      .selector=${{
                        entity: {
                          multiple: false,
                          include_entities: this._calendarEntities.filter(
                            (id) => !person.calendars.includes(id),
                          ),
                        },
                      }}
                      .label=${`Add calendar to ${person.name}`}
                      .value=${''}
                      @value-changed=${(e: Event) => {
                        const val = this._readSelectorValue(e, '');
                        if (val) {
                          this._addCalendarToPerson(idx, val);
                        }
                      }}
                    ></ha-selector>
                  `
                : html``}
            </div>
          `,
        )}
      </div>
    `;
  }

  static styles = unsafeCSS(styles);
}

customElements.define('familycalendar-card-editor', FamilyCalendarForHomeassistantEditor);
