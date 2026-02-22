/**
 * FamilyCalendar for Homeassistant – Lovelace card editor
 *
 * Provides a simple UI for configuring the card inside Home Assistant's
 * card editor dialog (gear icon on the card).
 */

import { LitElement, html, css, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { CalendarCardConfig, PersonGroup } from './types.js';

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
    this._dispatchConfig({ ...this._config!, title: this._readValue(e) });
  }

  private _setView(e: Event) {
    this._dispatchConfig({
      ...this._config!,
      initial_view: this._readValue(e) as CalendarCardConfig['initial_view'],
    });
  }

  private _setInitialTime(e: Event) {
    const value = this._readValue(e);
    this._dispatchConfig({
      ...this._config!,
      initial_time: value ? `${value}:00` : undefined,
    });
  }

  private _setShowNowIndicator(e: Event) {
    this._dispatchConfig({
      ...this._config!,
      show_now_indicator: this._readChecked(e),
    });
  }

  private _setHeight(e: Event) {
    const value = this._readValue(e).trim();
    this._dispatchConfig({
      ...this._config!,
      height: value || 'auto',
    });
  }

  private _readValue(event: Event): string {
    const target = event.target as { value?: string } | null;
    return target?.value ?? '';
  }

  private _readChecked(event: Event): boolean {
    const target = event.target as { checked?: boolean } | null;
    return target?.checked ?? false;
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

        <ha-textfield
          .label=${'Title'}
          .value=${this._config.title ?? ''}
          @input=${this._setTitle}
        ></ha-textfield>

        <ha-select
          .label=${'Default view'}
          .value=${this._config.initial_view ?? 'dayGridMonth'}
          @selected=${this._setView}
          @change=${this._setView}
        >
          <mwc-list-item value="dayGridMonth">Month</mwc-list-item>
          <mwc-list-item value="timeGridWeek">Week</mwc-list-item>
          <mwc-list-item value="timeGridDay">Day</mwc-list-item>
        </ha-select>

        <ha-textfield
          .label=${'Initial time (week/day)'}
          type="time"
          step="60"
          .value=${(this._config.initial_time ?? '00:00:00').slice(0, 5)}
          @input=${this._setInitialTime}
        ></ha-textfield>

        <ha-formfield .label=${'Show current time indicator (week/day)'}>
          <ha-switch
            .checked=${this._config.show_now_indicator ?? true}
            @change=${this._setShowNowIndicator}
          ></ha-switch>
        </ha-formfield>

        <ha-textfield
          .label=${'Calendar height'}
          .placeholder=${'auto'}
          .value=${this._config.height ?? 'auto'}
          @input=${this._setHeight}
        ></ha-textfield>
        <p class="hint">e.g. 600px, 80vh, auto</p>

        <h3>Calendars</h3>
        <p class="hint">Add calendar entities to display on the card.</p>

        ${(this._config.calendars ?? []).map(
          (cal) => html`
            <div class="list-item">
              <span>${cal}</span>
              <mwc-button class="remove-btn" @click=${() => this._removeCalendar(cal)}>
                Remove
              </mwc-button>
            </div>
          `,
        )}
        ${availableForGlobal.length
          ? html`
              <ha-select
                class="add-select"
                .label=${'Add calendar'}
                .value=${''}
                @selected=${(e: Event) => {
                  const val = this._readValue(e);
                  if (val) this._addCalendar(val);
                }}
              >
                ${availableForGlobal.map((id) => html`<mwc-list-item .value=${id}>${id}</mwc-list-item>`) }
              </ha-select>
            `
          : html``}

        <h3>
          Person Groups
          <mwc-button class="small-btn" @click=${this._addPerson}>Add Person</mwc-button>
        </h3>
        <p class="hint">Group calendars under a person to get a quick visibility toggle.</p>

        ${(this._config.persons ?? []).map(
          (person, idx) => html`
            <div class="person-block">
              <div class="person-row">
                <ha-textfield
                  class="inline-field"
                  .label=${'Name'}
                  .value=${person.name}
                  @input=${(e: Event) => this._updatePersonName(idx, this._readValue(e))}
                ></ha-textfield>
                <ha-textfield
                  class="inline-field"
                  .label=${'Color'}
                  .placeholder=${'#039be5'}
                  .value=${person.color ?? '#039be5'}
                  @input=${(e: Event) => this._updatePersonColor(idx, this._readValue(e))}
                ></ha-textfield>
                <mwc-button class="remove-btn" @click=${() => this._removePerson(idx)}>
                  Remove
                </mwc-button>
              </div>

              ${person.calendars.map(
                (cal) => html`
                  <div class="list-item indent">
                    <span>${cal}</span>
                    <mwc-button
                      class="remove-btn"
                      @click=${() => this._removeCalendarFromPerson(idx, cal)}
                    >
                      Remove
                    </mwc-button>
                  </div>
                `,
              )}
              ${this._calendarEntities.filter((id) => !person.calendars.includes(id)).length
                ? html`
                    <ha-select
                      class="add-select indent"
                      .label=${`Add calendar to ${person.name}`}
                      .value=${''}
                      @selected=${(e: Event) => {
                        const val = this._readValue(e);
                        if (val) {
                          this._addCalendarToPerson(idx, val);
                        }
                      }}
                    >
                      ${this._calendarEntities
                        .filter((id) => !person.calendars.includes(id))
                        .map((id) => html`<mwc-list-item .value=${id}>${id}</mwc-list-item>`)}
                    </ha-select>
                  `
                : html``}
            </div>
          `,
        )}
      </div>
    `;
  }

  static styles = css`
    .editor {
      padding: 8px 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    h3 {
      margin: 8px 0 4px;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--primary-text-color);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .hint {
      font-size: 0.8rem;
      color: var(--secondary-text-color, #666);
      margin: 0 0 4px;
    }

    .list-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 8px;
      background: var(--secondary-background-color, #f5f5f5);
      border-radius: 4px;
      font-size: 0.85rem;
    }

    .list-item.indent {
      margin-left: 16px;
    }

    .add-select {
      width: 100%;
    }

    .add-select.indent {
      margin-left: 16px;
    }

    .remove-btn {
      --mdc-theme-primary: var(--error-color, #f44336);
      min-width: 0;
    }

    .small-btn {
      --mdc-theme-primary: var(--primary-color, #03a9f4);
      margin-left: auto;
    }

    .person-block {
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .person-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }

    .inline-field {
      flex: 1;
      min-width: 140px;
    }
  `;
}

customElements.define('familycalendar-card-editor', FamilyCalendarForHomeassistantEditor);
