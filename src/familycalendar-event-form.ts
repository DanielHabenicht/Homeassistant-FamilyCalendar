import { LitElement, html, unsafeCSS, type TemplateResult, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import styles from './familycalendar-event-form.scss';

type EventFormTexts = {
  title: string;
  placeholder: string;
  description: string;
  descriptionPlaceholder: string;
  allDay: string;
  start: string;
  end: string;
  calendar: string;
};

type EventFormCalendarOption = {
  value: string;
  label: string;
};

class FamilyCalendarEventForm extends LitElement {
  @property({ type: String }) public title = '';
  @property({ type: String }) public description = '';
  @property({ type: Boolean }) public allDay = false;
  @property({ type: String }) public start = '';
  @property({ type: String }) public end = '';
  @property({ type: String }) public calendar = '';
  @property({ type: Array }) public calendarOptions: EventFormCalendarOption[] = [];
  @property({ type: String }) public locale = 'en';
  @property({ type: String }) public inputType: 'date' | 'datetime-local' = 'datetime-local';
  @property({ type: String }) public errorMessage = '';
  @property({ attribute: false }) public texts!: EventFormTexts;

  private _readValue(event: Event): string {
    const target = event.target as { value?: string } | null;
    return target?.value ?? '';
  }

  private _readChecked(event: Event): boolean {
    const target = event.target as { checked?: boolean } | null;
    return target?.checked ?? false;
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
        <ha-textfield
          class="dialog-input"
          .label=${this.texts.title}
          .placeholder=${this.texts.placeholder}
          .value=${this.title}
          @input=${(e: Event) => this._emit('familycalendar-title-changed', this._readValue(e))}
          @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this._emit('familycalendar-submit')}
        ></ha-textfield>

        <ha-textarea
          class="dialog-input"
          .label=${this.texts.description}
          .placeholder=${this.texts.descriptionPlaceholder}
          .value=${this.description}
          @input=${(e: Event) =>
            this._emit('familycalendar-description-changed', this._readValue(e))}
        ></ha-textarea>

        <ha-formfield .label=${this.texts.allDay}>
          <ha-checkbox
            .checked=${this.allDay}
            @change=${(e: Event) => this._emit('familycalendar-all-day-changed', this._readChecked(e))}
          ></ha-checkbox>
        </ha-formfield>

        <ha-textfield
          class="dialog-input"
          .label=${this.texts.start}
          type=${this.inputType}
          lang=${this.locale}
          .value=${this.start}
          @input=${(e: Event) => this._emit('familycalendar-start-changed', this._readValue(e))}
        ></ha-textfield>

        <ha-textfield
          class="dialog-input"
          .label=${this.texts.end}
          type=${this.inputType}
          lang=${this.locale}
          .value=${this.end}
          @input=${(e: Event) => this._emit('familycalendar-end-changed', this._readValue(e))}
        ></ha-textfield>

        <ha-select
          class="dialog-input"
          .label=${this.texts.calendar}
          .value=${this.calendar}
          @selected=${(e: Event) => this._emit('familycalendar-calendar-changed', this._readValue(e))}
          @change=${(e: Event) => this._emit('familycalendar-calendar-changed', this._readValue(e))}
        >
          ${this.calendarOptions.map(
            (option) => html`
              <mwc-list-item .value=${option.value} ?selected=${option.value === this.calendar}
                >${option.label}</mwc-list-item
              >
            `,
          )}
        </ha-select>

        ${this.errorMessage ? html`<p class="dialog-error">${this.errorMessage}</p>` : nothing}
      </div>
    `;
  }

  static styles = unsafeCSS(styles);
}

customElements.define('familycalendar-event-form', FamilyCalendarEventForm);
