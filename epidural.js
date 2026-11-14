(() => {
  'use strict';
  const { number } = AnesthesiaMath;
  const decimal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 });
  const precise = new Intl.NumberFormat('ru-RU', { notation: 'scientific', maximumSignificantDigits: 5 });
  const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const fmt = n => n > 0 && n < 0.0001 ? precise.format(n) : decimal.format(n);
  const esc = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const namedDrugs = { ropi: 'Ропивакаин', bupi: 'Бупивакаин', levo: 'Левобупивакаин', lido: 'Лидокаин' };
  const defaults = {
    drug: '', stock: '', mode: 'target', target: '', drawn: '', volume: '',
    adjunct: false, adjunctName: '', adjunctUnit: 'мкг', adjunctStock: '', adjunctDrawn: '',
    bolus: '', rate: '', rateUnit: 'ml'
  };
  const preparation = new Set(['drug','stock','mode','target','drawn','volume',
    'adjunct','adjunctName','adjunctUnit','adjunctStock','adjunctDrawn']);
  const normalize = value => value.trim().toLocaleLowerCase('ru').replaceAll('ё', 'е');
  const isPositive = value => Number.isFinite(value) && value > 0;
  function create() {
    let fields = { ...defaults };
    let entries = [];
    let active = null;
    let timer;

    function mixture() {
      const { drug, mode } = fields;
      const name = namedDrugs[drug];
      const stock = number(fields.stock);
      const volume = number(fields.volume);
      const value = number(fields[mode === 'target' ? 'target' : 'drawn']);
      if (!name || !stock || !volume || !value) return { hint: 'Заполни данные раствора' };
      if (mode === 'target' && value > stock) return { hint: 'Конечная концентрация выше исходной' };
      const drawn = mode === 'target' ? value / stock * volume : value;
      const dose = stock * drawn;
      const components = [{ name, unit: 'мг', concentration: dose / volume, dose }];
      let adjunctVolume = 0;
      if (fields.adjunct) {
        const adjunctName = fields.adjunctName.trim();
        const adjunctStock = number(fields.adjunctStock);
        adjunctVolume = number(fields.adjunctDrawn);
        if (!adjunctName || !adjunctStock || !adjunctVolume) return { hint: 'Заполни данные адъюванта' };
        if (Object.values(namedDrugs).some(local => normalize(local) === normalize(adjunctName))) {
          return { hint: 'Укажи отдельный адъювант' };
        }
        const adjunctDose = adjunctStock * adjunctVolume;
        components.push({ name: adjunctName, unit: fields.adjunctUnit, dose: adjunctDose, concentration: adjunctDose / volume });
      }
      const remaining = volume - drawn - adjunctVolume;
      if (remaining < -Number.EPSILON * 4 * volume) return { hint: 'Объём компонентов больше конечного объёма' };
      if (!isPositive(drawn) || !Number.isFinite(remaining) ||
        !components.every(item => isPositive(item.dose) && isPositive(item.concentration))) {
        return { hint: 'Значения вне диапазона расчёта' };
      }
      return { mix: { drawn, adjunctVolume, volume, diluent: Math.max(0, remaining), components } };
    }
    function rate(mix) {
      const value = number(fields.rate);
      if (!mix || !value) return null;
      const ml = fields.rateUnit === 'ml' ? value : value / mix.components[0].concentration;
      return isPositive(ml) && mix.components.every(item => isPositive(item.concentration * ml)) ? ml : null;
    }
    function bolus(mix) {
      const volume = number(fields.bolus);
      return mix && volume && volume <= mix.volume &&
        mix.components.every(item => isPositive(item.concentration * volume)) ? volume : null;
    }
    function deliveredVolume(segment, now) {
      return segment.rate * (Math.max(0, now - segment.start) / 3600000);
    }
    const field = (key, label, attributes = 'inputmode="decimal"') =>
      `<label>${label}<input data-epidural-field="${key}" value="${esc(fields[key])}" ${attributes} maxlength="60" autocomplete="off"></label>`;
    const select = (key, title, options) => `<label>${title}<select data-epidural-field="${key}">
      ${Object.entries(options).map(([value, name]) =>
        `<option value="${value}"${fields[key] === value ? ' selected' : ''}>${name}</option>`).join('')}
      </select></label>`;
    const button = (key, name, extra = '') => `<button type="button" data-epidural-action="${key}" ${extra}>${name}</button>`;
    function markup() {
      return `<div class="gas-method" data-epidural>
        <section class="panel space">
          <h2>Приготовить раствор</h2>
          <fieldset class="epidural-fields" data-epidural-preparation ${active ? 'disabled' : ''}>
            <legend class="subtle">Укажи концентрацию формы для эпидурального введения</legend>
            <div class="gas-grid space">
              ${select('drug', 'Местный анестетик', { '': 'Выбрать', ...namedDrugs })}
              ${field('stock', 'Исходная, мг/мл')}
              ${select('mode', 'Режим разведения', { target: 'По концентрации', drawn: 'По набранному объёму' })}
              ${field('volume', 'Конечный объём, мл')}
            </div>
            <div class="space" data-epidural-target>${field('target', 'Конечная, мг/мл')}</div>
            <div class="space" data-epidural-drawn>${field('drawn', 'Набрано анестетика, мл')}</div>
            <label class="space epidural-checkbox"><input type="checkbox" data-epidural-field="adjunct" ${fields.adjunct ? 'checked' : ''}> Добавить адъювант</label>
            <div class="space" data-epidural-adjunct>
              ${field('adjunctName', 'Название адъюванта', '')}
              <div class="gas-grid space">
                ${select('adjunctUnit', 'Единица адъюванта', { 'мкг': 'мкг', 'мг': 'мг' })}
                ${field('adjunctDrawn', 'Набрано, мл')}
              </div>
              <div class="space">${field('adjunctStock', '<span data-epidural-adjunct-stock-label></span>')}</div>
            </div>
          </fieldset>
          <div class="result"><strong data-epidural-mixture></strong><small data-epidural-components></small></div>
        </section>
        <section class="panel space">
          <h2>Болюс</h2>
          ${field('bolus', 'Объём болюса, мл')}
          <div class="result"><strong data-epidural-bolus></strong></div>
          <div class="actions space">${button('bolus', 'Записать введённый болюс')}</div>
        </section>
        <section class="panel space">
          <h2>Инфузомат</h2>
          <div class="gas-grid space">
            ${field('rate', 'Скорость')}
            ${select('rateUnit', 'Единица скорости', { ml: 'мл/ч', mg: 'мг/ч анестетика' })}
          </div>
          <div class="result"><strong data-epidural-rate></strong><small data-epidural-active hidden></small></div>
          <div class="actions space">
            ${button('start', 'Начать запись', 'class="primary"')}
            ${button('apply', 'Записать смену скорости', 'class="primary" hidden')}
            ${button('stop', 'Записать остановку', 'hidden')}
          </div>
          <p class="subtle space" data-epidural-pending hidden>Журнал пока считает по предыдущей скорости.</p>
        </section>
        <section class="panel space">
          <h2>Журнал введения</h2>
          <p class="subtle">Объём инфузии оценивается по записанной скорости и времени. Журнал хранится до обновления страницы.</p>
          <div class="result"><strong data-epidural-total></strong><small data-epidural-total-components></small></div>
          <ol class="gas-journal space" data-epidural-log hidden></ol>
        </section>
        <details><summary>Справочник</summary>
          <p class="subtle">У режима хирургической анестезии и послеоперационного обезболивания разные схемы. Сверяй их с инструкцией конкретной формы препарата и локальным протоколом.</p>
          <p class="space"><a href="https://www.mediasphera.ru/issues/anesteziologiya-i-reanimatologiya/2025/5/1020175632025051008" target="_blank" rel="noopener">Рекомендации ФАР: системная токсичность местных анестетиков</a></p>
        </details>
      </div>`;
    }
    const componentText = (mix, volume, suffix = '') => mix.components.map(item =>
      `${item.name} ${fmt(item.concentration * volume)} ${item.unit}${suffix}`).join(' · ');
    function updateJournal(root, now) {
      const totals = new Map();
      const recorded = active ? [...entries, { ...active, volume: deliveredVolume(active, now) }] : entries;
      let volume = 0;
      for (const row of recorded) {
        volume += row.volume;
        for (const item of row.mix.components) {
          const key = normalize(item.name);
          const total = totals.get(key) ?? { name: item.name, unit: item.unit, dose: 0 };
          total.dose += item.concentration * row.volume * (item.unit === total.unit ? 1 : item.unit === 'мг' ? 1000 : 0.001);
          totals.set(key, total);
        }
      }
      const estimate = recorded.some(row => row.rate) ? '≈ ' : '';
      root.querySelector('[data-epidural-total]').textContent = recorded.length ? estimate + fmt(volume) + ' мл' : 'Пока нет записей';
      root.querySelector('[data-epidural-total-components]').textContent = [...totals.values()]
        .map(item => `${item.name} ${estimate}${fmt(item.dose)} ${item.unit}`).join(' · ');
      const status = root.querySelector('[data-epidural-active]');
      status.hidden = !active;
      if (active) status.textContent = 'Запись идёт · ' + fmt(active.rate) + ' мл/ч · ≈ ' + fmt(deliveredVolume(active, now)) + ' мл';
    }
    function refresh(main) {
      clearInterval(timer);
      const root = main.querySelector('[data-epidural]');
      if (!root) return;
      const { mix, hint } = active ? { mix: active.mix } : mixture();
      const bolusVolume = bolus(mix);
      const mlRate = rate(mix);
      root.querySelector('[data-epidural-target]').hidden = fields.mode !== 'target';
      root.querySelector('[data-epidural-drawn]').hidden = fields.mode !== 'drawn';
      root.querySelector('[data-epidural-adjunct]').hidden = !fields.adjunct;
      root.querySelector('[data-epidural-adjunct-stock-label]').textContent =
        'Исходная концентрация адъюванта, ' + fields.adjunctUnit + '/мл';
      root.querySelector('[data-epidural-preparation]').disabled = Boolean(active);
      root.querySelector('[data-epidural-mixture]').textContent = mix
        ? fmt(mix.drawn) + ' мл анестетика + ' + (mix.adjunctVolume ? fmt(mix.adjunctVolume) + ' мл адъюванта + ' : '') + fmt(mix.diluent) + ' мл растворителя'
        : hint;
      root.querySelector('[data-epidural-components]').textContent = mix ? mix.components.map(item =>
        `${item.name} ${fmt(item.concentration)} ${item.unit}/мл · ${fmt(item.dose)} ${item.unit} в растворе`).join(' / ') : '';
      root.querySelector('[data-epidural-bolus]').textContent = bolusVolume ? componentText(mix, bolusVolume)
        : mix && number(fields.bolus) > mix.volume ? 'Болюс превышает объём приготовленного раствора' : 'Укажи объём болюса и состав раствора';
      root.querySelector('[data-epidural-rate]').textContent = mlRate
        ? fmt(mlRate) + ' мл/ч · ' + componentText(mix, mlRate, '/ч') : 'Укажи скорость и состав раствора';
      root.querySelector('[data-epidural-pending]').hidden = !active || mlRate === active.rate;
      for (const el of root.querySelectorAll('input[inputmode="decimal"]')) {
        el.setAttribute('aria-invalid', String(Boolean(el.value.trim() && !number(el.value))));
      }
      for (const el of root.querySelectorAll('[data-epidural-action]')) {
        switch (el.dataset.epiduralAction) {
          case 'bolus': el.disabled = !bolusVolume; break;
          case 'start': el.hidden = Boolean(active); el.disabled = !mlRate; break;
          case 'apply': el.hidden = !active; el.disabled = !mlRate || mlRate === active?.rate; break;
          case 'stop': el.hidden = !active; break;
        }
      }
      const journal = root.querySelector('[data-epidural-log]');
      journal.hidden = !entries.length;
      journal.innerHTML = entries.map(row => `<li><b>${row.rate ? 'Инфузия · ≈ ' : 'Болюс · '}${fmt(row.volume)} мл</b>
        <small>${time.format(row.start)}${row.rate ? '–' + time.format(row.end) + ' · ' + fmt(row.rate) + ' мл/ч' : ''}
        · ${esc(componentText(row.mix, row.volume))}</small></li>`).join('');
      updateJournal(root, Date.now());
      if (active) timer = setInterval(() => updateJournal(root, Date.now()), 1000);
    }
    function input(el, main) {
      const key = el.dataset.epiduralField;
      if (!Object.hasOwn(fields, key) || (active && preparation.has(key))) return;
      if (key === 'drug' && fields.drug !== el.value) fields.stock = '';
      if (key === 'adjunctUnit' && fields.adjunctUnit !== el.value) fields.adjunctStock = '';
      if (key === 'rateUnit' && fields.rateUnit !== el.value) fields.rate = '';
      fields[key] = key === 'adjunct' ? el.checked : el.value;
      if (el.tagName === 'SELECT') {
        for (const field of ['stock', 'adjunctStock', 'rate']) {
          main.querySelector(`[data-epidural-field="${field}"]`).value = fields[field];
        }
      }
      refresh(main);
    }
    function click(event, main) {
      const control = event.target.closest('[data-epidural-action]');
      if (!control || control.disabled) return;
      const { mix } = active ? { mix: active.mix } : mixture();
      const now = Date.now();
      const action = control.dataset.epiduralAction;
      if (action === 'bolus') {
        const volume = bolus(mix);
        if (!volume) return;
        entries.push({ start: now, mix, volume });
        fields.bolus = '';
        main.querySelector('[data-epidural-field="bolus"]').value = '';
      } else {
        const mlRate = rate(mix);
        if (action !== 'stop' && !mlRate) return;
        if (active) {
          const end = Math.max(now, active.start);
          const volume = deliveredVolume(active, end);
          if (volume > 0) entries.push({ ...active, end, volume });
        }
        active = action === 'stop' ? null : { start: now, rate: mlRate, mix };
      }
      refresh(main);
      const focus = { start: 'stop', stop: 'start' }[action];
      if (focus) main.querySelector(`[data-epidural-action="${focus}"]`)?.focus({ preventScroll: true });
    }
    return {
      markup, refresh, input, click,
      hasData: () => Boolean(active || entries.length || Object.keys(fields).some(key => fields[key] !== defaults[key])),
      reset() { fields = { ...defaults }; entries = []; active = null; clearInterval(timer); }
    };
  }
  globalThis.AnesthesiaEpidural = { create };
})();
