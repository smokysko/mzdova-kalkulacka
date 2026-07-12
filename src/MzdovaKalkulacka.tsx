import React, { useMemo, useState } from 'react';
import { getLang, persistLang, type Lang } from './tools-i18n';

/* =====================================================================
   Konštanty pre rok 2026 (overené 07/2026):
   - zamestnanec: ZP 5 % (ZŤP 2,5 %), SP 9,4 % (nemocenské 1,4 / starobné 4 /
     invalidné 3 / v nezamestnanosti 1); max. VZ pre SP 16 764 €/mes. (ZP bez stropu)
   - daň: pásma mesačného ZD 19 % do 3 665,28 / 25 % do 5 029,10 /
     30 % do 6 250,86 / 35 % nad; NČZD 497,23 €/mes. (životné minimum 284,13 €)
   - zamestnávateľ: ZP 11 % (ZŤP 5,5 %), SP 25,2 % → spolu 36,2 %
   Pri zmene legislatívy stačí upraviť tento blok.
===================================================================== */
const YEAR = 2026;
const NCZD_MONTH = 497.23;
const MAX_VZ_SP = 16764;
const TAX_BRACKETS: Array<[number, number]> = [
  [3665.28, 0.19],
  [5029.1, 0.25],
  [6250.86, 0.3],
  [Infinity, 0.35],
];
const EMPLOYEE_SP: Array<[string, string, number]> = [
  ['Nemocenské poistenie', 'Sickness insurance', 0.014],
  ['Starobné poistenie', 'Old-age insurance', 0.04],
  ['Invalidné poistenie', 'Disability insurance', 0.03],
  ['Poistenie v nezamestnanosti', 'Unemployment insurance', 0.01],
];
const EMPLOYER_ITEMS: Array<[string, string, number, boolean]> = [
  // [sk, en, rate, subject to max VZ]
  ['Nemocenské poistenie', 'Sickness insurance', 0.014, true],
  ['Starobné poistenie', 'Old-age insurance', 0.14, true],
  ['Invalidné poistenie', 'Disability insurance', 0.03, true],
  ['Poistenie v nezamestnanosti', 'Unemployment insurance', 0.005, true],
  ['Podpora v čase skrátenej práce', 'Short-time work support', 0.005, true],
  ['Garančné poistenie', 'Guarantee insurance', 0.0025, true],
  ['Rezervný fond solidarity', 'Solidarity reserve fund', 0.0475, true],
  ['Úrazové poistenie', 'Accident insurance', 0.008, false],
];
const VAT_RATES = [23, 19, 5];

const floor2 = (x: number) => Math.floor(x * 100 + 1e-9) / 100;
const round2 = (x: number) => Math.round(x * 100) / 100;

function computeWage(gross: number, useNczd: boolean, disabled: boolean) {
  const vzSP = Math.min(gross, MAX_VZ_SP);
  const spItems = EMPLOYEE_SP.map(([sk, en, r]) => ({ sk, en, rate: r, val: floor2(vzSP * r) }));
  const zpRate = disabled ? 0.025 : 0.05;
  const zp = floor2(gross * zpRate);
  const odvody = round2(spItems.reduce((s, i) => s + i.val, 0) + zp);
  const zaklad = Math.max(0, round2(gross - odvody));
  const nczd = useNczd ? Math.min(NCZD_MONTH, zaklad) : 0;
  const zdanitelne = Math.max(0, round2(zaklad - nczd));
  let tax = 0;
  let prev = 0;
  const taxParts: Array<{ rate: number; amount: number; tax: number }> = [];
  for (const [limit, rate] of TAX_BRACKETS) {
    if (zdanitelne <= prev) break;
    const amount = Math.min(zdanitelne, limit) - prev;
    if (amount > 0) taxParts.push({ rate, amount: round2(amount), tax: amount * rate });
    prev = limit;
  }
  tax = round2(taxParts.reduce((s, p) => s + p.tax, 0));
  const net = round2(gross - odvody - tax);

  const empZpRate = disabled ? 0.055 : 0.11;
  const empItems = EMPLOYER_ITEMS.map(([sk, en, r, capped]) => ({
    sk, en, rate: r, val: floor2((capped ? vzSP : gross) * r),
  }));
  const empZp = floor2(gross * empZpRate);
  const empTotal = round2(empItems.reduce((s, i) => s + i.val, 0) + empZp);
  const cenaPrace = round2(gross + empTotal);

  return { gross, spItems, zp, zpRate, odvody, zaklad, nczd, zdanitelne, taxParts, tax, net, empItems, empZp, empZpRate, empTotal, cenaPrace };
}

