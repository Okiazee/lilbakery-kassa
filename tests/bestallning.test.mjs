// Tester för bestallning.js. Kör från kassa/: node --test tests/
process.env.TZ = 'Europe/Stockholm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const O = require('../bestallning.js');

// Samma form som förbeställningarna i en riktig kopia från version 1.7 (påhittade personer).
const oldPreorders = () => [
  { id: 'p1', nr: 1, created: '2026-10-03T18:00:00.000Z', status: 'paid', name: 'Ada Exempel', phone: '070-000 00 01', pickupDate: '2026-10-04', pickupTime: '', note: '', lines: [{ productId: 'x', name: 'Crème brûlée', price: 35, vat: 6, qty: 2 }], discount: null, paidAt: '2026-10-04T10:12:00.000Z', receiptId: 'r9', receiptNr: 9 },
  { id: 'p2', nr: 2, created: '2026-10-03T19:00:00.000Z', status: 'open', name: 'Bo Prov', phone: '', pickupDate: '', pickupTime: '', note: 'Nötallergi', lines: [{ productId: 'y', name: 'Kaffe', price: 25, vat: 6, qty: 1 }], discount: { type: 'procent', value: 10, reason: '' } }
];
const order = (over = {}) => O.migrate(Object.assign({ id: 'o1', nr: 12, created: '2026-11-01T10:00:00.000Z', status: 'bekraftad', payment: 'obetald', name: 'Anna Testsson', phone: '', email: '', pickupDate: '2026-11-08', pickupTime: '14:00', kind: 'hamtning', lines: [{ productId: null, name: 'Tårta, 20 bitar', price: 1200, vat: 6, qty: 1 }, { productId: 'p', name: 'Kaffe', price: 25, vat: 6, qty: 2 }], discount: null }, over));

test('migrate: gamla förbeställningar blir beställningar utan att något försvinner, och kan köras igen', () => {
  const [paid, open] = oldPreorders().map((o) => O.migrate(o));
  assert.equal(paid.status, 'utlamnad'); assert.equal(paid.payment, 'betald');
  assert.equal(paid.deliveredAt, '2026-10-04T10:12:00.000Z');
  assert.equal(paid.receiptId, 'r9'); assert.equal(paid.receiptNr, 9); assert.equal(paid.paidAt, '2026-10-04T10:12:00.000Z');
  assert.equal(open.status, 'bekraftad'); assert.equal(open.payment, 'obetald');
  assert.equal(open.note, 'Nötallergi'); assert.deepEqual(open.discount, { type: 'procent', value: 10, reason: '' });
  for (const o of [paid, open]) {
    assert.equal(o.kind, 'hamtning'); assert.deepEqual(o.history, []); assert.deepEqual(o.sent, []);
    assert.equal(o.email, ''); assert.equal(o.address, ''); assert.equal(o.internalNote, '');
  }
  const again = JSON.parse(JSON.stringify([paid, open])).map((o) => O.migrate(o));
  assert.deepEqual(again, [paid, open]);
});

test('status: öppna, betalning, bekräftelse och fakturerade', () => {
  const o = order();
  assert.equal(O.isOpen(o), true); assert.equal(O.canPay(o), true);
  assert.equal(O.canConfirm(o), false);   // redan bekräftad
  const ny = order({ status: 'ny', lines: [{ name: 'Tårta', price: null, vat: 6, qty: 1 }] });
  assert.equal(O.missingPrices(ny), 1); assert.equal(O.canConfirm(ny), false); assert.equal(O.canPay(ny), false);
  ny.lines[0].price = 500;
  assert.equal(O.canConfirm(ny), true);
  assert.equal(O.canPay(order({ payment: 'faktura' })), false);
  assert.equal(O.canDeliverInvoiced(order({ payment: 'faktura' })), true);
  assert.equal(O.canPay(order({ status: 'avbokad' })), false);
  assert.equal(O.canPay(order({ lines: [] })), false);
  O.log(o, 'Bekräftad', new Date('2026-11-01T09:00:00.000Z'));
  assert.deepEqual(o.history, [{ ts: '2026-11-01T09:00:00.000Z', text: 'Bekräftad' }]);
});

