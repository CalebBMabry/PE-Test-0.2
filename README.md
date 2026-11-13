# 🏋️ Fitness Room Tracker

A simple, no-install web app for a fitness room / PE class. It tracks:

- **Profiles** – name, birthday (age is calculated), notes. Built for 100+ people.
- **Weekly check-in** – weight and resting heart rate, once per week.
- **Daily workouts** – Monday through Friday: workout type, minutes, notes.
- **Median heart rate** and **weight over time**, calculated automatically, with charts for each person.

## How to start
Double-click **`index.html`** to open it in any modern browser (Chrome, Edge, Firefox, Safari). You don't need a server or internet connection.

The **❓ Help** tab inside the app has a 2-minute quick start guide.

## Adding lots of people quickly
- **📋 Add Many at Once** (Profiles tab): paste one person per line as `Name, Birthday`.
- **CSV import** (Import / Export tab): columns `name,birthday,weight,heartrate`. Only `name` is required.
  `first name` / `last name` columns work too.

## Fast data entry
- On the weekly and daily screens, type a value and press **Enter** to move to the next person (**Shift+Enter** moves up).
- **Quick fill** fills in the same workout and minutes for everyone shown in one click.
- Use the search box to narrow the list, for example to one class or group.

## Your data
Everything is saved in your browser's local storage on this computer. Use **💾 Import / Export →
Download full backup** often. You can restore that backup on any computer. You can also export CSVs for Excel or Google Sheets.

## Files
| File | Purpose |
|---|---|
| `index.html` | Page layout and tabs |
| `styles.css` | Look and feel |
| `app.js` | All logic (sections are commented and numbered 1–6) |