export default function MzdovaKalkulacka() {
  const [lang, setLang] = useState<Lang>(getLang());
  const t = (sk: string, en: string) => (lang === 'sk' ? sk : en);
  React.useEffect(() => { persistLang(lang); }, [lang]);

  const [tab, setTab] = useState<'mzda' | 'dph'>('mzda');

  // wage state
  const [grossStr, setGrossStr] = useState('1200');
  const [useNczd, setUseNczd] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const gross = Math.max(0, parseFloat(grossStr.replace(',', '.')) || 0);
  const w = useMemo(() => computeWage(gross, useNczd, disabled), [gross, useNczd, disabled]);

  // vat state
  const [vatAmountStr, setVatAmountStr] = useState('100');
  const [vatRate, setVatRate] = useState(23);
  const [vatCustomStr, setVatCustomStr] = useState('');
  const [vatDir, setVatDir] = useState<'add' | 'remove'>('add');
  const vatAmount = Math.max(0, parseFloat(vatAmountStr.replace(',', '.')) || 0);
  const effRate = vatCustomStr !== '' ? Math.max(0, parseFloat(vatCustomStr.replace(',', '.')) || 0) : vatRate;
  const vat = useMemo(() => {
    const r = effRate / 100;
    if (vatDir === 'add') {
      const base = vatAmount, tax = round2(base * r);
      return { base: round2(base), tax, total: round2(base + tax) };
    }
    const total = vatAmount, base = round2(total / (1 + r));
    return { base, tax: round2(total - base), total: round2(total) };
  }, [vatAmount, effRate, vatDir]);

  const fmt = (n: number) => new Intl.NumberFormat(lang === 'sk' ? 'sk-SK' : 'en-IE', { style: 'currency', currency: 'EUR' }).format(n);
  const pct = (r: number) => (r * 100).toLocaleString(lang === 'sk' ? 'sk-SK' : 'en-IE', { maximumFractionDigits: 2 }) + ' %';

  const quick = [915, 1200, 1524, 2000, 3000];

  return (
    <div className="mk-app">
      <header className="mk-top">
        <div className="mk-logo"><span className="sym">€</span>{t('Mzdová kalkulačka', 'Salary calculator')} <span className="yr">{YEAR}</span></div>
        <span className="mk-spacer" />
        <div className="lang-switch">
          <button className={lang === 'sk' ? 'on' : ''} onClick={() => setLang('sk')}>SK</button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
        </div>
        <a className="mk-back" href="/#tools">← {t('Portfólio', 'Portfolio')}</a>
      </header>

      <div className="mk-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'mzda'} className={tab === 'mzda' ? 'on' : ''} onClick={() => setTab('mzda')}>{t('Čistá mzda', 'Net salary')}</button>
        <button role="tab" aria-selected={tab === 'dph'} className={tab === 'dph' ? 'on' : ''} onClick={() => setTab('dph')}>{t('DPH kalkulačka', 'VAT calculator')}</button>
      </div>

      {tab === 'mzda' ? (
        <div className="mk-body">
          <section className="mk-form">
            <label className="mk-label" htmlFor="mk-gross">{t('Hrubá mesačná mzda', 'Gross monthly salary')}</label>
            <div className="mk-input-wrap">
              <input id="mk-gross" inputMode="decimal" value={grossStr} onChange={(e) => setGrossStr(e.target.value)} aria-label={t('Hrubá mzda v eurách', 'Gross salary in euros')} />
              <span className="unit">€</span>
            </div>
            <div className="mk-chips">
              {quick.map((q) => (
                <button key={q} className={gross === q ? 'on' : ''} onClick={() => setGrossStr(String(q))}>{q.toLocaleString('sk-SK')} €</button>
              ))}
            </div>

            <label className="mk-check">
              <input type="checkbox" checked={useNczd} onChange={(e) => setUseNczd(e.target.checked)} />
              <span><b>{t('Uplatniť nezdaniteľnú časť', 'Apply personal allowance')}</b><br />
              <small>{t(`Podpísané vyhlásenie u zamestnávateľa (${NCZD_MONTH.toLocaleString('sk-SK', { minimumFractionDigits: 2 })} € mesačne)`, `Signed declaration with the employer (€${NCZD_MONTH}/month)`)}</small></span>
            </label>
            <label className="mk-check">
              <input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} />
              <span><b>{t('Zdravotne postihnutý zamestnanec', 'Employee with disability')}</b><br />
              <small>{t('Polovičné sadzby zdravotného poistenia', 'Half health-insurance rates')}</small></span>
            </label>

            <p className="mk-note">{t(
              'Orientačný výpočet mesačného preddavku podľa legislatívy platnej pre rok 2026. Nezohľadňuje daňový bonus na deti ani ročné zúčtovanie.',
              'Indicative monthly calculation under the rules in force for 2026. Does not include the child tax bonus or the annual tax settlement.'
            )}</p>
          </section>

          <section className="mk-results">
            <div className="mk-hero-card">
              <p>{t('Čistá mzda', 'Net salary')}</p>
              <strong>{fmt(w.net)}</strong>
              <div className="mk-hero-row">
                <span>{t('Odvody', 'Contributions')}: {fmt(w.odvody)}</span>
                <span>{t('Daň', 'Tax')}: {fmt(w.tax)}</span>
              </div>
            </div>

            <div className="mk-cards">
              <div className="mk-card">
                <h3>{t('Zamestnanec', 'Employee')}</h3>
                <table>
                  <tbody>
                    <tr><td>{t('Hrubá mzda', 'Gross salary')}</td><td>{fmt(w.gross)}</td></tr>
                    <tr><td>{t('Zdravotné poistenie', 'Health insurance')} <em>{pct(w.zpRate)}</em></td><td>−{fmt(w.zp)}</td></tr>
                    {w.spItems.map((i) => (
                      <tr key={i.sk}><td>{lang === 'sk' ? i.sk : i.en} <em>{pct(i.rate)}</em></td><td>−{fmt(i.val)}</td></tr>
                    ))}
                    <tr className="sep"><td>{t('Základ dane', 'Tax base')}</td><td>{fmt(w.zaklad)}</td></tr>
                    <tr><td>{t('Nezdaniteľná časť', 'Personal allowance')}</td><td>−{fmt(w.nczd)}</td></tr>
                    {w.taxParts.map((p) => (
                      <tr key={p.rate}><td>{t('Daň', 'Tax')} <em>{pct(p.rate)}</em></td><td>−{fmt(round2(p.tax))}</td></tr>
                    ))}
                    {w.taxParts.length === 0 && <tr><td>{t('Daň', 'Tax')}</td><td>{fmt(0)}</td></tr>}
                    <tr className="total"><td>{t('Čistá mzda', 'Net salary')}</td><td>{fmt(w.net)}</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="mk-card">
                <h3>{t('Zamestnávateľ', 'Employer')}</h3>
                <table>
                  <tbody>
                    <tr><td>{t('Hrubá mzda', 'Gross salary')}</td><td>{fmt(w.gross)}</td></tr>
                    <tr><td>{t('Zdravotné poistenie', 'Health insurance')} <em>{pct(w.empZpRate)}</em></td><td>+{fmt(w.empZp)}</td></tr>
                    {w.empItems.map((i) => (
                      <tr key={i.sk}><td>{lang === 'sk' ? i.sk : i.en} <em>{pct(i.rate)}</em></td><td>+{fmt(i.val)}</td></tr>
                    ))}
                    <tr className="total"><td>{t('Cena práce spolu', 'Total cost of work')}</td><td>{fmt(w.cenaPrace)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="mk-body">
          <section className="mk-form">
            <label className="mk-label" htmlFor="mk-vat">{vatDir === 'add' ? t('Suma bez DPH', 'Amount excluding VAT') : t('Suma s DPH', 'Amount including VAT')}</label>
            <div className="mk-input-wrap">
              <input id="mk-vat" inputMode="decimal" value={vatAmountStr} onChange={(e) => setVatAmountStr(e.target.value)} />
              <span className="unit">€</span>
            </div>

            <div className="mk-seg">
              <button className={vatDir === 'add' ? 'on' : ''} onClick={() => setVatDir('add')}>{t('Pripočítať DPH', 'Add VAT')}</button>
              <button className={vatDir === 'remove' ? 'on' : ''} onClick={() => setVatDir('remove')}>{t('Odpočítať DPH', 'Remove VAT')}</button>
            </div>

            <label className="mk-label">{t('Sadzba DPH', 'VAT rate')}</label>
            <div className="mk-chips">
              {VAT_RATES.map((r) => (
                <button key={r} className={vatCustomStr === '' && vatRate === r ? 'on' : ''} onClick={() => { setVatRate(r); setVatCustomStr(''); }}>{r} %</button>
              ))}
              <span className="mk-custom">
                <input placeholder={t('vlastná', 'custom')} inputMode="decimal" value={vatCustomStr} onChange={(e) => setVatCustomStr(e.target.value)} aria-label={t('Vlastná sadzba DPH', 'Custom VAT rate')} />%
              </span>
            </div>

            <p className="mk-note">{t(
              'Sadzby DPH na Slovensku v roku 2026: základná 23 %, znížené 19 % a 5 %.',
              'VAT rates in Slovakia in 2026: standard 23%, reduced 19% and 5%.'
            )}</p>
          </section>

          <section className="mk-results">
            <div className="mk-hero-card">
              <p>{vatDir === 'add' ? t('Suma s DPH', 'Amount including VAT') : t('Suma bez DPH', 'Amount excluding VAT')}</p>
              <strong>{fmt(vatDir === 'add' ? vat.total : vat.base)}</strong>
              <div className="mk-hero-row"><span>DPH {effRate.toLocaleString('sk-SK')} %: {fmt(vat.tax)}</span></div>
            </div>
            <div className="mk-cards">
              <div className="mk-card">
                <h3>{t('Rozpis', 'Breakdown')}</h3>
                <table>
                  <tbody>
                    <tr><td>{t('Základ (bez DPH)', 'Base (excl. VAT)')}</td><td>{fmt(vat.base)}</td></tr>
                    <tr><td>DPH {effRate.toLocaleString('sk-SK')} %</td><td>{fmt(vat.tax)}</td></tr>
                    <tr className="total"><td>{t('Spolu s DPH', 'Total incl. VAT')}</td><td>{fmt(vat.total)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
