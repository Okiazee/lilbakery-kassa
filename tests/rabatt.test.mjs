// Tester för rabatt.js. Kör från kassa/: node --test tests/
process.env.TZ = 'Europe/Stockholm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const R = require('../rabatt.js');

const code = (over = {}) => Object.assign({ id: 'k1', code: 'FIKA25', label: 'Höstkampanj', type: 'procent', value: 25, validFrom: '', validTo: '', maxUses: null, active: true, created: '2026-10-01T10:00:00.000Z' }, over);
const receipt = (over = {}) => Object.assign({ id: 'r1', nr: 1, ts: '2026-10-04T10:00:00.000Z', status: 'ok', discount: { type: 'procent', value: 25, amount: 20, reason: 'Rabattkod FIKA25', codeId: 'k1', code: 'FIKA25' } }, over);
const order = (over = {}) => Object.assign({ id: 'o1', nr: 3, status: 'bekraftad', payment: 'obetald', lines: [{ name: 'Tårta', price: 400, vat: 6, qty: 1 }], discount: { type: 'procent', value: 25, reason: 'Rabattkod FIKA25', codeId: 'k1', code: 'FIKA25' }, created: '2026-10-05T10:00:00.000Z' }, over);

test('generate: prefix, längd, bara tecken som inte förväxlas, unik mot befintliga', () => {
  let i = 0; const seq = [0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5];
  const rand = () => seq[i++ % seq.length];
  const first = R.generate({ prefix: 'lil', length: 5, rand });
  assert.equal(first, 'LIL-AAAAA');
  const second = R.generate({ prefix: 'LIL', length: 5, existing: [{ code: 'lil aaaaa' }], rand: (() => { let j = 0; return () => seq[j++ % seq.length]; })() });
  assert.notEqual(R.normalize(second), R.normalize('LIL-AAAAA'));
  for (let k = 0; k < 200; k++) {
    const c = R.generate({ length: 6 });
    assert.match(c, /^LIL-[A-Z2-9]{6}$/);
    assert.doesNotMatch(c.slice(4), /[01OIL]/);
  }
  assert.match(R.generate({ prefix: '', length: 4 }), /^[A-Z2-9]{4}$/);
});

test('normalize och find: versaler, mellanslag och bindestreck spelar ingen roll', () => {
  assert.equal(R.normalize(' fika-25 '), 'FIKA25');
  assert.equal(R.clean(' fika  25 '), 'FIKA25');
  assert.equal(R.clean('höst--20!'), 'HÖST-20');
  const codes = [code(), code({ id: 'k2', code: 'LIL-7KQ2P' })];
  assert.equal(R.find(codes, 'fika 25').id, 'k1');
  assert.equal(R.find(codes, 'lil7kq2p').id, 'k2');
  assert.equal(R.find(codes, 'NOPE'), null);
  assert.equal(R.find(codes, ''), null);
});

test('discountAmount räknar som kassan: hela kronor och aldrig mer än summan', () => {
  const lines = [{ price: 35, qty: 3 }];
  assert.equal(R.discountAmount(lines, { type: 'procent', value: 25 }), 26);   // 26,25 avrundas
  assert.equal(R.discountAmount(lines, { type: 'kr', value: 500 }), 105);
  assert.equal(R.discountAmount([], { type: 'kr', value: 5 }), 0);
  assert.equal(R.discountAmount(lines, null), 0);
});

test('usage: kvitton med koden, makulerade räknas inte, fakturerade utlämnade räknas, öppna reserveras', () => {
  const c = code();
  const receipts = [
    receipt(),
    receipt({ id: 'r2', nr: 2, ts: '2026-10-04T11:00:00.000Z', discount: { type: 'procent', value: 25, amount: 30, codeId: 'k1' } }),
    receipt({ id: 'r3', nr: 3, status: 'makulerad' }),
    receipt({ id: 'r4', nr: 4, discount: { type: 'procent', value: 30, amount: 9, reason: '' } }),
    receipt({ id: 'r5', nr: 5, discount: null })
  ];
  const orders = [
    order({ id: 'o1', status: 'bekraftad' }),
    order({ id: 'o2', status: 'ny' }),
    order({ id: 'o3', status: 'avbokad' }),
    order({ id: 'o4', status: 'utlamnad', payment: 'faktura', deliveredAt: '2026-10-20T09:00:00.000Z' }),
    order({ id: 'o5', status: 'utlamnad', payment: 'betald', receiptId: 'r1' }),  // räknas redan via kvittot
    order({ id: 'o6', status: 'bekraftad', payment: 'betald', receiptId: 'r2' })  // betald i förväg, inte reserverad
  ];
  const u = R.usage(c, { receipts, orders });
  assert.equal(u.count, 3);
  assert.equal(u.amount, 20 + 30 + 100);
  assert.equal(u.last, '2026-10-20T09:00:00.000Z');
  assert.equal(u.reserved, 2);
  assert.deepEqual(u.uses.map((x) => x.kind), ['kvitto', 'kvitto', 'faktura']);
  assert.equal(u.uses[2].orderNr, 3);
});

