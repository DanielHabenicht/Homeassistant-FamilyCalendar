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
    this._dispatchConfig({ ...this._config!, title: (e.target as HTMLInputElement).value });
  }

  private _setView(e: Event) {
    this._dispatchConfig({
      ...this._config!,
      initial_view: (e.target as HTMLSelectElement).value as CalendarCardConfig['initial_view'],
    });
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

        <label class="field">
          Title
          <input type="text" .value=${this._config.title ?? ''} @input=${this._setTitle} />
        </label>

        <label class="field">
          Default view
          <select .value=${this._config.initial_view ?? 'dayGridMonth'} @change=${this._setView}>
            <option value="dayGridMonth">Month</option>
            <option value="timeGridWeek">Week</option>
            <option value="timeGridDay">Day</option>
          </select>
        </label>

        <h3>Calendars</h3>
        <p class="hint">Add calendar entities to display on the card.</p>

        ${(this._config.calendars ?? []).map(
          (cal) => html`
            <div class="list-item">
              <span>${cal}</span>
              <button class="remove-btn" @click=${() => this._removeCalendar(cal)}>✕</button>
            </div>
          `,
        )}
        ${availableForGlobal.length
          ? html`
              <select
                class="add-select"
                @change=${(e: Event) => {
                  const val = (e.target as HTMLSelectElement).value;
                  if (val) {
                    this._addCalendar(val);
                    (e.target as HTMLSelectElement).value = '';
                  }
                }}
              >
                <option value="">— add calendar —</option>
                ${availableForGlobal.map((id) => html`<option value="${id}">${id}</option>`)}
              </select>
            `
          : html``}

        <h3>
          Person Groups <button class="small-btn" @click=${this._addPerson}>+ Add Person</button>
        </h3>
        <p class="hint">Group calendars under a person to get a quick visibility toggle.</p>

        ${(this._config.persons ?? []).map(
          (person, idx) => html`
            <div class="person-block">
              <div class="person-row">
                <label class="inline-field">
                  Name
                  <input
                    type="text"
                    .value=${person.name}
                    @input=${(e: Event) =>
                      this._updatePersonName(idx, (e.target as HTMLInputElement).value)}
                  />
                </label>
                <label class="inline-field">
                  Color
                  <input
                    type="color"
                    .value=${person.color ?? '#039be5'}
                    @input=${(e: Event) =>
                      this._updatePersonColor(idx, (e.target as HTMLInputElement).value)}
                  />
                </label>
                <button class="remove-btn" @click=${() => this._removePerson(idx)}>Remove</button>
              </div>

              ${person.calendars.map(
                (cal) => html`
                  <div class="list-item indent">
                    <span>${cal}</span>
                    <button
                      class="remove-btn"
                      @click=${() => this._removeCalendarFromPerson(idx, cal)}
                    >
                      ✕
                    </button>
                  </div>
                `,
              )}
              ${this._calendarEntities.filter((id) => !person.calendars.includes(id)).length
                ? html`
                    <select
                      class="add-select indent"
                      @change=${(e: Event) => {
                        const val = (e.target as HTMLSelectElement).value;
                        if (val) {
                          this._addCalendarToPerson(idx, val);
                          (e.target as HTMLSelectElement).value = '';
                        }
                      }}
                    >
                      <option value="">— add calendar to ${person.name} —</option>
                      ${this._calendarEntities
                        .filter((id) => !person.calendars.includes(id))
                        .map((id) => html`<option value="${id}">${id}</option>`)}
                    </select>
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
      gap: 8px;
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

    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.85rem;
      color: var(--secondary-text-color, #666);
    }

    .field input,
    .field select {
      padding: 6px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px;
      font-size: 0.9rem;
      background: var(--input-fill-color, #f5f5f5);
      color: var(--primary-text-color);
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
      padding: 6px;
      border: 1px dashed var(--divider-color, #e0e0e0);
      border-radius: 4px;
      font-size: 0.85rem;
      background: transparent;
      color: var(--primary-text-color);
      cursor: pointer;
    }

    .add-select.indent {
      margin-left: 16px;
    }

    .remove-btn {
      background: transparent;
      border: none;
      color: var(--error-color, #f44336);
      cursor: pointer;
      font-size: 0.85rem;
      padding: 2px 4px;
    }

    .small-btn {
      background: var(--primary-color, #03a9f4);
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 0.8rem;
      cursor: pointer;
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
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.8rem;
      color: var(--secondary-text-color, #666);
      flex: 1;
      min-width: 80px;
    }

    .inline-field input {
      padding: 4px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px;
      font-size: 0.85rem;
      background: var(--input-fill-color, #f5f5f5);
      color: var(--primary-text-color);
    }
  `;
}

customElements.define('familycalendar-for-homeassistant-editor', FamilyCalendarForHomeassistantEditor);
