(() => {
  'use strict';
  const { number } = AnesthesiaMath;
  const drugs = { ropi: 'Ропивакаин', bupi: 'Бупивакаин', levo: 'Левобупивакаин', lido: 'Лидокаин' };
  const adjuncts = {
    epi: { name: 'Адреналин', unit: 'мкг' },
    dex: { name: 'Дексаметазон', unit: 'мг' }
  };
  const sides = { left: 'Слева', right: 'Справа', both: 'С обеих сторон' };
  const empty = {
    name: '', side: '', drug: '', stock: '', drawn: '', volume: '',
    adjunct: '', adjunctStock: '', adjunctDrawn: '', given: ''
  };
  const rounded = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 5 });
  const scientific = new Intl.NumberFormat('ru-RU', { notation: 'scientific', maximumSignificantDigits: 5 });
  const fmt = n => n > 0 && n < 0.00001 ? scientific.format(n) : rounded.format(n);
  const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const positive = value => Number.isFinite(value) && value > 0;
  const options = (choices, selected) => Object.entries(choices).map(([id, name]) =>
    `<option value="${id}"${id === selected ? ' selected' : ''}>${name}</option>`).join('');
  const input = (key, label, value, numeric = true) => `<label>${label}
    <input data-block-field="${key}" value="${esc(value)}" maxlength="${numeric ? 24 : 100}" autocomplete="off" ${numeric ? 'inputmode="decimal"' : ''}></label>`;
  const select = (key, label, value, choices) => `<label>${label}
    <select data-block-field="${key}">${options(choices, value)}</select></label>`;
  const button = (key, label, extra = '') => `<button type="button" data-block-action="${key}" ${extra}>${label}</button>`;
  const blockName = row => [row.name.trim() || 'Блокада', sides[row.side]].filter(Boolean).join(' · ');

  function mixed(row) {
    const stock = number(row.stock);
    const drawn = number(row.drawn);
    const volume = number(row.volume);
    if (!drugs[row.drug] || !stock || !drawn || !volume) return { hint: 'Укажи препарат, концентрацию и объёмы' };
    const parts = [{ name: drugs[row.drug], unit: 'мг', dose: stock * drawn }];
    let adjunctVolume = 0;
    const adjunct = adjuncts[row.adjunct];
    if (adjunct) {
      const concentration = number(row.adjunctStock);
      adjunctVolume = number(row.adjunctDrawn);
      if (!concentration || !adjunctVolume) return { hint: 'Укажи концентрацию и объём адъюванта' };
      parts.push({ ...adjunct, dose: concentration * adjunctVolume });
    }
    const remaining = volume - drawn - adjunctVolume;
    if (remaining < -4 * Number.EPSILON * volume) return { hint: 'Компоненты превышают конечный объём' };
    for (const item of parts) item.concentration = item.dose / volume;
    if (!parts.every(item => positive(item.dose) && positive(item.concentration))) {
      return { hint: 'Значения вне диапазона расчёта' };
    }
    return { volume, diluent: Math.max(0, remaining), parts };
  }

  function create() {
    let serial = 0;
    const syringe = details => ({ ...empty, ...details, id: ++serial, used: 0 });
    let rows = [syringe()];
    let entries = [];
    let external = { drug: '', dose: '' };
    const findRow = el => rows.find(row => String(row.id) === el.closest('[data-block-row]')?.dataset.blockRow);

    function card(row, index) {
      const adjunctChoices = Object.fromEntries(Object.entries(adjuncts).map(([key, item]) => [key, item.name]));
      return `<section class="panel space block-card" data-block-row="${row.id}">
        <div class="bar"><h2>Шприц ${index + 1}</h2>
          ${button('remove', '×', 'aria-label="Убрать шприц" class="block-remove"')}
        </div>
        <fieldset class="epidural-fields" ${row.used ? 'disabled' : ''} aria-label="Состав шприца">
          <div class="gas-grid space">
            ${input('name', 'Блокада', row.name, false)}
            ${select('side', 'Сторона', row.side, { '': 'Выбрать', ...sides })}
            ${select('drug', 'Местный анестетик', row.drug, { '': 'Выбрать', ...drugs })}
            ${input('stock', 'Исходная, мг/мл', row.stock)}
            ${input('drawn', 'Набрано, мл', row.drawn)}
            ${input('volume', 'Итоговый объём, мл', row.volume)}
          </div>
          <div class="space">${select('adjunct', 'Адъювант', row.adjunct, { '': 'Без адъюванта', ...adjunctChoices })}</div>
          <div class="gas-grid space" data-block-adjunct hidden>
            ${input('adjunctStock', '<span data-block-adjunct-label></span>', row.adjunctStock)}
            ${input('adjunctDrawn', 'Адъювант, мл', row.adjunctDrawn)}
          </div>
        </fieldset>
        <div class="result"><strong data-block-content></strong><small data-block-solution></small></div>
        <div class="block-entry space">
          ${input('given', 'Введено, мл', row.given)}
          ${button('record', 'Записать введение', 'class="primary"')}
        </div>
        <p class="subtle space" data-block-balance hidden></p>
      </section>`;
    }
    function markup(weightMarkup) {
      return `<div class="gas-method" data-block-root>
        ${weightMarkup}
        <div data-block-cards>${rows.map(card).join('')}</div>
        <div class="actions space">${button('add', 'Добавить шприц')}</div>
        <section class="panel space">
          <h2>Фактически введено</h2>
          <div class="result"><strong data-block-total></strong><small data-block-totals></small></div>
          <ol class="gas-journal space" data-block-log hidden></ol>
          <details>
            <summary>Добавить дозу вне блокады</summary>
            <div class="gas-grid">
              ${select('externalDrug', 'Препарат', external.drug,
                { '': 'Выбрать', ...drugs, dexIV: 'Дексаметазон внутривенно' })}
              ${input('externalDose', 'Введено, мг', external.dose)}
            </div>
            <div class="actions space">${button('external', 'Записать дозу')}</div>
          </details>
        </section>
        <details>
          <summary>Справочник</summary>
          <p class="subtle">Перед смешиванием проверь совместимость и путь введения по инструкциям к конкретным формам. Суммы приведены отдельно по каждому препарату.</p>
          <p class="space"><a href="https://www.mediasphera.ru/issues/anesteziologiya-i-reanimatologiya/2025/5/1020175632025051008" target="_blank" rel="noopener">Рекомендации ФАР по системной токсичности местных анестетиков</a></p>
        </details>
      </div>`;
    }
    function updateCard(el, row) {
      const mix = mixed(row);
      const leftover = mix.volume - row.used;
      const given = number(row.given);
      const tooMuch = given > leftover + 4 * Number.EPSILON * mix.volume;
      const adjunct = adjuncts[row.adjunct];
      el.querySelector('[data-block-adjunct]').hidden = !adjunct;
      el.querySelector('[data-block-adjunct-label]').textContent =
        'Исходная, ' + (adjunct?.unit ?? '') + '/мл';
      el.querySelector('[data-block-content]').textContent = mix.parts
        ? mix.parts.map(item => `${item.name}: ${fmt(item.dose)} ${item.unit} · ${fmt(item.concentration)} ${item.unit}/мл`).join(' / ')
        : mix.hint;
      el.querySelector('[data-block-solution]').textContent = mix.parts ? 'Растворитель: ' + fmt(mix.diluent) + ' мл' : '';
      const balance = el.querySelector('[data-block-balance]');
      balance.hidden = !mix.parts;
      balance.textContent = tooMuch ? 'Введённый объём превышает остаток в шприце.'
        : 'Остаток: ' + fmt(Math.max(0, leftover)) + ' мл';
      el.querySelector('[data-block-action="record"]').disabled = !mix.parts || !given || tooMuch || leftover <= 0;
    }
    function refresh(main, weight) {
      const root = main.querySelector('[data-block-root]');
      if (!root) return;
      for (const el of root.querySelectorAll('[data-block-row]')) updateCard(el, findRow(el));
      const totals = new Map();
      for (const entry of entries) {
        for (const item of entry.parts) {
          const total = totals.get(item.name) ?? { ...item, dose: 0 };
          total.dose += item.dose;
          totals.set(item.name, total);
        }
      }
      const kg = number(weight);
      const perKg = item => {
        const ratio = kg && item.local ? item.dose / kg : null;
        return positive(ratio) ? ' · ' + fmt(ratio) + ' мг/кг' : '';
      };
      root.querySelector('[data-block-total]').textContent = entries.length ? 'Сумма по препаратам' : 'Пока нет записей';
      root.querySelector('[data-block-totals]').textContent = [...totals.values()].map(item =>
        `${item.name}: ${fmt(item.dose)} ${item.unit}${perKg(item)}`).join(' / ');
      const log = root.querySelector('[data-block-log]');
      log.hidden = !entries.length;
      log.innerHTML = entries.map(entry => `<li><b>${esc(entry.name)}</b>
        <small>${esc(entry.parts.map(item => `${item.name} ${fmt(item.dose)} ${item.unit}`).join(' · '))}</small>
      </li>`).join('');
      root.querySelector('[data-block-action="external"]').disabled =
        !(drugs[external.drug] || external.drug === 'dexIV') || !number(external.dose);
      for (const el of root.querySelectorAll('input[inputmode="decimal"]')) {
        el.setAttribute('aria-invalid', String(Boolean(el.value.trim() && !number(el.value))));
      }
    }
    function edit(el) {
      const key = el.dataset.blockField;
      if (key === 'externalDrug') external.drug = el.value;
      else if (key === 'externalDose') external.dose = el.value;
      else {
        const row = findRow(el);
        if (!row || !Object.hasOwn(empty, key) || (row.used && key !== 'given')) return false;
        row[key] = el.value;
        if (key === 'drug') row.stock = '';
        if (key === 'adjunct') row.adjunctStock = row.adjunctDrawn = '';
        return key === 'drug' || key === 'adjunct';
      }
      return false;
    }
    function click(control) {
      const row = findRow(control);
      switch (control.dataset.blockAction) {
        case 'add': {
          const last = rows.at(-1);
          const next = syringe(last && { name: last.name, side: last.side });
          rows.push(next);
          return `[data-block-row="${next.id}"] [data-block-field="name"]`;
        }
        case 'remove':
          if (!row) return;
          rows = rows.filter(item => item !== row);
          return '[data-block-action="add"]';
        case 'record': {
          if (!row) return;
          const mix = mixed(row);
          const given = number(row.given);
          if (!mix.parts || !given) return;
          const leftover = mix.volume - row.used;
          if (leftover <= 0 || given > leftover + 4 * Number.EPSILON * mix.volume) return;
          const volume = Math.min(given, leftover);
          entries.push({
            name: blockName(row) + ' · ' + fmt(volume) + ' мл',
            parts: mix.parts.map((item, index) => ({
              ...item, dose: item.dose * (volume / mix.volume), local: index === 0
            }))
          });
          row.used += volume;
          row.given = '';
          return `[data-block-row="${row.id}"] [data-block-field="given"]`;
        }
        case 'external': {
          const dose = number(external.dose);
          const intravenous = external.drug === 'dexIV';
          const name = intravenous ? 'Дексаметазон в/в' : drugs[external.drug];
          if (!name || !dose) return;
          entries.push({ name: 'Вне блокады', parts: [{ name, unit: 'мг', dose, local: !intravenous }] });
          external.dose = '';
          return '[data-block-field="externalDose"]';
        }
      }
    }
    return {
      markup, refresh, edit, click,
      hasData: () => Boolean(entries.length || external.drug || external.dose ||
        rows.some(row => Object.keys(empty).some(key => row[key] !== empty[key]))),
      reset() { rows = [syringe()]; entries = []; external = { drug: '', dose: '' }; }
    };
  }
  globalThis.AnesthesiaNerveBlock = { create };
})();
