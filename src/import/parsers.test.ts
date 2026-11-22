import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { matchRule, norm, orderedRules, defaultRules } from '../rules';
import { parseCsvStatement } from './csv';
import { pdfPages, parsePdfPages, type PdfLib } from './pdf';
import { parseSwedbankText, splitKind } from './swedbank';
import { parseSvDate } from './revolut';
import { parseAmount, parseDate } from './util';

describe('belopp och datum', () => {
  it('tolkar svenska och engelska format', () => {
    expect(parseAmount('-1 234,50')).toBe(-1234.5);
    expect(parseAmount('1,234.50')).toBe(1234.5);
    expect(parseAmount('−12,00 kr')).toBe(-12);
    expect(parseDate('260115')).toBe('2026-01-15');
    expect(parseDate('15/01/2026')).toBe('2026-01-15');
    expect(parseSvDate('3 okt. 2026')).toBe('2026-10-03');
  });
});

describe('normalisering och regler', () => {
  it('tar bort kortnummer men behåller namn med siffror', () => {
    expect(norm('Kortköp ICA SUPERMARKET 4589*1234')).toBe('ica supermarket');
    expect(norm('Klipp1 Centrum')).toBe('klipp1 centrum');
    expect(norm('+46701234567')).toBe('+46701234567');
  });
  it('matchar början av ord, sedan transaktionstyp, sedan förslag', () => {
    const rules = orderedRules(defaultRules());
    expect(matchRule({ description: 'ICA Nära Centrum', kind: '' }, rules)).toBe('mat');
    expect(matchRule({ description: 'Mica Design', kind: '' }, rules)).toBe(null);
    expect(matchRule({ description: 'Någon Person', kind: 'Lön' }, rules)).toBe('inkomst');
    expect(matchRule({ description: 'X', kind: '', hint: 'overf' }, rules)).toBe('overf');
  });
});

describe('Swedbank', () => {
  it('delar text i mottagare och typ', () => {
    expect(splitKind('ICA SUPERMARKET Kortköp/uttag')).toEqual({ ref: 'ICA SUPERMARKET', kind: 'Kortköp/uttag' });
  });
  it('läser inklistrad rapport och ger stabila id:n', () => {
    const text = '260115 260115 260115 ICA SUPERMARKET Kortköp/uttag -123,45 1 000,00\n' +
      '260115 260115 260115 ICA SUPERMARKET Kortköp/uttag -123,45 876,55\nRubrik';
    const r = parseSwedbankText(text);
    expect(r.txs).toHaveLength(2);
    expect(r.txs[0]).toMatchObject({ date: '2026-01-15', amount: -123.45, description: 'ICA SUPERMARKET', kind: 'Kortköp/uttag' });
    expect(r.txs[0].id).not.toBe(r.txs[1].id);
    expect(parseSwedbankText(text).txs.map((t) => t.id)).toEqual(r.txs.map((t) => t.id));
  });
});

describe('CSV', () => {
  it('läser Revolut-CSV, hoppar över misslyckade och drar av avgift', () => {
    const csv = 'Type,Started Date,Completed Date,Description,Amount,Fee,Currency,State\n' +
      'CARD_PAYMENT,2026-01-02 10:00:00,2026-01-03,Spotify,-119.00,1.00,SEK,COMPLETED\n' +
      'TOPUP,2026-01-04 10:00:00,2026-01-04,Top-up,500.00,0,SEK,COMPLETED\n' +
      'CARD_PAYMENT,2026-01-05 10:00:00,,Coop,-50.00,0,SEK,DECLINED\n';
    const r = parseCsvStatement(csv, 'statement.csv');
    expect(r.source).toBe('Revolut');
    expect(r.skipped).toBe(1);
    expect(r.txs.map((t) => t.amount)).toEqual([-120, 500]);
    expect(r.txs[1].hint).toBe('overf');
  });
});

// Kontroll mot riktiga kontoutdrag – filerna ligger utanför repot:
//   $env:SWB_PDF='C:\...\swedbank.pdf'; $env:REV_PDF='C:\...\revolut.pdf'; npm test
const loadLib = async () => (await import('pdfjs-dist/legacy/build/pdf.js')) as unknown as PdfLib;
const summary = async (path: string) => {
  const r = parsePdfPages(await pdfPages(await loadLib(), readFileSync(path)));
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    ...r,
    sum: round(r.txs.reduce((s, t) => s + t.amount, 0)),
    out: round(-r.txs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)),
    in: round(r.txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)),
  };
};

describe.runIf(!!process.env.SWB_PDF)('Swedbank-PDF (lokal fil)', () => {
  it('stämmer mot rapportens summa', async () => {
    const r = await summary(process.env.SWB_PDF!);
    console.log(`Swedbank: ${r.txs.length} rader, summa ${r.sum}, hoppade över ${r.skipped}`);
    expect(r.source).toBe('Swedbank');
    if (process.env.SWB_COUNT) expect(r.txs.length).toBe(+process.env.SWB_COUNT);
    if (process.env.SWB_SUM) expect(r.sum).toBe(+process.env.SWB_SUM);
  }, 30000);
});

describe.runIf(!!process.env.REV_PDF)('Revolut-PDF (lokal fil)', () => {
  it('stämmer mot saldot', async () => {
    const r = await summary(process.env.REV_PDF!);
    console.log(`Revolut: ${r.txs.length} rader, ut ${r.out}, in ${r.in}, ${r.warn || 'saldot stämmer'}`);
    expect(r.source).toBe('Revolut');
    expect(r.warn).toBe('');
    if (process.env.REV_COUNT) expect(r.txs.length).toBe(+process.env.REV_COUNT);
    if (process.env.REV_OUT) expect(r.out).toBe(+process.env.REV_OUT);
    if (process.env.REV_IN) expect(r.in).toBe(+process.env.REV_IN);
  }, 30000);
});
