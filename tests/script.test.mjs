// Tester för Google-skriptet som kassan visar (driveScriptText). Kör från kassa/: node --test tests/*.test.mjs
// Skriptet körs i en vm-kontext med ett litet låtsas-Google: kalender, egenskaper, Drive och e-post.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = /function driveScriptText\(\) \{\r?\n  return `([\s\S]*?)`;\r?\n\}/.exec(html);
const scriptText = (key) => new Function('state', 'return `' + m[1] + '`;')({ settings: { driveKey: key } });

// Datum tolkas som svensk tid oavsett datorns tidszon, så att testerna blir lika överallt.
function parseDate(text, tz, fmt) {
  assert.equal(fmt, 'yyyy-MM-dd HH:mm');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) throw new Error('Ogiltigt datum: ' + text);   // som Utilities.parseDate
  const [d, t] = text.split(' '); const [y, mo, da] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number);
  const offset = tz === 'Europe/Stockholm' ? (mo >= 4 && mo <= 10 ? 2 : 1) : 0;   // räcker för testdatumen
  return new Date(Date.UTC(y, mo - 1, da, h - offset, mi));
}

function google(key = 'k') {
  let seq = 0;
  class Ev {
    constructor(cal, title, start, end, opt, allDay) { this.cal = cal; this.id = `ev${++seq}@google.com`; this.title = title; this.start = start; this.end = end; this.description = opt.description; this.location = opt.location; this.allDay = allDay; this.deleted = false; this.reminders = []; }
    getId() { return this.id; } isAllDayEvent() { return this.allDay; }
    check() { if (this.deleted) throw new Error('Händelsen är borttagen'); }
    setTitle(t) { this.check(); this.title = t; } setDescription(t) { this.check(); this.description = t; } setLocation(t) { this.check(); this.location = t; }
    setTime(s, e) { this.check(); this.start = s; this.end = e; } setAllDayDate(d) { this.check(); this.start = d; this.end = null; }
    deleteEvent() { this.check(); this.deleted = true; }
    removeAllReminders() { this.check(); this.reminders = []; } addPopupReminder(min) { this.check(); this.reminders.push(min); }
  }
  class Cal {
    constructor(name, id) { this.name = name; this.id = id; this.events = []; }
    getName() { return this.name; } getId() { return this.id; } getTimeZone() { return 'Europe/Stockholm'; }
    getEventById(id) { return this.events.find((e) => e.id === id) || null; }
    createEvent(t, s, e, o) { const ev = new Ev(this, t, s, e, o, false); this.events.push(ev); return ev; }
    createAllDayEvent(t, d, o) { const ev = new Ev(this, t, d, null, o, true); this.events.push(ev); return ev; }
    live() { return this.events.filter((e) => !e.deleted); }
  }
  const cals = []; const props = new Map(); const mails = [];
  const Iter = (a) => ({ hasNext: () => a.length > 0, next: () => a.shift() });
  const folder = (name) => ({ name, getFilesByName: () => Iter([]), createFile: () => ({}), getFoldersByName: () => Iter([]), createFolder: folder });
  const env = {
    CalendarApp: { getCalendarsByName: (n) => cals.filter((c) => c.name === n), createCalendar: (n) => { const c = new Cal(n, `cal${cals.length + 1}@group.calendar.google.com`); cals.push(c); return c; } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => { props.set(k, String(v)); }, deleteProperty: (k) => { props.delete(k); } }) },
    Utilities: { parseDate, formatDate: () => '2026-11-01' },
    Session: { getScriptTimeZone: () => 'America/New_York' },
    MailApp: { sendEmail: (o) => mails.push(o), getRemainingDailyQuota: () => 100 },
    DriveApp: { getFoldersByName: () => Iter([]), createFolder: folder },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType: () => JSON.parse(s) }) }
  };
  const fns = vm.runInNewContext(scriptText(key) + '\n;({ doPost, doGet, godkann })', env);
  return {
    cals, props, mails, fns,
    post: (data) => fns.doPost({ postData: { contents: JSON.stringify({ key, ...data }) } }),
    get: (parameter) => fns.doGet({ parameter: { key, ...parameter } })
  };
}
const ev = (over = {}) => ({ id: 'o1', titel: 'B7 Ada Exempel, hämtning', datum: '2026-11-14', tid: '10:30', minuter: 30, beskrivning: '2 × Kaffe', plats: '', ...over });

