/* =====================================================================
   Fitness Room Tracker
   ---------------------------------------------------------------------
   - Profiles: name, birthday, notes (100+ people supported)
   - Weekly check-in: weight + resting heart rate (one entry per week)
   - Daily workouts: Monday–Friday, workout type + minutes + notes
   - Median heart rate is calculated from all weekly heart-rate entries
   - Everything is stored in the browser (localStorage). No server needed.

   Code layout:
     1. Storage        – load / save data
     2. Date helpers   – weeks always start on Monday
     3. Data helpers   – add people, read/write entries, stats
     4. Rendering      – one render function per tab
     5. Import/Export  – CSV + JSON
     6. Event wiring   – buttons, inputs, keyboard
   ===================================================================== */

(() => {
  'use strict';

  // ------------------------------------------------------------------
  // 1. STORAGE
  // ------------------------------------------------------------------
  const STORAGE_KEY = 'fitnessRoomTracker.v1';

  /** Shape of all saved data. */
  function emptyData() {
    return {
      version: 1,
      settings: { unit: 'lb' },
      people: [],      // [{ id, name, birthday, notes, createdAt }]
      weekly: {},      // { personId: { 'YYYY-MM-DD'(Monday): { weight, hr } } }
      workouts: {},    // { personId: { 'YYYY-MM-DD': { type, minutes, notes } } }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyData();
      return Object.assign(emptyData(), JSON.parse(raw));
    } catch (e) {
      console.warn('Could not load saved data', e);
      return emptyData();
    }
  }

  let saveTimer = null;
  function save() {
    // Small delay so fast typing doesn't write on every keystroke.
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      } catch (e) {
        toast('⚠️ Could not save — browser storage is full or blocked. Download a backup!');
      }
    }, 150);
  }

  let db = load();

  // ------------------------------------------------------------------
  // 2. DATE HELPERS (all dates are local "YYYY-MM-DD" strings)
  // ------------------------------------------------------------------
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  function toISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function fromISO(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(iso, n) {
    const d = fromISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }
  /** Monday of the week containing the given date. */
  function mondayOf(iso) {
    const d = fromISO(iso);
    const offset = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
    d.setDate(d.getDate() - offset);
    return toISO(d);
  }
  const todayISO = () => toISO(new Date());

  function prettyDate(iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
    return iso ? fromISO(iso).toLocaleDateString(undefined, opts) : '';
  }

  function ageFrom(birthday) {
    if (!birthday) return null;
    const b = fromISO(birthday);
    const t = new Date();
    let age = t.getFullYear() - b.getFullYear();
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
    return age >= 0 ? age : null;
  }

  /** Accepts YYYY-MM-DD, MM/DD/YYYY, M/D/YY. Returns YYYY-MM-DD or ''. */
  function normalizeDate(input) {
    const s = String(input || '').trim();
    if (!s) return '';
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) return toISO(new Date(+m[1], +m[2] - 1, +m[3]));
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (m) {
      let y = +m[3];
      if (y < 100) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000;
      return toISO(new Date(y, +m[1] - 1, +m[2]));
    }
    const d = new Date(s);
    return isNaN(d) ? '' : toISO(d);
  }

  // ------------------------------------------------------------------
  // 3. DATA HELPERS
  // ------------------------------------------------------------------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function addPerson({ name, birthday = '', notes = '' }) {
    name = String(name || '').trim().replace(/\s+/g, ' ');
    if (!name) return null;
    birthday = normalizeDate(birthday);
    const dup = db.people.find(p => p.name.toLowerCase() === name.toLowerCase() && p.birthday === birthday);
    if (dup) return null;
    const person = { id: uid(), name, birthday, notes: notes.trim(), createdAt: todayISO() };
    db.people.push(person);
    return person;
  }

  function removePerson(id) {
    db.people = db.people.filter(p => p.id !== id);
    delete db.weekly[id];
    delete db.workouts[id];
  }

  const getPerson = id => db.people.find(p => p.id === id);

  /** Read / write a weekly entry. Empty values remove the field. */
  function getWeekly(pid, week) { return (db.weekly[pid] || {})[week] || {}; }
  function setWeekly(pid, week, field, value) {
    const rec = Object.assign({}, getWeekly(pid, week));
    if (value === '' || value == null || isNaN(value)) delete rec[field];
    else rec[field] = Number(value);
    db.weekly[pid] = db.weekly[pid] || {};
    if (Object.keys(rec).length) db.weekly[pid][week] = rec;
    else delete db.weekly[pid][week];
    save();
  }

  function getWorkout(pid, date) { return (db.workouts[pid] || {})[date] || {}; }
  function setWorkout(pid, date, field, value) {
    const rec = Object.assign({}, getWorkout(pid, date));
    if (field === 'minutes') {
      if (value === '' || isNaN(value)) delete rec.minutes; else rec.minutes = Number(value);
    } else {
      value = String(value || '').trim();
      if (value) rec[field] = value; else delete rec[field];
    }
    db.workouts[pid] = db.workouts[pid] || {};
    if (Object.keys(rec).length) db.workouts[pid][date] = rec;
    else delete db.workouts[pid][date];
    save();
  }

  function median(nums) {
    if (!nums.length) return null;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  /** Sorted weekly history for one person: [{ week, weight, hr }] */
  function weeklyHistory(pid) {
    return Object.entries(db.weekly[pid] || {})
      .map(([week, r]) => ({ week, ...r }))
      .sort((a, b) => a.week.localeCompare(b.week));
  }

  /** Summary stats used across the app. */
  function stats(pid) {
    const hist = weeklyHistory(pid);
    const weights = hist.filter(h => h.weight != null);
    const hrs = hist.filter(h => h.hr != null).map(h => h.hr);
    const first = weights[0], last = weights[weights.length - 1];
    return {
      medianHR: median(hrs),
      latestWeight: last ? last.weight : null,
      startWeight: first ? first.weight : null,
      weightChange: first && last && weights.length > 1 ? +(last.weight - first.weight).toFixed(1) : null,
      checkIns: hist.length,
    };
  }

  /** Most recent weekly value strictly before `week` (used as a hint). */
  function previousValue(pid, week, field) {
    const hist = weeklyHistory(pid).filter(h => h.week < week && h[field] != null);
    return hist.length ? hist[hist.length - 1][field] : null;
  }

  const sortedPeople = () => [...db.people].sort((a, b) => a.name.localeCompare(b.name));
  const matches = (p, q) => !q || p.name.toLowerCase().includes(q.trim().toLowerCase());

  // ------------------------------------------------------------------
  // 4. RENDERING
  // ------------------------------------------------------------------
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, digits = 1) => (n == null ? '—' : (Math.round(n * 10 ** digits) / 10 ** digits).toString());
  const unit = () => db.settings.unit || 'lb';

  // UI state (not saved)
  const ui = {
    tab: 'dashboard',
    week: mondayOf(todayISO()),
    // Mon=0 … Fri=4; on weekends start on Monday.
    dayIndex: (() => { const d = (new Date().getDay() + 6) % 7; return d > 4 ? 0 : d; })(),
  };

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function showTab(name) {
    ui.tab = name;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + name));
    render();
  }

  function render() {
    ({
      dashboard: renderDashboard,
      profiles: renderProfiles,
      weekly: renderWeekly,
      workouts: renderWorkouts,
      data: () => { $('#unitSelect').value = unit(); },
      help: () => {},
    })[ui.tab]();
    renderWorkoutTypeList();
  }

  function renderWeekPickers() {
    const end = addDays(ui.week, 4);
    const isThisWeek = ui.week === mondayOf(todayISO());
    document.querySelectorAll('.week-picker').forEach(el => {
      el.innerHTML = `
        <button data-week="-1" title="Previous week">◀</button>
        <span class="label">Week of ${prettyDate(ui.week, { month: 'short', day: 'numeric' })} – ${prettyDate(end)}</span>
        <button data-week="1" title="Next week">▶</button>
        ${isThisWeek ? '' : '<button data-week="0">This week</button>'}`;
    });
  }

  function emptyState(msg) {
    return `<div class="empty">${msg}<br><br><button class="primary" data-goto="profiles">👥 Go to Profiles to add people</button></div>`;
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const week = mondayOf(todayISO());
    const today = todayISO();
    const n = db.people.length;
    const checkedIn = db.people.filter(p => Object.keys(getWeekly(p.id, week)).length).length;
    const todayIsWeekday = new Date().getDay() >= 1 && new Date().getDay() <= 5;
    const workedOutToday = db.people.filter(p => Object.keys(getWorkout(p.id, today)).length).length;

    let weekMinutes = 0, weekSessions = 0;
    db.people.forEach(p => {
      for (let i = 0; i < 5; i++) {
        const w = getWorkout(p.id, addDays(week, i));
        if (Object.keys(w).length) { weekSessions++; weekMinutes += w.minutes || 0; }
      }
    });

    const missing = sortedPeople().filter(p => !Object.keys(getWeekly(p.id, week)).length);
    const upcomingBdays = sortedPeople()
      .filter(p => p.birthday)
      .map(p => {
        const b = fromISO(p.birthday);
        const next = new Date(new Date().getFullYear(), b.getMonth(), b.getDate());
        if (toISO(next) < today) next.setFullYear(next.getFullYear() + 1);
        return { p, next: toISO(next) };
      })
      .filter(x => x.next <= addDays(today, 14))
      .sort((a, b) => a.next.localeCompare(b.next));

    $('#tab-dashboard').innerHTML = `
      <h2>Hello! Today is ${prettyDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
      ${n === 0 ? `<div class="card"><h3>👋 Welcome!</h3>
          <p>Start by adding people on the <b>👥 Profiles</b> tab, or load sample data in <b>💾 Import / Export</b> to explore.</p>
          <button class="primary" data-goto="profiles">Add people</button> <button data-goto="help">Read the 2-minute guide</button></div>` : ''}
      <div class="cards" style="margin:14px 0">
        <div class="card"><div class="stat">${n}</div><div class="stat-label">People in the fitness room</div></div>
        <div class="card"><div class="stat">${checkedIn} / ${n}</div><div class="stat-label">Weekly check-ins done this week</div>
          <button class="small" data-goto="weekly">Open check-in →</button></div>
        <div class="card"><div class="stat">${todayIsWeekday ? workedOutToday : '—'}</div>
          <div class="stat-label">${todayIsWeekday ? 'Workouts logged today' : 'Weekend — no workout day'}</div>
          <button class="small" data-goto="workouts">Log workouts →</button></div>
        <div class="card"><div class="stat">${weekMinutes}</div><div class="stat-label">Total minutes this week (${weekSessions} sessions)</div></div>
      </div>
      <div class="cards">
        <div class="card"><h3>⏳ Still need a check-in this week (${missing.length})</h3>
          ${missing.length ? `<div class="history">${missing.slice(0, 200).map(p => `<div><button class="name-link" data-view="${p.id}">${esc(p.name)}</button></div>`).join('')}</div>` : '<p class="done">✔ Everyone is checked in!</p>'}
        </div>
        <div class="card"><h3>🎂 Birthdays in the next 2 weeks</h3>
          ${upcomingBdays.length ? upcomingBdays.map(x => `<div>${prettyDate(x.next, { month: 'short', day: 'numeric' })} — <button class="name-link" data-view="${x.p.id}">${esc(x.p.name)}</button> (turns ${ageFrom(x.p.birthday) + (x.next === today ? 0 : 1)})</div>`).join('') : '<p class="muted">None coming up.</p>'}
        </div>
      </div>`;
  }

  // ---------- Profiles ----------
  function renderProfiles() {
    const q = $('#profileSearch').value;
    const sortBy = $('#profileSort').value;
    let rows = db.people.filter(p => matches(p, q)).map(p => ({ p, s: stats(p.id), age: ageFrom(p.birthday) }));
    const num = v => (v == null ? -Infinity : v);
    rows.sort((a, b) => {
      if (sortBy === 'age') return num(b.age) - num(a.age);
      if (sortBy === 'weight') return num(b.s.latestWeight) - num(a.s.latestWeight);
      if (sortBy === 'hr') return num(b.s.medianHR) - num(a.s.medianHR);
      return a.p.name.localeCompare(b.p.name);
    });

    if (!db.people.length) {
      $('#profilesTable').innerHTML = `<div class="empty">No people yet. Click <b>➕ Add One Person</b> or <b>📋 Add Many at Once</b> above.</div>`;
      return;
    }
    $('#profilesTable').innerHTML = `
      <table>
        <thead><tr>
          <th>#</th><th>Name</th><th>Birthday</th><th class="num">Age</th>
          <th class="num">Median HR (bpm)</th><th class="num">Latest weight (${unit()})</th>
          <th class="num">Change since start</th><th class="num">Check-ins</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map(({ p, s, age }, i) => `
            <tr>
              <td class="muted">${i + 1}</td>
              <td><button class="name-link" data-view="${p.id}">${esc(p.name)}</button></td>
              <td>${prettyDate(p.birthday) || '<span class="muted">—</span>'}</td>
              <td class="num">${age ?? '—'}</td>
              <td class="num">${fmt(s.medianHR, 0)}</td>
              <td class="num">${fmt(s.latestWeight)}</td>
              <td class="num ${s.weightChange > 0 ? 'up' : s.weightChange < 0 ? 'down' : ''}">${s.weightChange == null ? '—' : (s.weightChange > 0 ? '+' : '') + s.weightChange}</td>
              <td class="num">${s.checkIns}</td>
              <td>
                <button class="small" data-edit="${p.id}">✏️ Edit</button>
                <button class="small danger" data-delete="${p.id}">🗑️</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="muted" style="padding:0 10px">Showing ${rows.length} of ${db.people.length} people.</p>`;
  }

  // ---------- Weekly check-in ----------
  function renderWeekly() {
    renderWeekPickers();
    const q = $('#weeklySearch').value;
    const people = sortedPeople().filter(p => matches(p, q));
    if (!db.people.length) { $('#weeklyTable').innerHTML = emptyState('No people yet.'); return; }

    const done = people.filter(p => Object.keys(getWeekly(p.id, ui.week)).length).length;
    $('#weeklyTable').innerHTML = `
      <table>
        <thead><tr>
          <th>Name</th><th>Weight (${unit()})</th><th>Last weight</th><th>Change</th>
          <th>Resting heart rate (bpm)</th><th>Median HR</th><th></th>
        </tr></thead>
        <tbody>
          ${people.map((p, row) => {
            const r = getWeekly(p.id, ui.week);
            const prevW = previousValue(p.id, ui.week, 'weight');
            const diff = r.weight != null && prevW != null ? +(r.weight - prevW).toFixed(1) : null;
            return `<tr data-pid="${p.id}">
              <td><button class="name-link" data-view="${p.id}">${esc(p.name)}</button></td>
              <td><input class="num" type="number" step="0.1" min="0" data-field="weight" data-row="${row}" data-col="0"
                   value="${r.weight ?? ''}" placeholder="${prevW ?? ''}"></td>
              <td class="muted">${fmt(prevW)}</td>
              <td class="diff">${diffHTML(diff)}</td>
              <td><input class="num" type="number" min="20" max="250" data-field="hr" data-row="${row}" data-col="1"
                   value="${r.hr ?? ''}"></td>
              <td class="muted median">${fmt(stats(p.id).medianHR, 0)}</td>
              <td class="status">${Object.keys(r).length ? '<span class="done">✔</span>' : ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <p class="muted" style="padding:0 10px">${done} of ${people.length} shown have a check-in this week. Grey numbers in empty boxes are last week's weight.</p>`;
  }

  const diffHTML = d => d == null ? '' : `<span class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' : ''}${d}</span>`;

  // ---------- Daily workouts ----------
  function renderWorkouts() {
    renderWeekPickers();
    const today = todayISO();
    $('#dayTabs').innerHTML = DAY_NAMES.map((d, i) => {
      const date = addDays(ui.week, i);
      return `<button data-day="${i}" class="${i === ui.dayIndex ? 'active' : ''} ${date === today ? 'today' : ''}"
               title="${prettyDate(date)}">${d.slice(0, 3)} ${fromISO(date).getDate()}</button>`;
    }).join('');

    const q = $('#workoutSearch').value;
    const people = sortedPeople().filter(p => matches(p, q));
    if (!db.people.length) { $('#workoutTable').innerHTML = emptyState('No people yet.'); return; }

    if ($('#weekOverview').checked) {
      // Read-only grid: rows = people, columns = Mon–Fri
      $('#workoutTable').innerHTML = `
        <table>
          <thead><tr><th>Name</th>${DAY_NAMES.map((d, i) => `<th>${d.slice(0, 3)} ${fromISO(addDays(ui.week, i)).getDate()}</th>`).join('')}<th class="num">Days</th><th class="num">Minutes</th></tr></thead>
          <tbody>
            ${people.map(p => {
              let days = 0, mins = 0;
              const cells = DAY_NAMES.map((_, i) => {
                const w = getWorkout(p.id, addDays(ui.week, i));
                if (!Object.keys(w).length) return '<td class="muted">·</td>';
                days++; mins += w.minutes || 0;
                return `<td title="${esc(w.notes || '')}">${esc(w.type || '✔')}${w.minutes ? ` <span class="muted">${w.minutes}m</span>` : ''}</td>`;
              }).join('');
              return `<tr><td><button class="name-link" data-view="${p.id}">${esc(p.name)}</button></td>${cells}<td class="num">${days}/5</td><td class="num">${mins}</td></tr>`;
            }).join('')}
          </tbody>
        </table>`;
      return;
    }

    const date = addDays(ui.week, ui.dayIndex);
    const done = people.filter(p => Object.keys(getWorkout(p.id, date)).length).length;
    $('#workoutTable').innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Workout — ${DAY_NAMES[ui.dayIndex]}, ${prettyDate(date, { month: 'short', day: 'numeric' })}</th><th>Minutes</th><th>Notes</th><th></th></tr></thead>
        <tbody>
          ${people.map((p, row) => {
            const w = getWorkout(p.id, date);
            return `<tr data-pid="${p.id}">
              <td><button class="name-link" data-view="${p.id}">${esc(p.name)}</button></td>
              <td><input list="workoutTypes" data-wfield="type" data-row="${row}" data-col="0" value="${esc(w.type || '')}" placeholder="e.g. Treadmill"></td>
              <td><input class="num" type="number" min="0" max="600" data-wfield="minutes" data-row="${row}" data-col="1" value="${w.minutes ?? ''}"></td>
              <td><input data-wfield="notes" data-row="${row}" data-col="2" value="${esc(w.notes || '')}" placeholder="optional"></td>
              <td class="status">${Object.keys(w).length ? '<span class="done">✔</span>' : ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <p class="muted" style="padding:0 10px">${done} of ${people.length} shown have a workout logged for ${DAY_NAMES[ui.dayIndex]}.</p>`;
  }

  /** Suggest previously used workout names + common defaults. */
  function renderWorkoutTypeList() {
    const set = new Set(['Treadmill', 'Bike', 'Elliptical', 'Rowing', 'Weights – Upper', 'Weights – Lower',
      'Circuit', 'Stretching / Yoga', 'Running', 'Walking', 'HIIT', 'Sports / Games']);
    Object.values(db.workouts).forEach(days => Object.values(days).forEach(w => w.type && set.add(w.type)));
    $('#workoutTypes').innerHTML = [...set].sort().map(t => `<option value="${esc(t)}">`).join('');
  }

  // ---------- Person detail ----------
  /** Simple SVG line chart. points: [{ x: label, y: number }] */
  function lineChart(points, color, suffix = '') {
    const W = 420, H = 180, P = 32;
    if (points.length === 0) return '<p class="muted">No data yet.</p>';
    const ys = points.map(p => p.y);
    let min = Math.min(...ys), max = Math.max(...ys);
    if (min === max) { min -= 1; max += 1; }
    const x = i => P + (points.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (points.length - 1));
    const y = v => H - P + 8 - ((v - min) / (max - min)) * (H - 2 * P);
    const path = points.map((p, i) => `${x(i)},${y(p.y)}`).join(' ');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">
      <text x="4" y="${y(max) + 4}" font-size="11" fill="#6b7486">${fmt(max)}</text>
      <text x="4" y="${y(min) + 4}" font-size="11" fill="#6b7486">${fmt(min)}</text>
      <polyline fill="none" stroke="${color}" stroke-width="2.5" points="${path}"/>
      ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.y)}" r="3.5" fill="${color}"><title>${p.x}: ${p.y}${suffix}</title></circle>`).join('')}
      <text x="${P}" y="${H - 4}" font-size="11" fill="#6b7486">${points[0].x}</text>
      <text x="${W - P}" y="${H - 4}" font-size="11" fill="#6b7486" text-anchor="end">${points[points.length - 1].x}</text>
    </svg>`;
  }

  function openDetail(pid) {
    const p = getPerson(pid);
    if (!p) return;
    const s = stats(pid);
    const hist = weeklyHistory(pid);
    const short = iso => prettyDate(iso, { month: 'short', day: 'numeric' });
    const workouts = Object.entries(db.workouts[pid] || {}).sort((a, b) => b[0].localeCompare(a[0]));
    const totalMin = workouts.reduce((t, [, w]) => t + (w.minutes || 0), 0);

    $('#detailBody').innerHTML = `
      <h2>${esc(p.name)}</h2>
      <div class="detail-grid">
        <div class="card"><div class="stat-label">Birthday</div><b>${prettyDate(p.birthday) || '—'}</b>${p.birthday ? ` (age ${ageFrom(p.birthday)})` : ''}</div>
        <div class="card"><div class="stat-label">Median heart rate</div><b>${fmt(s.medianHR, 0)} bpm</b></div>
        <div class="card"><div class="stat-label">Latest weight</div><b>${fmt(s.latestWeight)} ${unit()}</b></div>
        <div class="card"><div class="stat-label">Change since start</div><b>${s.weightChange == null ? '—' : (s.weightChange > 0 ? '+' : '') + s.weightChange + ' ' + unit()}</b></div>
        <div class="card"><div class="stat-label">Workouts logged</div><b>${workouts.length}</b> (${totalMin} min)</div>
      </div>
      ${p.notes ? `<p><b>Notes:</b> ${esc(p.notes)}</p>` : ''}
      <div class="chart-wrap">
        <div><h4>Weight over time (${unit()})</h4>${lineChart(hist.filter(h => h.weight != null).map(h => ({ x: short(h.week), y: h.weight })), '#2f6fed', ' ' + unit())}</div>
        <div><h4>Resting heart rate (bpm)</h4>${lineChart(hist.filter(h => h.hr != null).map(h => ({ x: short(h.week), y: h.hr })), '#d0392b', ' bpm')}</div>
      </div>
      <div class="chart-wrap">
        <div><h4>Weekly check-ins</h4><div class="history table-wrap"><table>
          <thead><tr><th>Week of</th><th class="num">Weight</th><th class="num">HR</th></tr></thead>
          <tbody>${hist.slice().reverse().map(h => `<tr><td>${prettyDate(h.week)}</td><td class="num">${fmt(h.weight)}</td><td class="num">${fmt(h.hr, 0)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">None yet</td></tr>'}</tbody>
        </table></div></div>
        <div><h4>Recent workouts</h4><div class="history table-wrap"><table>
          <thead><tr><th>Date</th><th>Workout</th><th class="num">Min</th><th>Notes</th></tr></thead>
          <tbody>${workouts.map(([d, w]) => `<tr><td>${prettyDate(d, { weekday: 'short', month: 'short', day: 'numeric' })}</td><td>${esc(w.type || '')}</td><td class="num">${w.minutes ?? ''}</td><td>${esc(w.notes || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">None yet</td></tr>'}</tbody>
        </table></div></div>
      </div>`;
    $('#detailDialog').showModal();
  }

  // ---------- Add / edit person ----------
  let editingId = null;
  function openProfileForm(pid = null) {
    editingId = pid;
    const f = $('#profileForm');
    f.reset();
    const p = pid && getPerson(pid);
    $('#profileDialogTitle').textContent = p ? `Edit ${p.name}` : 'Add Person';
    // Starting weight/HR only make sense when creating someone new.
    f.weight.closest('label').hidden = !!p;
    f.hr.closest('label').hidden = !!p;
    if (p) { f.name.value = p.name; f.birthday.value = p.birthday; f.notes.value = p.notes || ''; }
    $('#profileDialog').showModal();
    f.name.focus();
  }

  // ------------------------------------------------------------------
  // 5. IMPORT / EXPORT
  // ------------------------------------------------------------------
  /** Minimal CSV parser (handles quotes, commas, tabs-from-paste). */
  function parseCSV(text) {
    const delim = text.includes('\t') && !text.includes(',') ? '\t' : ',';
    const rows = []; let row = [], cell = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') inQ = false;
        else cell += c;
      } else if (c === '"') inQ = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.map(r => r.map(c => c.trim())).filter(r => r.some(Boolean));
  }

  function toCSV(rows) {
    return rows.map(r => r.map(v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
  }

  function download(filename, content, type = 'text/csv') {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importProfilesCSV(text) {
    const rows = parseCSV(text);
    if (!rows.length) return toast('That file looks empty.');
    const header = rows[0].map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
    const hasHeader = header.includes('name');
    const col = name => {
      const aliases = { name: ['name', 'fullname'], birthday: ['birthday', 'birthdate', 'dob', 'dateofbirth'],
        weight: ['weight', 'weightlb', 'weightkg'], hr: ['heartrate', 'hr', 'restinghr', 'restingheartrate', 'bpm'],
        first: ['first', 'firstname'], last: ['last', 'lastname'] };
      return hasHeader ? header.findIndex(h => aliases[name].includes(h)) : { name: 0, birthday: 1, weight: 2, hr: 3 }[name] ?? -1;
    };
    const ci = { name: col('name'), first: col('first'), last: col('last'), birthday: col('birthday'), weight: col('weight'), hr: col('hr') };
    const week = mondayOf(todayISO());
    let added = 0, skipped = 0;
    rows.slice(hasHeader ? 1 : 0).forEach(r => {
      const name = ci.name >= 0 ? r[ci.name] : [r[ci.first], r[ci.last]].filter(Boolean).join(' ');
      const p = addPerson({ name, birthday: ci.birthday >= 0 ? r[ci.birthday] : '' });
      if (!p) { skipped++; return; }
      added++;
      if (ci.weight >= 0 && r[ci.weight]) setWeekly(p.id, week, 'weight', parseFloat(r[ci.weight]));
      if (ci.hr >= 0 && r[ci.hr]) setWeekly(p.id, week, 'hr', parseFloat(r[ci.hr]));
    });
    save();
    toast(`✅ Added ${added} people${skipped ? ` (skipped ${skipped} blank or duplicate rows)` : ''}.`);
    render();
  }

  function exportProfilesCSV() {
    const rows = [['name', 'birthday', 'age', `median_heart_rate_bpm`, `latest_weight_${unit()}`, `weight_change_${unit()}`, 'check_ins', 'workouts_logged', 'notes']];
    sortedPeople().forEach(p => {
      const s = stats(p.id);
      rows.push([p.name, p.birthday, ageFrom(p.birthday) ?? '', s.medianHR ?? '', s.latestWeight ?? '', s.weightChange ?? '',
        s.checkIns, Object.keys(db.workouts[p.id] || {}).length, p.notes || '']);
    });
    download(`profiles-${todayISO()}.csv`, toCSV(rows));
  }

  function exportWeeklyCSV() {
    const rows = [['name', 'birthday', 'week_of_monday', `weight_${unit()}`, 'resting_heart_rate_bpm']];
    sortedPeople().forEach(p => weeklyHistory(p.id).forEach(h => rows.push([p.name, p.birthday, h.week, h.weight ?? '', h.hr ?? ''])));
    download(`weekly-checkins-${todayISO()}.csv`, toCSV(rows));
  }

  function exportWorkoutsCSV() {
    const rows = [['name', 'date', 'day', 'workout', 'minutes', 'notes']];
    sortedPeople().forEach(p => Object.entries(db.workouts[p.id] || {}).sort().forEach(([d, w]) =>
      rows.push([p.name, d, fromISO(d).toLocaleDateString('en-US', { weekday: 'long' }), w.type || '', w.minutes ?? '', w.notes || ''])));
    download(`workouts-${todayISO()}.csv`, toCSV(rows));
  }

  function loadSampleData() {
    const first = ['Ava', 'Liam', 'Noah', 'Emma', 'Olivia', 'Mason', 'Sophia', 'Ethan', 'Mia', 'Lucas', 'Isabella', 'Logan', 'Amelia', 'Elijah', 'Harper', 'Aiden', 'Ella', 'Jackson', 'Aria', 'Mateo', 'Zoe', 'Leo', 'Nora', 'Kai'];
    const last = ['Smith', 'Johnson', 'Lee', 'Garcia', 'Brown', 'Davis', 'Martinez', 'Wilson', 'Patel', 'Nguyen', 'Kim', 'Clark', 'Lopez', 'Young', 'Hall', 'Rivera', 'King', 'Wright', 'Scott', 'Green'];
    const types = ['Treadmill', 'Bike', 'Rowing', 'Weights – Upper', 'Weights – Lower', 'Circuit', 'Stretching / Yoga', 'HIIT'];
    const rand = (a, b) => a + Math.random() * (b - a);
    const thisWeek = mondayOf(todayISO());
    for (let i = 0; i < 120; i++) {
      const name = `${first[i % first.length]} ${last[(i * 7) % last.length]}${i >= first.length * 5 ? ' ' + (i + 1) : ''}`;
      const bday = toISO(new Date(2007 + Math.floor(rand(0, 5)), Math.floor(rand(0, 12)), Math.floor(rand(1, 28))));
      const p = addPerson({ name, birthday: bday });
      if (!p) continue;
      let weight = rand(100, 200), hr = rand(58, 82);
      for (let w = 7; w >= 0; w--) {
        const week = addDays(thisWeek, -7 * w);
        weight += rand(-1.5, 1); hr += rand(-1.5, 1);
        setWeekly(p.id, week, 'weight', +weight.toFixed(1));
        setWeekly(p.id, week, 'hr', Math.round(hr));
        for (let d = 0; d < 5; d++) {
          const date = addDays(week, d);
          if (date > todayISO() || Math.random() < 0.2) continue;
          setWorkout(p.id, date, 'type', types[Math.floor(rand(0, types.length))]);
          setWorkout(p.id, date, 'minutes', 5 * Math.round(rand(4, 12)));
        }
      }
    }
    save();
  }

  // ------------------------------------------------------------------
  // 6. EVENT WIRING
  // ------------------------------------------------------------------
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); });

  // Delegated clicks for things rendered dynamically.
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-goto],[data-view],[data-edit],[data-delete],[data-week],[data-day]');
    if (!t) return;
    if (t.dataset.goto) { $('#detailDialog').open && $('#detailDialog').close(); showTab(t.dataset.goto); }
    else if (t.dataset.view) openDetail(t.dataset.view);
    else if (t.dataset.edit) openProfileForm(t.dataset.edit);
    else if (t.dataset.delete) {
      const p = getPerson(t.dataset.delete);
      if (p && confirm(`Delete ${p.name} and ALL of their records? This cannot be undone.`)) {
        removePerson(p.id); save(); render(); toast(`Deleted ${p.name}.`);
      }
    } else if (t.dataset.week !== undefined) {
      const n = Number(t.dataset.week);
      ui.week = n === 0 ? mondayOf(todayISO()) : addDays(ui.week, 7 * n);
      render();
    } else if (t.dataset.day !== undefined) { ui.dayIndex = Number(t.dataset.day); render(); }
  });

  // Search / sort filters re-render instantly.
  ['#profileSearch', '#profileSort'].forEach(s => $(s).addEventListener('input', renderProfiles));
  $('#weeklySearch').addEventListener('input', renderWeekly);
  $('#workoutSearch').addEventListener('input', renderWorkouts);
  $('#weekOverview').addEventListener('change', renderWorkouts);

  // Save weekly inputs. Only the edited row's info cells are updated,
  // so the user's cursor never jumps.
  $('#weeklyTable').addEventListener('change', e => {
    const input = e.target.closest('input[data-field]');
    if (!input) return;
    const tr = input.closest('tr');
    const pid = tr.dataset.pid;
    const field = input.dataset.field;
    const val = input.value === '' ? '' : parseFloat(input.value);
    if (field === 'hr' && val !== '' && (val < 20 || val > 250)) { toast('Heart rate should be between 20 and 250 bpm.'); return; }
    setWeekly(pid, ui.week, field, val);
    const r = getWeekly(pid, ui.week);
    const prevW = previousValue(pid, ui.week, 'weight');
    tr.querySelector('.diff').innerHTML = diffHTML(r.weight != null && prevW != null ? +(r.weight - prevW).toFixed(1) : null);
    tr.querySelector('.median').textContent = fmt(stats(pid).medianHR, 0);
    tr.querySelector('.status').innerHTML = Object.keys(r).length ? '<span class="done">✔</span>' : '';
    flash(input);
  });

  // Save workout inputs.
  $('#workoutTable').addEventListener('change', e => {
    const input = e.target.closest('input[data-wfield]');
    if (!input) return;
    const tr = input.closest('tr');
    const date = addDays(ui.week, ui.dayIndex);
    const f = input.dataset.wfield;
    setWorkout(tr.dataset.pid, date, f, f === 'minutes' && input.value !== '' ? parseFloat(input.value) : input.value);
    tr.querySelector('.status').innerHTML = Object.keys(getWorkout(tr.dataset.pid, date)).length ? '<span class="done">✔</span>' : '';
    flash(input);
  });

  function flash(el) {
    el.classList.remove('saved-flash');
    void el.offsetWidth; // restart the animation
    el.classList.add('saved-flash');
  }

  // Enter = move down to same column, Shift+Enter = move up.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const input = e.target.closest('.tab input[data-row]');
    if (!input) return;
    e.preventDefault();
    const next = Number(input.dataset.row) + (e.shiftKey ? -1 : 1);
    const col = input.dataset.col;
    const target = document.querySelector(`.tab.active input[data-row="${next}"][data-col="${col}"]`);
    if (target) { target.focus(); target.select && target.select(); } else input.blur(); // blur saves the last row
  });

  // Quick fill workouts for everyone currently shown.
  $('#fillBtn').addEventListener('click', () => {
    const type = $('#fillType').value.trim();
    const minutes = $('#fillMinutes').value;
    if (!type && !minutes) return toast('Type a workout and/or minutes first.');
    const date = addDays(ui.week, ui.dayIndex);
    const people = sortedPeople().filter(p => matches(p, $('#workoutSearch').value));
    if (!confirm(`Set ${type || ''}${type && minutes ? ', ' : ''}${minutes ? minutes + ' min' : ''} for ${people.length} people on ${DAY_NAMES[ui.dayIndex]}? (Existing entries for that day will be updated.)`)) return;
    people.forEach(p => {
      if (type) setWorkout(p.id, date, 'type', type);
      if (minutes) setWorkout(p.id, date, 'minutes', parseFloat(minutes));
    });
    $('#weekOverview').checked = false;
    renderWorkouts();
    toast(`✅ Filled ${people.length} workouts. You can still change any row individually.`);
  });

  // Profile add/edit form.
  $('#addProfileBtn').addEventListener('click', () => openProfileForm());
  $('#profileDialog').addEventListener('close', () => {
    if ($('#profileDialog').returnValue !== 'save') return;
    const f = $('#profileForm');
    const name = f.name.value.trim();
    if (!name) return;
    if (editingId) {
      const p = getPerson(editingId);
      p.name = name; p.birthday = normalizeDate(f.birthday.value); p.notes = f.notes.value.trim();
      toast(`Saved changes for ${name}.`);
    } else {
      const p = addPerson({ name, birthday: f.birthday.value, notes: f.notes.value });
      if (!p) { toast('That person already exists.'); return; }
      const week = mondayOf(todayISO());
      if (f.weight.value) setWeekly(p.id, week, 'weight', parseFloat(f.weight.value));
      if (f.hr.value) setWeekly(p.id, week, 'hr', parseFloat(f.hr.value));
      toast(`✅ Added ${name}.`);
    }
    save(); render();
  });

  // Bulk add.
  $('#bulkAddBtn').addEventListener('click', () => { $('#bulkForm').reset(); $('#bulkDialog').showModal(); });
  $('#bulkDialog').addEventListener('close', () => {
    if ($('#bulkDialog').returnValue !== 'save') return;
    const text = $('#bulkForm').list.value;
    let added = 0, skipped = 0;
    parseCSV(text).forEach(([name, birthday]) => { addPerson({ name, birthday }) ? added++ : skipped++; });
    save(); render();
    toast(`✅ Added ${added} people${skipped ? ` (skipped ${skipped} duplicates/blank)` : ''}.`);
  });

  $('#detailClose').addEventListener('click', () => $('#detailDialog').close());

  // Import / export buttons.
  $('#csvFile').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    file.text().then(importProfilesCSV); e.target.value = '';
  });
  $('#templateBtn').addEventListener('click', () => download('fitness-room-template.csv', 'name,birthday,weight,heartrate\n'));
  $('#exportJsonBtn').addEventListener('click', () => download(`fitness-room-backup-${todayISO()}.json`, JSON.stringify(db, null, 2), 'application/json'));
  $('#importJson').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    file.text().then(txt => {
      try {
        const data = JSON.parse(txt);
        if (!Array.isArray(data.people)) throw new Error('bad file');
        if (!confirm(`Replace current data with backup containing ${data.people.length} people?`)) return;
        db = Object.assign(emptyData(), data); save(); render();
        toast('✅ Backup restored.');
      } catch { toast('⚠️ That is not a valid backup file.'); }
    });
    e.target.value = '';
  });
  $('#exportProfilesCsv').addEventListener('click', exportProfilesCSV);
  $('#exportWeeklyCsv').addEventListener('click', exportWeeklyCSV);
  $('#exportWorkoutsCsv').addEventListener('click', exportWorkoutsCSV);
  $('#unitSelect').addEventListener('change', e => { db.settings.unit = e.target.value; save(); toast(`Weight unit set to ${e.target.value}. (Existing numbers are not converted.)`); });
  $('#sampleBtn').addEventListener('click', () => {
    if (!confirm('Add 120 sample people with 8 weeks of made-up data? (You can erase it later.)')) return;
    loadSampleData(); toast('✅ Sample data loaded.'); showTab('dashboard');
  });
  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('Erase ALL people and records? Download a backup first if you might need it.')) return;
    if (prompt('Type ERASE to confirm') !== 'ERASE') return;
    db = emptyData(); save(); render(); toast('All data erased.');
  });

  // Go!
  render();
})();
