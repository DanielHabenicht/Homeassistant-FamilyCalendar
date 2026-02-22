# FamilyCalendar for Homeassistant

A custom [Home Assistant](https://www.home-assistant.io/) Lovelace card that displays calendar entities with **day / week / month** views, person-based visibility toggles and click-to-create event support.

Built with [FullCalendar.js](https://fullcalendar.io/) and [Lit](https://lit.dev/).

---

## Features

| Feature              | Details                                                               |
| -------------------- | --------------------------------------------------------------------- |
| **Views**            | Month (`dayGridMonth`), Week (`timeGridWeek`), Day (`timeGridDay`)    |
| **Person selectors** | Chips above the calendar to show/hide calendars grouped by person     |
| **Click to create**  | Click any time slot or day cell to open a pre-filled new-event dialog |
| **Edit / Delete**    | Click an existing event to edit details or delete it                  |
| **Calendar picker**  | Choose which HA calendar the new event is created in                  |
| **Card editor**      | Full Lovelace UI editor – no YAML required                            |

---

## Development Setup

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/)
- [Node.js](https://nodejs.org/) ≥ 18

### Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Build the card (output: dist/calendar-card.js)
npm run build

# 3. Start Home Assistant
docker compose up -d

# Open http://localhost:8123 and complete the onboarding.
```

For live rebuilding while you edit source files:

```bash
npm run dev   # watch mode – rebuilds on every save
```

> The `dist/` folder is mounted directly into the HA container at `/config/www/`,
> so a rebuild is all you need — no container restart required.
> Reload the HA browser tab (Ctrl+Shift+R) to pick up the new bundle.

---

## Card Configuration

```yaml
type: custom:familycalendar-card
title: Family Calendar # optional – card header title
initial_view: dayGridMonth # dayGridMonth | timeGridWeek | timeGridDay

# Simple list of calendar entity IDs (no grouping)
calendars:
  - calendar.my_calendar

# Group calendars under a person (shows person-selector chips)
persons:
  - name: Alice
    color: '#039be5' # optional hex color for Alice's events
    icon: mdi:account # optional MDI icon for the chip
    calendars:
      - calendar.alice_work
      - calendar.alice_personal
  - name: Bob
    color: '#33b679'
    calendars:
      - calendar.bob_work
```

`calendars` and `persons[].calendars` can be combined — all unique IDs are displayed.

---

## Scripts

| Command                | Description                                 |
| ---------------------- | ------------------------------------------- |
| `npm run build`        | Production bundle → `dist/calendar-card.js` |
| `npm run dev`          | Watch mode (rebuilds on save)               |
| `npm run format`       | Format source files with Prettier           |
| `npm run format:check` | Check formatting (CI)                       |
| `npm run type-check`   | TypeScript type checking without emitting   |

---

## Project Structure

```
├── src/
│   ├── calendar-card.ts         Main card Lit element
│   ├── calendar-card-editor.ts  Lovelace card editor element
│   ├── types.ts                 TypeScript interfaces
│   └── utils.ts                 Helper utilities
├── dist/                        Build output (git-ignored)
├── homeassistant/
│   └── config/
│       ├── configuration.yaml   HA config (loads the card resource)
│       └── ui-lovelace.yaml     Example dashboard with the card
├── docker-compose.yml
├── rollup.config.mjs
├── tsconfig.json
└── .prettierrc
```
