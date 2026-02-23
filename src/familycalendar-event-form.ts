import { LitElement, html, unsafeCSS, type TemplateResult, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import type { CardTextKey } from './i18n.js';
import styles from './familycalendar-event-form.scss';

type EventFormCalendarOption = {
  value: string;
  label: string;
};

class FamilyCalendarEventForm extends LitElement {
  @property({ attribute: false }) public hass?: unknown;
  @property({ type: String }) public title = '';
  @property({ type: String }) public description = '';
  @property({ type: Boolean }) public allDay = false;
  @property({ type: String }) public start = '';
  @property({ type: String }) public end = '';
  @property({ type: String }) public calendar = '';
  @property({ type: Array }) public calendarOptions: EventFormCalendarOption[] = [];
  @property({ type: String }) public errorMessage = '';
  @property({ type: Boolean }) public readOnly = false;
  @property({ attribute: false }) public dictionary!: Record<CardTextKey, string>;

  private _readSelectorValue<T>(event: Event, fallback: T): T {
    const customEvent = event as CustomEvent<{ value?: T }>;
    return customEvent.detail?.value ?? fallback;
  }

  private _normalizeDateTimeValue(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.includes('T')) return trimmed;
    const spaceIndex = trimmed.indexOf(' ');
    if (spaceIndex > 0) {
      return `${trimmed.slice(0, spaceIndex)}T${trimmed.slice(spaceIndex + 1)}`;
    }
    return trimmed;
  }

  private _toSelectorDateTimeValue(value: string): string {
    const normalized = this._normalizeDateTimeValue(value);
    return normalized.replace('T', ' ');
  }

  private _emit(name: string, value?: string | boolean) {
    this.dispatchEvent(
      new CustomEvent(name, {
        detail: value !== undefined ? { value } : undefined,
        bubbles: true,
        composed: true,
      }),
    );
  }

  protected render(): TemplateResult {
    return html`
      <div class="dialog-fields">
        <ha-selector
          class="dialog-input"
          .hass=${this.hass}
          .selector=${{
            text: {
              multiline: false,
            },
          }}
          .label=${this.dictionary.title}
          .value=${this.title}
          ?disabled=${this.readOnly}
          @value-changed=${(e: Event) =>
            !this.readOnly &&
            this._emit('familycalendar-title-changed', this._readSelectorValue(e, this.title))}
        ></ha-selector>

        <ha-selector
          class="dialog-input"
          .hass=${this.hass}
          .selector=${{
            text: {
              multiline: true,
            },
          }}
          .label=${this.dictionary.description}
          .value=${this.description}
          ?disabled=${this.readOnly}
          @value-changed=${(e: Event) =>
            !this.readOnly &&
            this._emit(
              'familycalendar-description-changed',
              this._readSelectorValue(e, this.description),
            )}
        ></ha-selector>

        <ha-selector
          class="dialog-input"
          .hass=${this.hass}
          .selector=${{
            boolean: {},
          }}
          .label=${this.dictionary.allDay}
          .value=${this.allDay}
          ?disabled=${this.readOnly}
          @value-changed=${(e: Event) =>
            !this.readOnly &&
            this._emit('familycalendar-all-day-changed', this._readSelectorValue(e, this.allDay))}
        ></ha-selector>

        <ha-selector
          class="dialog-input"
          .hass=${this.hass}
          .selector=${this.allDay ? { date: {} } : { datetime: {} }}
          .label=${this.dictionary.start}
          .value=${this.allDay ? this.start : this._toSelectorDateTimeValue(this.start)}
          ?disabled=${this.readOnly}
          @value-changed=${(e: Event) => {
            if (this.readOnly) return;
            const value = this._readSelectorValue(e, this.start);
            this._emit(
              'familycalendar-start-changed',
              this.allDay ? value : this._normalizeDateTimeValue(value),
            );
          }}
        ></ha-selector>

        <ha-selector
          class="dialog-input"
          .hass=${this.hass}
          .selector=${this.allDay ? { date: {} } : { datetime: {} }}
          .label=${this.dictionary.end}
          .value=${this.allDay ? this.end : this._toSelectorDateTimeValue(this.end)}
          ?disabled=${this.readOnly}
          @value-changed=${(e: Event) => {
            if (this.readOnly) return;
            const value = this._readSelectorValue(e, this.end);
            this._emit(
              'familycalendar-end-changed',
              this.allDay ? value : this._normalizeDateTimeValue(value),
            );
          }}
        ></ha-selector>

        <ha-selector
          class="dialog-input"
          .hass=${this.hass}
          .selector=${{
            select: {
              mode: 'dropdown',
              options: this.calendarOptions.map((option) => ({
                value: option.value,
                label: option.label,
              })),
            },
          }}
          .label=${this.dictionary.calendar}
          .value=${this.calendar}
          ?disabled=${this.readOnly}
          @value-changed=${(e: Event) =>
            !this.readOnly &&
            this._emit(
              'familycalendar-calendar-changed',
              this._readSelectorValue(e, this.calendar),
            )}
        ></ha-selector>

        ${this.errorMessage
          ? html`<ha-input-helper-text class="dialog-error"
              >${this.errorMessage}</ha-input-helper-text
            >`
          : nothing}
      </div>
    `;
  }

  static styles = unsafeCSS(styles);
}

customElements.define('familycalendar-event-form', FamilyCalendarEventForm);
