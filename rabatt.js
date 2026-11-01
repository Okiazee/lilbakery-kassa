/* lil'bakery Kassa: rabattkoder.
   Rena funktioner utan DOM. Användningen räknas fram ur kvitton och beställningar (ingen egen logg),
   så makulering, avbokning och återställd kopia blir rätt av sig själva.
   I webbläsaren: window.KassaRabatt. I Node: require('./rabatt.js'). */
(function (root) {
  'use strict';

  // Utan 0/O, 1/I/L som är lätta att förväxla när koden läses upp eller skrivs av.
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
  const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

  // Jämförelseform: versaler, utan mellanslag och bindestreck. "fika 25" och "FIKA-25" är samma kod.
  function normalize(code) { return String(code || '').toUpperCase().replace(/[\s\-_]/g, ''); }

  // Visningsform för en kod som skrivs in: versaler, enkla bindestreck, inga mellanslag.
  function clean(code) { return String(code || '').toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9ÅÄÖ\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, ''); }

  function randomPart(length, rand) {
    let s = '';
    for (let i = 0; i < length; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length) % ALPHABET.length];
    return s;
  }

  // Ny unik kod, t.ex. LIL-7KQ2P. existing = befintliga koder (objekt eller strängar).
  function generate({ prefix = 'LIL', length = 5, existing = [], rand = Math.random } = {}) {
    const taken = new Set(existing.map((c) => normalize(typeof c === 'string' ? c : c.code)));
    const pre = clean(prefix);
    for (let i = 0; i < 1000; i++) {
      const code = (pre ? pre + '-' : '') + randomPart(length, rand);
      if (!taken.has(normalize(code))) return code;
    }
    throw new Error('Kunde inte skapa en unik kod');
  }

  function find(codes, text) { const n = normalize(text); return n ? codes.find((c) => normalize(c.code) === n) || null : null; }

  function describe(code) { return code.type === 'procent' ? `${code.value} %` : `${code.value} kr`; }

  // Rabattbelopp på samma sätt som kassans cartTotals: hela kronor, aldrig mer än summan.
  function discountAmount(lines, discount) {
    if (!discount) return 0;
    const gross = r2((lines || []).reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0));
    if (!(gross > 0)) return 0;
    const amount = discount.type === 'procent' ? Math.round(gross * discount.value / 100) : Math.round(discount.value);
    return Math.max(0, Math.min(amount, gross));
  }

  // Användning: godkända kvitton med koden, plus fakturerade beställningar som lämnats ut utan kvitto.
  // Reserverade: öppna beställningar (ny/bekräftad) som bär koden. Avbokade räknas aldrig.
  function usage(code, { receipts = [], orders = [] } = {}) {
    const uses = [];
    for (const r of receipts) {
      if (r.status === 'ok' && r.discount && r.discount.codeId === code.id) {
        uses.push({ kind: 'kvitto', at: r.ts, receiptId: r.id, receiptNr: r.nr, orderNr: r.preorder ? r.preorder.nr : null, amount: r2(r.discount.amount) });
      }
    }
    let reserved = 0;
    for (const o of orders) {
      if (!o.discount || o.discount.codeId !== code.id) continue;
      if (o.status === 'utlamnad' && !o.receiptId) uses.push({ kind: 'faktura', at: o.deliveredAt || o.updatedAt || o.created, orderId: o.id, orderNr: o.nr, amount: discountAmount(o.lines, o.discount) });
      // Betald i förväg räknas redan via kvittot.
      else if ((o.status === 'ny' || o.status === 'bekraftad') && !o.receiptId) reserved += 1;
    }
    uses.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return { count: uses.length, amount: r2(uses.reduce((s, u) => s + u.amount, 0)), last: uses.length ? uses[uses.length - 1].at : null, uses, reserved };
  }

  // 'aktiv' | 'inaktiv' | 'forbrukad' | 'kommande' | 'utgangen'. today = 'YYYY-MM-DD'; datum jämförs som text, slutdatum ingår.
  // used = gånger koden använts eller reserverats; når den maxUses är koden förbrukad.
  function status(code, today, used = 0) {
    if (!code.active) return 'inaktiv';
    if (code.maxUses && used >= code.maxUses) return 'forbrukad';
    if (isYmd(code.validFrom) && today < code.validFrom) return 'kommande';
    if (isYmd(code.validTo) && today > code.validTo) return 'utgangen';
    return 'aktiv';
  }
  const STATUS_LABELS = { aktiv: 'Aktiv', inaktiv: 'Inaktiv', forbrukad: 'Förbrukad', kommande: 'Kommande', utgangen: 'Utgången' };

  // Kontroll när koden läggs på ett köp eller en beställning. excludeOrderId = beställningen som koden
  // läggs på (den ska inte räknas som en reservation mot sig själv).
  function validate(code, { today, receipts = [], orders = [], excludeOrderId = null } = {}) {
    if (!code) return { ok: false, reason: 'saknas', message: 'Koden finns inte.' };
    const st = status(code, today);
    if (st === 'inaktiv') return { ok: false, reason: st, message: `Koden ${code.code} är inaktiverad.` };
    if (st === 'kommande') return { ok: false, reason: st, message: `Koden ${code.code} gäller från ${code.validFrom}.` };
    if (st === 'utgangen') return { ok: false, reason: st, message: `Koden ${code.code} gällde till ${code.validTo}.` };
    if (code.maxUses) {
      const u = usage(code, { receipts, orders: orders.filter((o) => o.id !== excludeOrderId) });
      if (u.count + u.reserved >= code.maxUses) return { ok: false, reason: 'slut', message: `Koden ${code.code} är redan använd ${u.count + u.reserved} av ${code.maxUses} gånger.` };
    }
    return { ok: true, reason: 'ok', message: '' };
  }

  // Rabatten som läggs på kundvagnen eller beställningen. reason syns på kvitto, PDF och mejl.
  function toDiscount(code) { return { type: code.type, value: code.value, reason: `Rabattkod ${code.code}`, codeId: code.id, code: code.code }; }

  // Fel i formuläret för en ny eller ändrad kod, som lista med svenska meddelanden.
  function check(input, codes = [], selfId = null) {
    const errors = [];
    const code = clean(input.code);
    if (normalize(code).length < 3) errors.push('Koden behöver minst tre tecken.');
    if (find(codes.filter((c) => c.id !== selfId), code)) errors.push(`Koden ${code} finns redan.`);
    const v = Number(input.value);
    if (!(v > 0)) errors.push('Ange rabattens storlek.');
    if (input.type === 'procent' && v > 100) errors.push('Rabatten kan vara högst 100 %.');
    if (input.validFrom && !isYmd(input.validFrom)) errors.push('Startdatumet är ogiltigt.');
    if (input.validTo && !isYmd(input.validTo)) errors.push('Slutdatumet är ogiltigt.');
    if (isYmd(input.validFrom) && isYmd(input.validTo) && input.validTo < input.validFrom) errors.push('Slutdatumet är före startdatumet.');
    if (input.maxUses !== null && input.maxUses !== undefined && input.maxUses !== '' && !(Number(input.maxUses) >= 1)) errors.push('Max antal användningar ska vara minst 1.');
    return errors;
  }

  const api = { ALPHABET, normalize, clean, generate, find, describe, discountAmount, usage, status, STATUS_LABELS, validate, toDiscount, check };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KassaRabatt = api;
})(typeof self !== 'undefined' ? self : this);
