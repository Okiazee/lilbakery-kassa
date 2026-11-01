/* lil'bakery Kassa: beställningar.
   Rena funktioner utan DOM: status, flytt från gamla förbeställningar, agenda, månadskalender,
   kalenderfil (.ics), Google Kalender-länk och meddelandemallar.
   I webbläsaren: window.KassaOrder. I Node: require('./bestallning.js'). */
(function (root) {
  'use strict';

  const STATUS_LABELS = { ny: 'Ny', bekraftad: 'Bekräftad', utlamnad: 'Utlämnad', avbokad: 'Avbokad' };
  const PAYMENT_LABELS = { obetald: 'Obetald', betald: 'Betald', faktura: 'Faktureras' };
  const KIND_LABELS = { hamtning: 'Hämtning', leverans: 'Leverans' };
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  const isHm = (s) => /^\d{2}:\d{2}$/.test(String(s || ''));
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const shift = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };

  // ---------- Modell ----------
  // Gamla förbeställningar (status open/paid) får de nya fälten. Körs vid varje start; gör inget andra gången.
  function migrate(o) {
    if (!o.payment) {
      if (o.status === 'paid') { o.status = 'utlamnad'; o.payment = 'betald'; o.deliveredAt = o.deliveredAt || o.paidAt || null; }
      else { o.status = (!o.status || o.status === 'open') ? 'bekraftad' : o.status; o.payment = 'obetald'; }
    }
    if (!STATUS_LABELS[o.status]) o.status = 'bekraftad';
    if (!PAYMENT_LABELS[o.payment]) o.payment = 'obetald';
    o.name = o.name || ''; o.phone = o.phone || ''; o.email = o.email || '';
    o.pickupDate = o.pickupDate || ''; o.pickupTime = o.pickupTime || '';
    o.kind = KIND_LABELS[o.kind] ? o.kind : 'hamtning'; o.address = o.address || '';
    o.note = o.note || ''; o.internalNote = o.internalNote || '';
    o.lines = Array.isArray(o.lines) ? o.lines : []; o.discount = o.discount || null;
    o.history = Array.isArray(o.history) ? o.history : []; o.sent = Array.isArray(o.sent) ? o.sent : [];
    o.icsSeq = Number(o.icsSeq) || 0;
    return o;
  }

  const isOpen = (o) => o.status === 'ny' || o.status === 'bekraftad';
  const missingPrices = (o) => o.lines.filter((l) => l.price === null || l.price === undefined || l.price === '').length;
  // Kan tas betalt i kassan: öppen, obetald, har varor och alla har pris.
  const canPay = (o) => isOpen(o) && o.payment === 'obetald' && o.lines.length > 0 && !missingPrices(o);
  const canConfirm = (o) => o.status === 'ny' && o.lines.length > 0 && !missingPrices(o);
  // Fakturerade beställningar lämnas ut utan kvitto.
  const canDeliverInvoiced = (o) => isOpen(o) && o.payment === 'faktura' && o.lines.length > 0 && !missingPrices(o);
  function log(o, text, now = new Date()) { o.history.push({ ts: now.toISOString(), text }); return o; }

  // ---------- Datum ----------
  const longDay = (s) => new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseYmd(s));
  const shortDay = (s) => new Intl.DateTimeFormat('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }).format(parseYmd(s));
  const svTime = (hm) => (isHm(hm) ? hm.replace(':', '.') : '');
  function dayLabel(day, today) {
    if (day === today) return 'Idag';
    if (day === shift(today, 1)) return 'Imorgon';
    if (day === shift(today, -1)) return 'Igår';
    const label = longDay(day);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  const sortKey = (o) => (o.pickupDate || '9999-99-99') + ' ' + (o.pickupTime || '99:99') + ' ' + (o.created || '');

  // Grupper för listan: öppna med passerat datum först, sedan dag för dag, sist de utan datum.
  // desc = senaste först (för utlämnade och avbokade).
  function agenda(orders, today, { desc = false } = {}) {
    const groups = new Map();
    const sorted = orders.slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    if (desc) sorted.reverse();
    for (const o of sorted) {
      const key = !isYmd(o.pickupDate) ? 'utan' : (isOpen(o) && o.pickupDate < today ? 'passerat' : o.pickupDate);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    }
    const keys = [...groups.keys()].filter((k) => k !== 'passerat' && k !== 'utan');
    keys.sort(); if (desc) keys.reverse();
    const out = [];
    if (groups.has('passerat')) out.push({ key: 'passerat', label: 'Passerat datum', orders: groups.get('passerat') });
    for (const k of keys) out.push({ key: k, label: dayLabel(k, today), orders: groups.get(k) });
    if (groups.has('utan')) out.push({ key: 'utan', label: 'Utan datum', orders: groups.get('utan') });
    return out;
  }

  // Månadskalender med måndag först. month = 1–12. Tomma rutor före och efter månaden är null.
  function monthGrid(year, month, orders) {
    const first = new Date(year, month - 1, 1);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= days; d++) {
      const key = `${year}-${pad(month)}-${pad(d)}`;
      const list = orders.filter((o) => o.pickupDate === key && o.status !== 'avbokad');
      cells.push({ day: key, d, count: list.length, open: list.filter(isOpen).length });
    }
    while (cells.length % 7) cells.push(null);
    const weeks = []; for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    const title = new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric' }).format(first);
    return { year, month, title, weeks };
  }
  const addMonth = (year, month, n) => { const d = new Date(year, month - 1 + n, 1); return { year: d.getFullYear(), month: d.getMonth() + 1 }; };

  // ---------- Kalender ----------
  const icsEscape = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function utf8Len(ch) { const c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
  // Rader längre än 75 byte delas med CRLF + mellanslag, utan att dela ett tecken.
  function icsFold(line) {
    const parts = []; let cur = ''; let bytes = 0; let limit = 75;
    for (const ch of line) {
      const n = utf8Len(ch);
      if (bytes + n > limit) { parts.push(cur); cur = ''; bytes = 0; limit = 74; }
      cur += ch; bytes += n;
    }
    parts.push(cur);
    return parts.join('\r\n ');
  }
  const stamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  const compactDay = (s) => s.replace(/-/g, '');
  // Start och slut i lokal tid utan tidszon (flytande tid), eller hela dagen när tid saknas.
  function eventTimes(o, durationMin = 30) {
    if (!isYmd(o.pickupDate)) return null;
    if (!isHm(o.pickupTime)) return { allDay: true, start: compactDay(o.pickupDate), end: compactDay(shift(o.pickupDate, 1)) };
    const [h, m] = o.pickupTime.split(':').map(Number);
    const s = parseYmd(o.pickupDate); s.setHours(h, m, 0, 0);
    const e = new Date(s.getTime() + durationMin * 60000);
    const f = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    return { allDay: false, start: f(s), end: f(e) };
  }
  function ics(o, { summary, description = '', location = '', now = new Date(), durationMin = 30 } = {}) {
    const t = eventTimes(o, durationMin); if (!t) return null;
    const status = o.status === 'avbokad' ? 'CANCELLED' : o.status === 'ny' ? 'TENTATIVE' : 'CONFIRMED';
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', "PRODID:-//lil'bakery//Kassa//SV", 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', `UID:${o.id}@lilbakery-kassa`, `DTSTAMP:${stamp(now)}`, `SEQUENCE:${Number(o.icsSeq) || 0}`,
      t.allDay ? `DTSTART;VALUE=DATE:${t.start}` : `DTSTART:${t.start}`,
      t.allDay ? `DTEND;VALUE=DATE:${t.end}` : `DTEND:${t.end}`,
      `SUMMARY:${icsEscape(summary)}`
    ];
    if (location) lines.push(`LOCATION:${icsEscape(location)}`);
    if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
    lines.push(`STATUS:${status}`, 'END:VEVENT', 'END:VCALENDAR');
    return lines.map(icsFold).join('\r\n') + '\r\n';
  }
  function googleCalendarUrl(o, { summary, description = '', location = '', durationMin = 30 } = {}) {
    const t = eventTimes(o, durationMin); if (!t) return null;
    const q = new URLSearchParams({ action: 'TEMPLATE', text: summary, dates: `${t.start}/${t.end}`, details: description });
    if (location) q.set('location', location);
    return 'https://calendar.google.com/calendar/render?' + q.toString();
  }

  // ---------- Meddelanden ----------
  const TEMPLATE_LABELS = { bekraftelse: 'Bekräftelse', paminnelse: 'Påminnelse' };
  const DEFAULT_TEMPLATES = {
    bekraftelse: 'Hej {namn}!\n\nTack för din beställning hos {foretag}. Här är din bekräftelse.\n\nBeställning {nr}\n{artiklar}\nAtt betala: {summa}\n\n{plats}: {nar}\n{onskemal}\n\n{betalning}\n\nHör av dig om något behöver ändras.\nVarma hälsningar\n{foretag}',
    paminnelse: 'Hej {namn}!\n\nEn påminnelse om din beställning {nr} hos {foretag}.\n\n{plats}: {nar}\n\n{artiklar}\nAtt betala: {summa}\n{betalning}\n\nVälkommen!\n{foretag}'
  };
  const PLACEHOLDERS = {
    namn: 'kundens förnamn', fullnamn: 'kundens hela namn', nr: 'beställningens nummer, t.ex. B12', datum: 'dagen, t.ex. lördag 8 november',
    tid: 'tiden, t.ex. 14.00', nar: 'dag och tid tillsammans', plats: 'Hämtning eller Leverans till adressen', artiklar: 'en rad per vara med pris',
    summa: 'att betala', betalning: 'hur och när kunden betalar', onskemal: 'kundens önskemål eller allergier', foretag: 'företagets namn'
  };
  // ctx: { foretag, swish, formatKr(n), total, discountAmount }
  function templateVars(o, ctx = {}) {
    const fmt = ctx.formatKr || ((n) => `${n} kr`);
    const nr = `B${o.nr}`;
    const datum = isYmd(o.pickupDate) ? longDay(o.pickupDate) : '';
    const tid = svTime(o.pickupTime);
    const nar = datum ? (tid ? `${datum} kl. ${tid}` : datum) : (tid ? `kl. ${tid}` : 'enligt överenskommelse');
    const plats = o.kind === 'leverans' ? (o.address ? `Leverans till ${o.address}` : 'Leverans') : 'Hämtning';
    const rows = o.lines.map((l) => `${l.qty} × ${l.name}${l.price === null || l.price === undefined || l.price === '' ? '' : `: ${fmt(l.price * l.qty)}`}`);
    if (o.discount && ctx.discountAmount) rows.push(`${o.discount.reason || 'Rabatt'}: -${fmt(ctx.discountAmount)}`);
    const when = o.kind === 'leverans' ? 'leveransen' : 'hämtningen';
    let betalning;
    if (o.payment === 'betald') betalning = 'Beställningen är betald. Tack!';
    else if (o.payment === 'faktura') betalning = 'Du får en faktura från oss.';
    else betalning = `Du betalar med Swish eller kontant vid ${when}.` + (ctx.swish ? ` Vill du betala i förväg går det bra att swisha till ${ctx.swish} och märka betalningen ${nr}.` : '');
    return {
      namn: String(o.name || '').trim().split(/\s+/)[0] || '', fullnamn: String(o.name || '').trim(), nr, datum, tid, nar, plats,
      artiklar: rows.join('\n'), summa: ctx.total === undefined ? '' : fmt(ctx.total), betalning,
      onskemal: o.note ? `Önskemål: ${o.note}` : '', foretag: ctx.foretag || ''
    };
  }
  // Okända {platshållare} lämnas kvar så att ett stavfel syns. Tomma rader efter tomma fält slås ihop.
  function render(template, vars) {
    const text = String(template || '').replace(/\{([a-zåäö]+)\}/gi, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k.toLowerCase()) ? vars[k.toLowerCase()] : m));
    return text.split('\n').map((l) => l.replace(/[ \t]+$/g, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  const api = {
    STATUS_LABELS, PAYMENT_LABELS, KIND_LABELS, TEMPLATE_LABELS, DEFAULT_TEMPLATES, PLACEHOLDERS,
    migrate, isOpen, missingPrices, canPay, canConfirm, canDeliverInvoiced, log,
    longDay, shortDay, svTime, dayLabel, sortKey, agenda, monthGrid, addMonth, shift,
    icsEscape, icsFold, eventTimes, ics, googleCalendarUrl, templateVars, render
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KassaOrder = api;
})(typeof self !== 'undefined' ? self : this);