test('status och validate: inaktiv, datumfönster med slutdagen inräknad, max antal med reservationer', () => {
  assert.equal(R.status(code(), '2026-11-01'), 'aktiv');
  assert.equal(R.status(code({ active: false }), '2026-11-01'), 'inaktiv');
  assert.equal(R.status(code({ validFrom: '2026-11-02' }), '2026-11-01'), 'kommande');
  assert.equal(R.status(code({ validTo: '2026-11-01' }), '2026-11-01'), 'aktiv');
  assert.equal(R.status(code({ validTo: '2026-10-31' }), '2026-11-01'), 'utgangen');
  // Förbrukad när den använts (eller reserverats) så många gånger som tillåts.
  assert.equal(R.status(code({ maxUses: 1 }), '2026-11-01', 1), 'forbrukad');
  assert.equal(R.status(code({ maxUses: 2 }), '2026-11-01', 1), 'aktiv');
  assert.equal(R.status(code({ maxUses: null }), '2026-11-01', 50), 'aktiv');
  assert.equal(R.status(code({ maxUses: 1, active: false }), '2026-11-01', 1), 'inaktiv');
  assert.equal(R.STATUS_LABELS.forbrukad, 'Förbrukad');

  assert.equal(R.validate(null, { today: '2026-11-01' }).ok, false);
  assert.equal(R.validate(code({ active: false }), { today: '2026-11-01' }).reason, 'inaktiv');
  assert.match(R.validate(code({ validTo: '2026-10-31' }), { today: '2026-11-01' }).message, /gällde till 2026-10-31/);

  const c = code({ maxUses: 2 });
  assert.equal(R.validate(c, { today: '2026-11-01', receipts: [receipt()] }).ok, true);
  const full = R.validate(c, { today: '2026-11-01', receipts: [receipt()], orders: [order()] });
  assert.equal(full.ok, false); assert.equal(full.reason, 'slut');
  // Beställningen som koden läggs på räknas inte mot sig själv.
  assert.equal(R.validate(c, { today: '2026-11-01', receipts: [receipt()], orders: [order()], excludeOrderId: 'o1' }).ok, true);
  // Makulerat kvitto frigör en användning.
  assert.equal(R.validate(c, { today: '2026-11-01', receipts: [receipt({ status: 'makulerad' }), receipt({ id: 'r2' })] }).ok, true);
});

test('toDiscount och describe', () => {
  assert.deepEqual(R.toDiscount(code()), { type: 'procent', value: 25, reason: 'Rabattkod FIKA25', codeId: 'k1', code: 'FIKA25' });
  assert.equal(R.describe(code()), '25 %');
  assert.equal(R.describe(code({ type: 'kr', value: 50 })), '50 kr');
});

test('check: formulärfel', () => {
  const codes = [code()];
  assert.deepEqual(R.check({ code: 'NY10', type: 'procent', value: 10 }, codes), []);
  assert.match(R.check({ code: 'fika-25', type: 'procent', value: 10 }, codes).join(), /finns redan/);
  assert.deepEqual(R.check({ code: 'FIKA25', type: 'procent', value: 25 }, codes, 'k1'), []);   // samma kod vid ändring
  assert.match(R.check({ code: 'AB', type: 'kr', value: 5 }, codes).join(), /minst tre/);
  assert.match(R.check({ code: 'ABC', type: 'procent', value: 120 }, codes).join(), /högst 100/);
  assert.match(R.check({ code: 'ABC', type: 'kr', value: 0 }, codes).join(), /storlek/);
  assert.match(R.check({ code: 'ABC', type: 'kr', value: 5, validFrom: '2026-11-10', validTo: '2026-11-01' }, codes).join(), /före startdatumet/);
  assert.match(R.check({ code: 'ABC', type: 'kr', value: 5, maxUses: 0 }, codes).join(), /minst 1/);
});