test('dagar på svenska: idag, imorgon, igår och veckodag', () => {
  assert.equal(O.dayLabel('2026-11-01', '2026-11-01'), 'Idag');
  assert.equal(O.dayLabel('2026-11-02', '2026-11-01'), 'Imorgon');
  assert.equal(O.dayLabel('2026-10-31', '2026-11-01'), 'Igår');
  assert.equal(O.dayLabel('2026-11-08', '2026-11-01'), 'Söndag 8 november');
  assert.equal(O.longDay('2026-11-07'), 'lördag 7 november');
  assert.equal(O.svTime('09:30'), '09.30');
  assert.equal(O.shift('2026-10-24', 2), '2026-10-26');   // över omställningen till vintertid
});

test('agenda: passerade öppna först, sedan per dag och tid, sist utan datum', () => {
  const list = [
    order({ id: 'a', pickupDate: '2026-11-08', pickupTime: '14:00' }),
    order({ id: 'b', pickupDate: '2026-11-08', pickupTime: '10:00' }),
    order({ id: 'c', pickupDate: '2026-10-30', pickupTime: '' }),
    order({ id: 'd', pickupDate: '', pickupTime: '' }),
    order({ id: 'e', pickupDate: '2026-11-01', pickupTime: '' }),
    order({ id: 'f', pickupDate: '2026-10-20', status: 'utlamnad', payment: 'betald' })
  ];
  const g = O.agenda(list, '2026-11-01');
  assert.deepEqual(g.map((x) => x.key), ['passerat', '2026-10-20', '2026-11-01', '2026-11-08', 'utan']);
  assert.deepEqual(g[0].orders.map((o) => o.id), ['c']);
  assert.deepEqual(g[3].orders.map((o) => o.id), ['b', 'a']);
  assert.equal(g[2].label, 'Idag');
  const desc = O.agenda(list.filter((o) => o.status === 'bekraftad' && o.pickupDate >= '2026-11-01'), '2026-11-01', { desc: true });
  assert.deepEqual(desc.map((x) => x.key), ['2026-11-08', '2026-11-01']);
  assert.deepEqual(desc[0].orders.map((o) => o.id), ['a', 'b']);
});