test('skriptet hittas och är version 5 med kalender och påminnelse', () => {
  assert.ok(m, 'driveScriptText hittades inte');
  const s = scriptText('abc');
  assert.match(s, /version 5/);
  assert.match(s, /const NYCKEL = 'abc';/);
  assert.match(s, /const KALENDER = "lil'bakery beställningar";/);
  assert.doesNotMatch(s, /`|\$\{/);
  const g = google('abc');
  assert.deepEqual(g.get({ action: 'ping' }), { ok: true, mail: true, version: 5, faktura: true, kalender: true, paminnelse: true });
  assert.equal(g.fns.doPost({ postData: { contents: JSON.stringify({ key: 'fel', action: 'kalender', handelser: [ev()] }) } }).error, 'Fel nyckel');
  assert.equal(g.cals.length, 0);
});

test('kalender: skapar egen kalender och en händelse med rätt tid', () => {
  const g = google();
  const r = g.post({ action: 'kalender', handelser: [ev()] });
  assert.deepEqual(r, { ok: true, klara: ['o1'], fel: [], kalender: "lil'bakery beställningar" });
  assert.equal(g.cals.length, 1);
  const [e] = g.cals[0].live();
  assert.equal(e.title, 'B7 Ada Exempel, hämtning');
  assert.equal(e.start.toISOString(), '2026-11-14T09:30:00.000Z');   // 10:30 svensk vintertid
  assert.equal(e.end.toISOString(), '2026-11-14T10:00:00.000Z');
  assert.equal(e.description, '2 × Kaffe');
  assert.equal(e.allDay, false);
  // Samma namn igen: ingen ny kalender. Eget namn: ny kalender.
  g.post({ action: 'kalender', kalender: "lil'bakery beställningar", handelser: [ev({ id: 'o2' })] });
  assert.equal(g.cals.length, 1);
  g.post({ action: 'kalender', kalender: '  Tårtor  ', handelser: [ev({ id: 'o3' })] });
  assert.deepEqual(g.cals.map((c) => c.name), ["lil'bakery beställningar", 'Tårtor']);
});

test('kalender: ändring uppdaterar samma händelse, byte heldag/tid skapar om den', () => {
  const g = google();
  g.post({ action: 'kalender', handelser: [ev()] });
  const first = g.cals[0].live()[0];
  g.post({ action: 'kalender', handelser: [ev({ titel: '✓ B7 Ada Exempel, hämtning', tid: '11:00', plats: 'Storgatan 1' })] });
  assert.equal(g.cals[0].live().length, 1);
  assert.equal(g.cals[0].live()[0], first);
  assert.equal(first.title, '✓ B7 Ada Exempel, hämtning');
  assert.equal(first.location, 'Storgatan 1');
  assert.equal(first.start.toISOString(), '2026-11-14T10:00:00.000Z');
  // Tiden tas bort: händelsen blir heldag, räknad från klockan tolv så att dagen blir rätt.
  g.post({ action: 'kalender', handelser: [ev({ tid: '' })] });
  const live = g.cals[0].live();
  assert.equal(live.length, 1); assert.notEqual(live[0], first);
  assert.equal(live[0].allDay, true);
  assert.equal(live[0].start.toISOString(), '2026-11-14T11:00:00.000Z');
  // Och tillbaka till en tid.
  g.post({ action: 'kalender', handelser: [ev({ tid: '09:00' })] });
  assert.equal(g.cals[0].live().length, 1); assert.equal(g.cals[0].live()[0].allDay, false);
  // Datum flyttas till sommartid.
  g.post({ action: 'kalender', handelser: [ev({ datum: '2026-06-01', tid: '09:00' })] });
  assert.equal(g.cals[0].live()[0].start.toISOString(), '2026-06-01T07:00:00.000Z');
});

test('kalender: borttagning, okända id:n och händelser som tagits bort i kalendern', () => {
  const g = google();
  g.post({ action: 'kalender', handelser: [ev(), ev({ id: 'o2' })] });
  const r = g.post({ action: 'kalender', bort: ['o1', 'finns-inte'] });
  assert.deepEqual(r.klara, ['o1', 'finns-inte']);
  assert.deepEqual(g.cals[0].live().map((e) => e.title), ['B7 Ada Exempel, hämtning']);
  assert.equal([...g.props.keys()].filter((k) => k.endsWith('|o1')).length, 0);
  // Någon har tagit bort händelsen direkt i Google Kalender: nästa ändring skapar en ny.
  g.cals[0].live()[0].deleted = true;
  const r2 = g.post({ action: 'kalender', handelser: [ev({ id: 'o2', titel: 'Ny titel' })] });
  assert.deepEqual(r2.fel, []);
  assert.deepEqual(g.cals[0].live().map((e) => e.title), ['Ny titel']);
});

test('kalender: en trasig händelse stoppar inte de andra', () => {
  const g = google();
  const r = g.post({ action: 'kalender', handelser: [ev({ id: 'ok1' }), { id: 'bad', titel: 'x', datum: null, tid: '' }, ev({ id: 'ok2' })] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.klara, ['ok1', 'ok2']);
  assert.deepEqual(r.fel.map((f) => f.id), ['bad']);
  assert.equal(g.cals[0].live().length, 2);
});

test('kalender: händelser i olika kalendrar hålls isär', () => {
  const g = google();
  g.post({ action: 'kalender', handelser: [ev()] });
  g.post({ action: 'kalender', kalender: 'Annan', handelser: [ev()] });
  assert.equal(g.cals[0].live().length, 1);
  assert.equal(g.cals[1].live().length, 1);   // ny händelse i den nya kalendern, den gamla rörs inte
});

test('kalender: påminnelse kl. 14 tre dagar före, för tid och heldag', () => {
  const g = google();
  // 14 nov 10:30, påminnelse 11 nov 14:00: 2 dygn och 20,5 timmar före.
  g.post({ action: 'kalender', handelser: [ev({ paminnelse: '2026-11-11 14:00' })] });
  const e = g.cals[0].live()[0];
  assert.deepEqual(e.reminders, [(2 * 24 + 20.5) * 60]);
  // Heldag räknas från midnatt: 2 dygn och 10 timmar. Ny händelse eftersom heldag skapas om.
  g.post({ action: 'kalender', handelser: [ev({ tid: '', paminnelse: '2026-11-11 14:00' })] });
  assert.deepEqual(g.cals[0].live()[0].reminders, [3480]);
  // Uppdatering ersätter, null tar bort, utan fältet rörs inget.
  g.post({ action: 'kalender', handelser: [ev({ tid: '', paminnelse: '2026-11-12 14:00' })] });
  assert.deepEqual(g.cals[0].live()[0].reminders, [3480 - 1440]);
  g.post({ action: 'kalender', handelser: [ev({ tid: '', titel: 'Ny' })] });
  assert.deepEqual(g.cals[0].live()[0].reminders, [3480 - 1440]);
  g.post({ action: 'kalender', handelser: [ev({ tid: '', paminnelse: null })] });
  assert.deepEqual(g.cals[0].live()[0].reminders, []);
  // Påminnelse efter starten eller mer än fyra veckor före läggs inte in.
  g.post({ action: 'kalender', handelser: [ev({ id: 'o3', paminnelse: '2026-11-14 11:00' }), ev({ id: 'o4', paminnelse: '2026-10-01 14:00' })] });
  assert.deepEqual(g.cals[0].live().slice(-2).map((x) => x.reminders), [[], []]);
});

test('godkann rör Drive, e-post och kalender så att Google frågar om lov', () => {
  const g = google();
  g.fns.godkann();
  assert.deepEqual(g.cals.map((c) => c.name), ["lil'bakery beställningar"]);
});
