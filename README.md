# FamilyCalendar for Homeassistant

A custom [Home Assistant](https://www.home-assistant.io/) Lovelace card that displays calendar entities with **day / 3-day / week / month** views, person-based visibility toggles and click-to-create event support.

Built with [FullCalendar.js](https://fullcalendar.io/) and [Lit](https://lit.dev/).

---

## Features

| Feature              | Details                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| **Views**            | Month (`dayGridMonth`), Week (`timeGridWeek`), 3 Days (`timeGridThreeDay`), Day (`timeGridDay`) |
| **Person selectors** | Chips above the calendar to show/hide calendars grouped by person                               |
| **Click to create**  | Click any time slot or day cell to open a pre-filled new-event dialog                           |
| **Edit / Delete**    | Click an existing event to edit details or delete it                                            |
| **Calendar picker**  | Choose which HA calendar the new event is created in                                            |
| **Card editor**      | Full Lovelace UI editor – no YAML required                                                      |

---

## Development Setup

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/)
- [Node.js](https://nodejs.org/) ≥ 18

### Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the card dev server (serves dist/familycalendar-card.js on port 4000)
npm run dev

# 3. Start Home Assistant
docker compose up -d

# Open http://localhost:8123 and complete the onboarding.
```

The card resource is loaded from `http://localhost:4000/familycalendar-card.js`
as configured in `homeassistant/config/configuration.yaml`.
Reload the HA browser tab (Ctrl+Shift+R) after changes.

---

## Card Configuration

```yaml
type: custom:familycalendar-card
title: Family Calendar # optional – card header title
initial_view: dayGridMonth # dayGridMonth | timeGridWeek | timeGridThreeDay | timeGridDay
initial_time: '06:00:00' # optional – initial scroll time for week/day view
show_now_indicator: true # optional – show current-time line in week/day view
start_week_on_current_day: false # optional – week view starts on today's weekday
height: 'auto' # optional – calendar height (e.g. 600px, 80vh, auto)

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
| `npm run dev`          | Watch mode + local dev server on `:4000`    |
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