test('monthGrid: måndag först, tomma rutor, antal per dag utan avbokade', () => {
  const orders = [order({ pickupDate: '2026-11-08' }), order({ id: 'x', pickupDate: '2026-11-08', status: 'utlamnad', payment: 'betald' }), order({ id: 'y', pickupDate: '2026-11-08', status: 'avbokad' })];
  const g = O.monthGrid(2026, 11, orders);
  assert.equal(g.title, 'november 2026');
  assert.equal(g.weeks[0].filter((c) => c === null).length, 6);   // 1 november 2026 är en söndag
  assert.equal(g.weeks[0][6].day, '2026-11-01');
  const cell = g.weeks.flat().find((c) => c && c.day === '2026-11-08');
  assert.equal(cell.count, 2); assert.equal(cell.open, 1);
  assert.ok(g.weeks.every((w) => w.length === 7));
  assert.equal(g.weeks.flat().filter(Boolean).length, 30);
  assert.deepEqual(O.addMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(O.addMonth(2026, 1, -1), { year: 2025, month: 12 });
});

test('ics: CRLF, flytande tid, heldag utan tid, stabilt UID, escaping och radbrytning på 75 byte', () => {
  const now = new Date('2026-11-01T12:00:00.000Z');
  const desc = 'Rad ett; med, specialtecken\\ och åäö\nRad två ' + 'x'.repeat(120);
  const text = O.ics(order({ icsSeq: 2 }), { summary: 'B12 Anna Testsson, Hämtning', description: desc, location: 'Torshamnsgatan 27, Kista', now });
  assert.ok(text.endsWith('\r\n'));
  assert.ok(!/[^\r]\n/.test(text), 'alla radslut är CRLF');
  const lines = text.split('\r\n');
  assert.ok(lines.includes('DTSTART:20261108T140000'));
  assert.ok(lines.includes('DTEND:20261108T143000'));
  assert.ok(lines.includes('UID:o1@lilbakery-kassa'));
  assert.ok(lines.includes('SEQUENCE:2'));
  assert.ok(lines.includes('DTSTAMP:20261101T120000Z'));
  assert.ok(lines.includes('STATUS:CONFIRMED'));
  for (const l of lines) assert.ok(Buffer.byteLength(l, 'utf8') <= 75, `för lång rad: ${l}`);
  const unfolded = text.replace(/\r\n /g, '');
  assert.match(unfolded, /DESCRIPTION:Rad ett\\; med\\, specialtecken\\\\ och åäö\\nRad två x+/);
  assert.match(unfolded, /LOCATION:Torshamnsgatan 27\\, Kista/);
  const allDay = O.ics(order({ pickupTime: '', status: 'ny' }), { summary: 'X', now });
  assert.match(allDay, /DTSTART;VALUE=DATE:20261108\r\nDTEND;VALUE=DATE:20261109/);
  assert.match(allDay, /STATUS:TENTATIVE/);
  assert.equal(O.ics(order({ pickupDate: '' }), { summary: 'X' }), null);
  // Över sommartidens slut: 30 minuter efter 02:45 natten 25 oktober.
  assert.ok(O.ics(order({ pickupDate: '2026-10-24', pickupTime: '23:45' }), { summary: 'X', now }).includes('DTEND:20261025T001500'));
});

test('googleCalendarUrl: datum utan tidszon och kodade fält', () => {
  const u = new URL(O.googleCalendarUrl(order(), { summary: 'B12 Anna', description: 'Tårta', location: 'Kista' }));
  assert.equal(u.searchParams.get('dates'), '20261108T140000/20261108T143000');
  assert.equal(u.searchParams.get('text'), 'B12 Anna');
  assert.equal(u.searchParams.get('details'), 'Tårta');
  assert.equal(u.searchParams.get('action'), 'TEMPLATE');
  assert.equal(new URL(O.googleCalendarUrl(order({ pickupTime: '' }), { summary: 'X' })).searchParams.get('dates'), '20261108/20261109');
});

test('mallar: bekräftelse och påminnelse utan undefined och utan dubbla tomrader', () => {
  const fmt = (n) => `${n} kr`;
  const o = order({ note: 'Glutenfri', discount: { type: 'kr', value: 50, reason: 'Rabattkod FIKA25', codeId: 'k1' } });
  const vars = O.templateVars(o, { foretag: "lil'bakery", swish: '123 456 78 90', formatKr: fmt, total: 1200, discountAmount: 50 });
  assert.equal(vars.namn, 'Anna'); assert.equal(vars.nr, 'B12');
  assert.equal(vars.nar, 'söndag 8 november kl. 14.00');
  assert.equal(vars.plats, 'Hämtning');
  assert.equal(vars.artiklar, '1 × Tårta, 20 bitar: 1200 kr\n2 × Kaffe: 50 kr\nRabattkod FIKA25: -50 kr');
  assert.match(vars.betalning, /swisha till 123 456 78 90 och märka betalningen B12/);
  for (const key of Object.keys(O.TEMPLATE_LABELS)) {
    const text = O.render(O.DEFAULT_TEMPLATES[key], vars);
    assert.doesNotMatch(text, /undefined|null|\{[a-z]+\}/i);
    assert.doesNotMatch(text, /\n\n\n/);
    assert.match(text, /^Hej Anna!/);
  }
  const bare = O.templateVars(order({ pickupDate: '', pickupTime: '', kind: 'leverans', address: 'Storgatan 1', payment: 'faktura' }), { foretag: 'X', total: 10 });
  assert.equal(bare.nar, 'enligt överenskommelse'); assert.equal(bare.plats, 'Leverans till Storgatan 1');
  assert.equal(bare.betalning, 'Du får en faktura från oss.'); assert.equal(bare.onskemal, '');
  const text = O.render(O.DEFAULT_TEMPLATES.bekraftelse, bare);
  assert.doesNotMatch(text, /\n\n\n/);
  assert.equal(O.render('Hej {namn}, {okand}!', { namn: 'Bo' }), 'Hej Bo, {okand}!');
  assert.match(O.templateVars(order({ payment: 'betald' }), {}).betalning, /betald/);
  assert.match(O.templateVars(order(), {}).betalning, /^Du betalar med Swish eller kontant vid hämtningen\.$/);
});
