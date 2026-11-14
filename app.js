(() => {
  'use strict';
  const { units, number, calculate, scales, dimension } = AnesthesiaMath;
  const { fresh, upgrade, blank, plan } = AnesthesiaCatalog;
  const storageKey = 'anesthesia-calculator-v1';
  const main = document.querySelector('#main');
  const dialog = document.querySelector('#dialog');
  const status = document.querySelector('#status');
  const nav = document.querySelector('#nav');
  const uid = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
  const clone = value => structuredClone(value);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[ch]);
  const numeric = ' inputmode="decimal" autocomplete="off" spellcheck="false"';
  const methods = { none: 'Выбрать метод', tiva: 'Тотальная внутривенная анестезия', gas: 'Ингаляционная анестезия' };
  const stages = { induction: 'Индукция', maintenance: 'Поддержание' };
  const isUnit = unit => Object.hasOwn(units, unit);
  const decimals = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 });
  const scientific = new Intl.NumberFormat('ru-RU', { notation: 'scientific', maximumSignificantDigits: 5 });
  const fmt = value => {
    if (!Number.isFinite(value) || value <= 0) return 'вне диапазона расчёта';
    if (value < 0.01 || value >= 1e9) return scientific.format(value);
    return decimals.format(value);
  };
  function url(value) {
    try {
      const parsed = new URL(value);
      return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : '';
    } catch { return ''; }
  }
  const link = value => url(value)
    ? `<a href="${esc(url(value))}" target="_blank" rel="noopener noreferrer">Источник ↗</a>` : '';
  const option = (value, title, selection) =>
    `<option value="${esc(value)}"${value === selection ? ' selected' : ''}>${esc(title)}</option>`;
  const select = (label, field, markup, kind = 'field') =>
    `<label>${esc(label)}<select data-${kind}="${field}">${markup}</select></label>`;
  const input = (label, field, value, attributes = '', kind = 'field') =>
    `<label>${esc(label)}<input data-${kind}="${field}" value="${esc(value)}"${attributes}></label>`;
  const button = (title, action, value = '', extra = '') =>
    `<button type="button" data-action="${action}" value="${esc(value)}" ${extra}>${esc(title)}</button>`;
  const unitOptions = (selection, time) => Object.entries(units)
    .filter(([, unit]) => time === undefined || time === unit.time)
    .map(([label]) => option(label, label, selection)).join('');
  const massOptions = (selection, allowed = Object.keys(scales)) => allowed.map(mass => option(mass, mass, selection)).join('');

  function validate(data) {
    const string = value => typeof value === 'string';
    const named = item => item && string(item.id) && item.id && string(item.name) && item.name.trim();
    const unique = items => new Set(items.map(item => item.id)).size === items.length;
    const decimal = value => string(value) && (!value.trim() || number(value) !== null);
    const mass = value => Object.hasOwn(scales, value);
    const list = (items, test) => Array.isArray(items) && items.every(test);
    if (![1, 2, 3, 4].includes(data?.version) || !list(data.drugs, drug => named(drug) &&
      (drug.group === undefined || string(drug.group)) &&
      (drug.mixtures === undefined || list(drug.mixtures, m => m && string(m.quantity) && number(m.quantity) &&
        mass(m.unit) && string(m.volume) && number(m.volume))) &&
      list(drug.concentrations, c => c && number(c.value) && string(c.value) && mass(c.unit)) &&
      list(drug.doses, d => named(d) && decimal(d.value) && isUnit(d.unit) &&
        (d.referenceOnly === undefined || typeof d.referenceOnly === 'boolean') && string(d.note) && string(d.source) && (!d.source || url(d.source))) && unique(drug.doses)) ||
      !unique(data.drugs)) throw Error('Некорректный справочник препаратов.');
    const ids = new Set(data.drugs.map(drug => drug.id));
    const validRow = row => row && (row.drug === null || ids.has(row.drug)) && isUnit(row.unit) &&
      string(row.label) && string(row.note) && string(row.preset) &&
      ['direct','mix'].includes(row.preparation) && mass(row.cUnit) &&
      ['value','concentration','quantity','volume'].every(field => decimal(row[field])) &&
      row.weight === '' && typeof row.reverse === 'boolean' && typeof row.weightRequired === 'boolean' &&
      (!row.reverse || units[row.unit].time);
    if (!list(data.scenarios, s => named(s) && string(s.note) && string(s.gas) &&
      Object.hasOwn(methods, s.method) && (!s.source || (string(s.source) && url(s.source))) &&
      list(s.induction, row => validRow(row) && !units[row.unit].time) && list(s.maintenance, validRow)) ||
      !unique(data.scenarios)) throw Error('Некорректные сценарии.');
    return data;
  }
  const migrate = data => addInfusionCatalog(data.version >= 3 ? data : upgrade(data));
  let database = addInfusionCatalog(fresh());
  let startupMessage = '';
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) database = migrate(validate(JSON.parse(saved)));
  } catch {
    startupMessage = 'Не удалось загрузить настройки браузера. Открыты стартовые шаблоны.';
  }
  const emptyPlan = () => plan('', '', '', []);
  let draft = clone(database.scenarios[0] || emptyPlan());
  let patientWeight = '';
  let tab = 'calc';
  let dirty = false;
  let activeCard = 0;
  let infusionView = 'calculator';
  let infusionCard = 0;
  const infusionDrugs = () => database.drugs.filter(drug =>
    drug.id !== 'eto' || drug.doses.some(dose => units[dose.unit]?.time));
  const hasPump = drug => !drug.doses.some(dose => dose.referenceOnly) ||
    drug.doses.some(dose => !dose.referenceOnly && units[dose.unit].time);
  const defaultPumpDrug = () => infusionDrugs().find(drug => drug.id === 'nor')?.id ?? infusionDrugs()[0]?.id;
  let pump = newPump(defaultPumpDrug());
  function newPump(id) {
    const drug = infusionDrugs().find(item => item.id === id);
    const unit = drug?.doses.find(dose => !dose.referenceOnly && units[dose.unit]?.time)?.unit || 'мкг/кг/мин';
    return { ...blank(drug?.id ?? null, unit), preparation: 'mix', cUnit: dimension(units[unit].mass) === 'ммоль' ? 'ммоль' : 'мг', reverse: true };
  }
  let touchStart;
  let editingDrug;
  let pendingImport;
  let timer;

  function notify(message, sticky = false) {
    clearTimeout(timer);
    dialog.querySelector('.dialog-message')?.remove();
    if (dialog.open) {
      const messageEl = document.createElement('p');
      messageEl.className = 'dialog-message space';
      messageEl.setAttribute('role', 'alert');
      messageEl.textContent = message;
      dialog.append(messageEl);
      messageEl.scrollIntoView({ block: 'nearest' });
      status.hidden = true;
      return;
    }
    status.textContent = message;
    status.hidden = false;
    if (!sticky) timer = setTimeout(() => { status.hidden = true; }, 3800);
  }
  function commit(next) {
    try {
      validate(next);
      localStorage.setItem(storageKey, JSON.stringify(next));
      database = next;
      return true;
    } catch (error) {
      if (error.name === 'QuotaExceededError' || error.name === 'SecurityError') {
        notify('Браузер не смог сохранить настройки. Текущие настройки сохранены в памяти этой вкладки.', true);
        database = next;
        return 'session';
      }
      notify(error.message, true);
      return false;
    }
  }
  const drugFor = id => database.drugs.find(drug => drug.id === id);
  const openDetails = () => new Set([...main.querySelectorAll('details[open][data-key]')].map(el => el.dataset.key));
  function render(preserve = false) {
    const opened = preserve ? openDetails() : new Set();
    for (const el of nav.querySelectorAll('button')) {
      if (el.dataset.tab === tab) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    }
    const showCards = tab === 'calc' || (tab === 'pump' && infusionView === 'maintenance');
    const content = showCards ? renderCalc() : tab === 'pump' ? renderPump()
      : tab === 'drugs' ? renderCatalog() : renderSettings();
    main.innerHTML = (tab === 'calc' || tab === 'pump' ? patientPanel() : '') + content;
    if (showCards || tab === 'pump') {
      for (const details of main.querySelectorAll('details[data-key]')) {
        if (opened.has(details.dataset.key)) details.open = true;
      }
      if (showCards) updateResults();
      else updatePump();
    }
  }
  const currentStage = () => tab === 'pump' ? 'maintenance' : 'induction';
  const currentIndex = () => tab === 'pump' ? infusionCard : activeCard;
  function setCard(index) {
    if (tab === 'pump') infusionCard = index;
    else activeCard = index;
  }
  const cards = () => draft[currentStage()].map((row, index) => ({ row, stage:currentStage(), index }));
  function moveCard(index) {
    if (index < 0 || index >= cards().length || index === currentIndex()) return;
    setCard(index);
    render();
  }
  function patientPanel() {
    const scenarioOptions = option('', 'Новый сценарий', draft.id) + database.scenarios
      .map(scenario => option(scenario.id, scenario.name, draft.id)).join('');
    return `<section class="panel patient-panel shared-patient" aria-label="Текущий пациент">
      <div class="grid weight-grid">
        ${select('Сценарий','scenario',scenarioOptions,'global')}
        ${input('Масса, кг','patientWeight',patientWeight,numeric,'global')}
      </div>
      ${button('Новый пациент','new-patient','','class="patient-reset"')}
    </section>`;
  }
  function renderCalc() {
    const deck = cards();
    const index = currentIndex();
    const stage = currentStage();
    const maintenance = stage === 'maintenance';
    const card = deck[index];
    return (maintenance ? button('К инфузомату','infusion-view','calculator') : '') + `
      <section class="deck" aria-label="Карточки препаратов" data-deck>
        ${card ? `<div class="deck-header">
          <button type="button" data-action="previous-card" aria-label="Предыдущий препарат" ${index === 0 ? 'disabled' : ''}>‹</button>
          <p role="status">${stages[card.stage]} <span>· ${index+1} / ${deck.length}</span></p>
          <button type="button" data-action="next-card" aria-label="Следующий препарат" ${index + 1 === deck.length ? 'disabled' : ''}>›</button>
        </div>${renderRow(card.row, card.stage, card.index)}`
          : `<div class="panel">${button('Добавить первый препарат','add-row',stage)}</div>`}
      </section>
      <div class="deck-actions">
        ${button('Итог','review','','class="primary"')}
      </div>
      <details class="scenario-tools" data-key="scenario-tools"><summary>Настроить сценарий</summary>
        ${draft.note ? `<p class="subtle">${esc(draft.note)} ${link(draft.source)}</p>` : ''}
        <div class="grid">${input('Название','name',draft.name,' maxlength="120"','global')}
        ${input('Описание','note',draft.note,' maxlength="1000"','global')}</div>
        ${maintenance ? renderMethod() : ''}
        <div class="actions space">
          ${button('Добавить препарат','add-row',stage)}
          ${button('Сохранить как сценарий','save-as')}
          ${draft.id ? button('Обновить сценарий','save-scenario') : ''}
          ${draft.id ? button('Удалить сценарий','delete-scenario','','class="danger"') : ''}
        </div>
      </details>`;
  }
  function renderMethod() {
    return `<div class="grid">
      ${select('Метод','method',Object.entries(methods).map(([id, name]) => option(id,name,draft.method)).join(''),'global')}
      ${draft.method === 'gas' ? input('Анестетик и параметры','gas',draft.gas,' placeholder="Препарат, концентрация или целевая МАК"','global') : ''}
    </div>`;
  }
  function renderRow(row, stage, index) {
    const drug = drugFor(row.drug);
    const infusion = units[row.unit].time;
    const weightBased = units[row.unit].weight;
    const key = stage + '-' + index;
    const weightLabel = row.weightRequired ? 'Расчётная масса, кг · требуется' : 'Расчётная масса, кг · по желанию';
    const drugOptions = option('', 'Выбрать препарат', row.drug || '') +
      database.drugs.map(d => option(d.id, d.name, row.drug)).join('');
    const concentrations = (drug?.concentrations ?? []).filter(c => dimension(c.unit) === dimension(units[row.unit].mass));
    const doses = (drug?.doses ?? []).filter(d => !d.referenceOnly && units[d.unit].time === infusion && !row.reverse);
    const doseLabel = row.reverse ? 'Скорость насоса, мл/ч' : infusion ? 'Скорость инфузии' : 'Доза';
    const quickConcentration = row.preparation === 'direct' && concentrations.length > 0
      ? select('Концентрация','savedConcentration',
        option('', 'Выбрать', '') +
        concentrations.map((c,i) => option(String(i), c.value + ' ' + c.unit + '/мл', '')).join(''))
      : '';
    const showWeight = weightBased && row.weightRequired;
    const concentrationName = row.preparation === 'mix' ? 'Единица количества' : 'Единица концентрации';
    const arrows = `<button type="button" data-action="up" aria-label="Выше" ${index === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" data-action="down" aria-label="Ниже" ${index === draft[stage].length-1 ? 'disabled' : ''}>↓</button>`;
    return `<article class="row" data-stage="${stage}" data-index="${index}" aria-label="${esc(drug?.name || row.label || 'Строка расчёта')}">
      <h2>${esc(drug?.name || row.label || 'Выбор препарата')}</h2>
      ${!drug && !row.label ? `<div class="space">${select('Препарат','drug',drugOptions)}</div>` : ''}
      <div class="dose-line space">
        <div>
          <label for="card-dose">${doseLabel}</label>
          <div class="stepper">
            <button type="button" data-action="step-dose" value="-1" aria-label="Уменьшить дозу">−</button>
            <input id="card-dose" data-field="value" value="${esc(row.value)}"${numeric}>
            <button type="button" data-action="step-dose" value="1" aria-label="Увеличить дозу">+</button>
          </div>
        </div>
        ${select(row.reverse ? 'Единица результата' : 'Единица','unit',unitOptions(row.unit, infusion))}
      </div>
      ${showWeight ? `<div class="space">${input('Расчётная масса, кг','weight',row.weight,numeric)}
        ${row.note ? `<p class="subtle">${esc(row.note)}</p>` : ''}</div>` : ''}
      ${quickConcentration ? `<div class="quick-concentration space">${quickConcentration}</div>` : ''}
      <div class="result"><strong data-answer></strong><small data-math hidden></small></div>
      ${doses.length ? `<details data-key="${key}-doses"><summary>Справочные и сохранённые дозы</summary>
        ${doses.map(d => `<div class="reference"${d.id === row.preset ? ' aria-current="true"' : ''}>
          <p><b>${esc(d.name)}</b>${d.value ? ' · ' + esc(d.value + ' ' + d.unit) : ''}</p>
          <p class="subtle">${esc(d.note)} ${link(d.source)}</p>
          ${d.value ? button('Подставить дозу','apply-dose',d.id) : button('Ввести дозу в ' + d.unit,'apply-dose',d.id)}
        </div>`).join('')}</details>` : ''}
      <details data-key="${key}-prep">
        <summary>Настроить карточку</summary>
        <div class="grid">
        ${infusion ? select('Направление расчёта','reverse',option('false','Доза → мл/ч',String(row.reverse)) + option('true','Мл/ч → доза',String(row.reverse))) : ''}
        ${select('Приготовление раствора','preparation',option('direct','Указать концентрацию',row.preparation) + option('mix','Количество и итоговый объём',row.preparation))}
        ${drug || row.label ? select('Препарат','drug',drugOptions) : ''}
        ${stage === 'maintenance' ? select('Введение','kind',option('bolus','Болюс',infusion ? 'infusion' : 'bolus') + option('infusion','Инфузия',infusion ? 'infusion' : 'bolus')) : ''}
        ${select(concentrationName,'cUnit',massOptions(row.cUnit, Object.keys(scales).filter(unit => dimension(unit) === dimension(units[row.unit].mass))))}
        ${row.preparation === 'mix' ? input('Количество препарата','quantity',row.quantity,numeric) +
          input('Итоговый объём раствора, мл','volume',row.volume,numeric) : input('Концентрация, ' + row.cUnit + '/мл','concentration',row.concentration,numeric)}
        ${!showWeight && weightBased ? input(weightLabel,'weight',row.weight,numeric) : ''}
        ${select('Правило расчётной массы','weightRequired',
          option('false','Фактическая или указанная',String(row.weightRequired)) +
          option('true','Всегда указывать отдельно',String(row.weightRequired)))}
        ${input('Примечание к строке','note',row.note)}
        ${!drug ? input('Название препарата вручную','label',row.label) : ''}
        </div>
        <div class="actions space">${arrows}${button('Убрать','remove-row','','class="danger"')}</div>
      </details>
    </article>`;
  }
  function describe(row) {
    const unit = units[row.unit];
    const result = calculate(row, row.weightRequired ? '' : patientWeight);
    const { value, weight, rawConcentration, concentration, amount, answer } = result;
    const c = concentration && Number.isFinite(concentration)
      ? fmt(rawConcentration) + ' ' + row.cUnit + '/мл' : '';
    const context = [unit.weight && weight ? fmt(weight) + ' кг' : '', c].filter(Boolean).join(' · ');
    if (!value) return { answer: 'Введите ' + (row.reverse ? 'скорость насоса' : 'дозу'), context };
    if (unit.weight && !weight) return { answer: 'Введите ' + (row.weightRequired || row.weight.trim() ? 'расчётную' : 'фактическую') + ' массу', context };
    const missingConcentration = row.preparation === 'mix'
      ? 'Укажите количество препарата и итоговый объём'
      : 'Укажите концентрацию для расчёта объёма';
    const prettyAmount = fmt(amount) + ' ' + unit.mass + (unit.time ? '/ч' : '');
    if (row.reverse) {
      if (!c) return { answer: 'Укажите концентрацию раствора', context: row.preparation === 'mix' ? missingConcentration : context };
      if (!Number.isFinite(answer) || answer <= 0 || !Number.isFinite(amount) || amount <= 0) return { answer: 'Расчёт вне диапазона', context };
      return {
        answer: fmt(answer) + ' ' + row.unit,
        context: fmt(value) + ' мл/ч × ' + c + ' → ' + prettyAmount + (unit.weight ? ' · масса ' + fmt(weight) + ' кг' : ''),
        ready: true
      };
    }
    if (!Number.isFinite(amount) || amount <= 0 || (c && (!Number.isFinite(answer) || answer <= 0))) {
      return { answer: 'Расчёт вне диапазона', context };
    }
    const expression = fmt(value) + ' ' + row.unit +
      (unit.weight ? ' × ' + fmt(weight) + ' кг' : '') +
      (row.unit.endsWith('/мин') ? ' × 60 мин/ч' : '');
    return {
      answer: prettyAmount + (c ? ' → ' + fmt(answer) + ' мл' + (unit.time ? '/ч' : '') : ''),
      context: expression + (c ? ' · концентрация ' + c : ' · ' + missingConcentration),
      ready: true
    };
  }
  function updateResults() {
    const article = main.querySelector('article[data-stage]');
    if (article) {
      const row = rowFrom(article);
      const result = describe(row);
      const current = number(row.value);
      const step = doseStep(row);
      article.querySelector('[data-answer]').textContent = result.answer;
      article.querySelector('[data-math]').textContent = result.context;
      article.querySelector('[data-math]').hidden = !result.ready || !calculate(row, patientWeight).rawConcentration;
      article.querySelector('[data-action="step-dose"][value="-1"]').disabled = !current || current <= step;
      const concentrationSelect = article.querySelector('[data-field="savedConcentration"]');
      if (concentrationSelect) {
        const concentration = number(row.concentration);
        const index = drugFor(row.drug).concentrations.filter(c => dimension(c.unit) === dimension(units[row.unit].mass)).findIndex(c =>
          c.unit === row.cUnit && number(c.value) === concentration
        );
        concentrationSelect.value = index < 0 ? '' : String(index);
        concentrationSelect.options[0].textContent = concentration && index < 0
          ? fmt(concentration) + ' ' + row.cUnit + '/мл · вручную' : 'Выбрать';
      }
      for (const el of article.querySelectorAll('input[inputmode="decimal"]')) {
        el.setAttribute('aria-invalid', String(Boolean(el.value.trim() && !number(el.value))));
      }
    }
    const patient = main.querySelector('[data-global="patientWeight"]');
    patient.setAttribute('aria-invalid', String(Boolean(patientWeight.trim() && !number(patientWeight))));
  }
  function doseStep(row) {
    if (row.reverse) return 0.1;
    if (units[row.unit].weight) return row.unit === 'мг/кг/мин' ? 0.01 : 0.1;
    return row.unit.endsWith('/мин') ? 0.1 : 1;
  }
  function review() {
    const content = [currentStage()].map(stage => {
      const rows = draft[stage];
      const method = stage === 'maintenance' && draft.method !== 'none'
        ? `<p class="subtle">${esc(methods[draft.method])}${draft.method === 'gas' && draft.gas ? ' · ' + esc(draft.gas) : ''}</p>` : '';
      if (!rows.length && !method) return '';
      return `<section class="review-stage space"><h3>${stages[stage]}</h3>${method}
        ${rows.map((row, index) => {
          const result = describe(row);
          const name = drugFor(row.drug)?.name || row.label || 'Препарат не выбран';

          return `<div class="review-row"><b>${esc(name)}</b><strong>${esc(result.answer)}</strong>
            <small>${esc(result.context)}</small>
            ${button('Открыть карточку','review-card',String(index))}</div>`;
        }).join('')}</section>`;
    }).join('');
    dialog.innerHTML = `<div class="bar"><h2 id="dialog-title">Итог</h2>${button('К расчёту','close')}</div>
      <p class="subtle">${esc([draft.name, number(patientWeight) && fmt(number(patientWeight)) + ' кг'].filter(Boolean).join(' · '))}</p>
      ${content || '<p class="space">Добавь препарат, чтобы увидеть расчёт.</p>'}
      <p class="subtle space">Сверь дозы, расчётную массу и фактическую концентрацию перед введением.</p>`;
    dialog.setAttribute('aria-labelledby','dialog-title');
    dialog.showModal();
  }
  const inputNumberFormat = new Intl.NumberFormat('ru-RU', { useGrouping:false, maximumSignificantDigits: 15 });
  const decimalInput = value => Number.isFinite(value) && value > 0 ? inputNumberFormat.format(value) : '';
  function pumpStep() {
    if (pump.reverse) return 0.1;
    if (pump.unit === 'мкг/кг/мин' || pump.unit === 'мг/кг/мин') return 0.01;
    return 0.1;
  }
  function pumpNumber(label, field, value) {
    return `<div class="pump-field">
      <label for="pump-${field}">${esc(label)}</label>
      <div class="stepper">
        <button type="button" data-action="pump-step" data-step-field="${field}" value="-1" aria-label="${esc(label)} · уменьшить">−</button>
        <input id="pump-${field}" data-pump="${field}" value="${esc(value)}"${numeric}>
        <button type="button" data-action="pump-step" data-step-field="${field}" value="1" aria-label="${esc(label)} · увеличить">+</button>
      </div>
    </div>`;
  }
  function renderPump() {
    const drug = drugFor(pump.drug);
    const groups = new Map();
    for (const item of infusionDrugs()) {
      const group = item.group || 'Другие препараты';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(item);
    }
    const drugOptions = [...groups].map(([group, items]) =>
      `<optgroup label="${esc(group)}">${items.map(item => option(item.id,item.name,pump.drug)).join('')}</optgroup>`
    ).join('');
    if (!drug) return `<section class="panel"><p>Добавь препарат в справочник.</p></section>`;
    const doses = drug.doses.filter(dose => dose.referenceOnly || units[dose.unit].time);
    const references = doses.map(dose => `<div class="reference"><p><b>${esc(dose.name)}</b></p>
      <p class="subtle">${esc(dose.note || (dose.value ? dose.value + ' ' + dose.unit : ''))} ${link(dose.source)}</p>
      ${dose.referenceOnly ? '' : button(dose.value ? 'Подставить ' + dose.value + ' ' + dose.unit : 'Ввести дозу в ' + dose.unit,'pump-reference',dose.id)}</div>`).join('');
    const mixtures = (drug.mixtures || []).flatMap((m,i) => dimension(m.unit) !== dimension(units[pump.unit].mass) ? [] : [option('m'+i,m.quantity+' '+m.unit+' / '+m.volume+' мл','')]);
    const concentrations = drug.concentrations.flatMap((c,i) => dimension(c.unit) !== dimension(units[pump.unit].mass) ? [] : [option('c'+i,c.value+' '+c.unit+'/мл','')]);
    const prep = pump.preparation === 'mix';
    const allowed = dimension(units[pump.unit].mass) === 'ммоль' ? ['ммоль'] : ['мг','мкг'];
    const doseUnits = Object.keys(units).filter(key => units[key].time && allowed.includes(units[key].mass))
      .map(key => option(key,key,pump.unit)).join('');
    const doseBlock = `<section class="panel pump-panel"><div class="bar"><h3>Доза</h3>
      ${!pump.reverse ? '<span class="pump-badge">Ввод</span>' : ''}</div><div class="pump-grid">
      ${pump.reverse ? '<output data-pump-dose class="pump-result" aria-label="Рассчитанная доза">—</output>' : pumpNumber('Заданная доза','value',pump.value)}
      ${select('Единицы','unit',doseUnits,'pump')}</div></section>`;
    const rateBlock = `<section class="panel pump-panel"><div class="bar"><h3>Скорость инфузомата</h3>
      ${pump.reverse ? '<span class="pump-badge">Ввод</span>' : ''}</div>
      ${pump.reverse ? pumpNumber('Скорость, мл/ч','value',pump.value)
        : '<p class="pump-result"><output data-pump-rate aria-label="Рассчитанная скорость">—</output> <small>мл/ч</small></p>'}</section>`;
    const templateOptions = draft.maintenance.map((row,index) => {
      const item = drugFor(row.drug);
      if (!item || !hasPump(item) || !units[row.unit].time) return '';
      return option(String(index), item.name + (row.value ? ' · ' + row.value + ' ' + (row.reverse ? 'мл/ч' : row.unit) : ''),'');
    }).join('');
    return `<div class="pump-shell">
      <section class="panel pump-hero">
        <h2>${esc(drug.name)}</h2>
        <div class="pump-grid">
          ${select('Препарат','drug',drugOptions,'pump')}
          ${templateOptions ? select('Из сценария','template',option('','Выбрать схему', '') + templateOptions,'pump') : ''}
        </div>
      </section>
      <details class="panel pump-reference" data-key="pump-reference"${hasPump(drug) ? '' : ' open'}>
        <summary>Справочные дозы ${doses.length ? '· '+doses.length : ''}</summary>
        ${references || '<p class="subtle">Для этого препарата можно сохранить дозу во вкладке «Препараты».</p>'}
      </details>
      ${hasPump(drug) ? `<section class="panel pump-panel">
        <div class="bar"><h3>Разведение</h3>
          ${select('Формат','preparation',option('mix','Количество / итоговый объём',pump.preparation) +
            option('direct','Готовая концентрация',pump.preparation),'pump')}</div>
        <div class="pump-grid">
          ${pump.weightRequired ? pumpNumber('Расчётная масса, кг','weight',pump.weight) : ''}
          ${prep ? pumpNumber('Количество препарата','quantity',pump.quantity) : pumpNumber('Концентрация на мл','concentration',pump.concentration)}
          ${select('Единица','cUnit',massOptions(pump.cUnit,allowed),'pump')}
          ${prep ? pumpNumber('Итоговый объём, мл','volume',pump.volume) : ''}
        </div>
        <p class="subtle" data-pump-concentration></p>
        <details data-key="pump-mixtures"><summary>Сохранённые разведения и концентрации</summary>
          ${mixtures.length || concentrations.length ? select('Подставить','preset',option('','Выбрать','')+mixtures.join('')+concentrations.join(''),'pump') : ''}
          ${prep ? button('Сохранить разведение','pump-save-mixture') : '<p class="subtle">Концентрации можно сохранить во вкладке «Препараты».</p>'}
        </details>
      </section>
      <div class="pump-direction">${button(pump.reverse ? 'Скорость → доза · переключить' : 'Доза → скорость · переключить','pump-direction')}</div>
      ${pump.reverse ? rateBlock + doseBlock : doseBlock + rateBlock}
      <p role="status" class="subtle pump-status" data-pump-status></p>` : ''}
      ${button('Настроить схему поддержания','infusion-view','maintenance')}
    </div>`;
  }
  function updatePump() {
    const patient = main.querySelector('[data-global="patientWeight"]');
    patient?.setAttribute('aria-invalid', String(Boolean(patientWeight.trim() && !number(patientWeight))));
    const status = main.querySelector('[data-pump-status]');
    if (!status) return;
    const unit = units[pump.unit];
    const result = calculate(pump, pump.weightRequired ? '' : patientWeight);
    const answer = Number.isFinite(result.answer) && result.answer > 0 ? fmt(result.answer) : '—';
    const dose = main.querySelector('[data-pump-dose]');
    const rate = main.querySelector('[data-pump-rate]');
    if (dose) dose.textContent = answer;
    if (rate) rate.textContent = answer;
    const c = Number.isFinite(result.concentration) && result.concentration > 0;
    main.querySelector('[data-pump-concentration]').textContent = c
      ? fmt(result.rawConcentration) + ' ' + pump.cUnit + '/мл' : '';
    const written = [
      !c ? 'Укажи разведение или концентрацию' : '',
      unit.weight && !result.weight ? (pump.weightRequired ? 'Укажи расчётную массу' : 'Укажи массу') : '',
      !result.value ? (pump.reverse ? 'Укажи скорость' : 'Укажи дозу') : ''
    ].filter(Boolean);
    status.textContent = written.length ? written.join(' · ') : answer === '—' ? 'Значения вне диапазона расчёта' : '';
    for (const el of main.querySelectorAll('input[data-pump]')) {
      el.setAttribute('aria-invalid', String(Boolean(el.value.trim() && !number(el.value))));
      const minus = el.previousElementSibling;
      const step = el.dataset.pump === 'value' ? pumpStep() : ['quantity','concentration'].includes(el.dataset.pump)
        ? (pump.cUnit === 'мг' ? 0.1 : 1) : 1;
      minus.disabled = !number(el.value) || number(el.value) <= step;
    }
  }
  function changePump(field, value) {
    if (field === 'drug') {
      pump = {...newPump(value), reverse:pump.reverse};
    } else if (field === 'template') {
      const row = value === '' ? null : draft.maintenance[Number(value)];
      if (row && units[row.unit]?.time && drugFor(row.drug)) pump = clone(row);
    } else if (field === 'preset') {
      const drug = drugFor(pump.drug);
      const index = Number(value.slice(1));
      if (value.startsWith('m') && drug.mixtures?.[index]) {
        const mixture = drug.mixtures[index];
        Object.assign(pump,{ preparation:'mix', cUnit:mixture.unit, quantity:mixture.quantity, volume:mixture.volume });
      } else if (value.startsWith('c') && drug.concentrations[index]) {
        const concentration = drug.concentrations[index];
        Object.assign(pump,{ preparation:'direct', cUnit:concentration.unit, concentration:concentration.value });
      }
    } else {
      if (field === 'unit' && !pump.reverse) pump.value = '';
      if (field === 'cUnit' || field === 'preparation') {
        pump.quantity = '';
        pump.concentration = '';
        if (field === 'preparation') pump.volume = '';
      }
      pump[field] = value;
    }
    render(true);
  }
  function renderCatalog() {
    return `<div class="bar"><h2>Справочник препаратов</h2>
      ${button('Добавить препарат','add-drug','','class="primary"')}</div>` + database.drugs.map(drug =>
      `<section class="row"><div class="bar"><h3>${esc(drug.name)}</h3>
      <div class="actions">${drug.doses.length ? button('Справочник','drug-reference',drug.id) : ''}
      ${button('Редактировать','edit-drug',drug.id)}</div></div>
      <p class="subtle">${drug.concentrations.map(c => esc(c.value + ' ' + c.unit + '/мл')).join(' · ')}
      ${drug.doses.length ? (drug.concentrations.length ? ' · ' : '') + drug.doses.length + ' справочных записей' : ''}</p></section>`
    ).join('');
  }
  function renderSettings() {
    return `<section class="panel"><h2>Резервная копия</h2>
      <p class="subtle space">Препараты и сценарии хранятся в этом браузере. Экспорт содержит настройки, которые ты сохранил в шаблонах.</p>
      <div class="actions space">
      ${button('Экспортировать JSON','export','','class="primary"')}
      ${button('Импортировать JSON','choose-file')}
      <input id="file" type="file" accept=".json,application/json" hidden></div>
      </section>`;
  }
  function drugEditor() {
    const d = editingDrug;
    dialog.innerHTML = `<div class="bar"><h2 id="dialog-title">Препарат</h2>${button('Закрыть','close')}</div>
      ${input('Название','name',d.name,' maxlength="120"','editor')}
      <div class="bar space"><h3>Концентрации</h3>${button('Добавить концентрацию','add-concentration')}</div>
      ${d.concentrations.map((c, index) => `<div class="editor-item" data-editor-group="concentrations" data-index="${index}">
        <div class="grid">${input('Значение на мл','value',c.value,numeric,'editor')}
        ${select('Единица','unit',massOptions(c.unit),'editor')}</div>
        ${button('Убрать','remove-entry','','class="space danger"')}</div>`).join('')}
      <div class="bar space"><h3>Дозы и справочные записи</h3>${button('Добавить дозу','add-dose')}</div>
      ${d.doses.map((item, index) => `<div class="editor-item" data-editor-group="doses" data-index="${index}">
        <div class="grid">${input('Название записи','name',item.name,'','editor')}
        ${input('Доза · можно оставить пустой','value',item.value,numeric,'editor')}
        ${select('Единица','unit',unitOptions(item.unit),'editor')}</div>
        <label>Примечание или диапазон<textarea data-editor="note">${esc(item.note)}</textarea></label>
        ${input('Ссылка на источник','source',item.source,' inputmode="url"','editor')}
        ${button('Убрать','remove-entry','','class="space danger"')}</div>`).join('')}
      <div class="actions space">${button('Сохранить препарат','save-drug','','class="primary"')}
      ${drugFor(d.id) ? button('Удалить препарат','delete-drug','','class="danger"') : ''}</div>`;
    if (!dialog.open) {
      dialog.setAttribute('aria-labelledby','dialog-title');
      dialog.showModal();
    }
  }
  function promptDialog(title, body, markup) {
    dialog.innerHTML = `<h2 id="dialog-title">${esc(title)}</h2>${body}
      <div class="actions space">${markup}${button('Отмена','close')}</div>`;
    dialog.setAttribute('aria-labelledby','dialog-title');
    if (!dialog.open) dialog.showModal();
  }
  function savePlan(copy, providedName) {
    const name = (providedName ?? draft.name).trim();
    if (!name) { notify('Введи название сценария.'); return; }
    const scenario = clone(draft);
    scenario.name = name;
    if (copy || !scenario.id) scenario.id = uid();
    for (const stage of Object.keys(stages)) {
      for (const row of scenario[stage]) {
        for (const field of ['value','concentration','quantity','volume','weight']) {
          if (row[field].trim() && !number(row[field])) {
            notify('Проверь заполненные числовые поля перед сохранением.');
            return;
          }
        }
        row.weight = '';
      }
    }
    const next = clone(database);
    const index = next.scenarios.findIndex(item => item.id === scenario.id);
    if (index < 0) next.scenarios.push(scenario);
    else next.scenarios[index] = scenario;
    const committed = commit(next);
    if (!committed) return;
    draft.id = scenario.id;
    draft.name = name;
    dirty = false;
    dialog.close();
    if (committed === 'session') notify('Настройки доступны до закрытия вкладки. Выгрузи резервную копию.', true);
    render(true);
    if (committed === true) notify('Сценарий сохранён.');
  }
  function rowFrom(el) {
    const container = el.closest('[data-stage]');
    return container ? draft[container.dataset.stage][Number(container.dataset.index)] : null;
  }
  function handleField(el) {
    const row = rowFrom(el);
    const field = el.dataset.field;
    if (!row || !field) return;
    dirty = true;
    if (field === 'drug') {
      const previous = { weightRequired: row.weightRequired };
      Object.assign(row, blank(el.value || null, row.unit), previous);
    } else if (field === 'weightRequired') {
      row.weightRequired = el.value === 'true';
    } else if (field === 'kind') {
      row.unit = units[row.unit].mass + (units[row.unit].weight ? '/кг' : '') + (el.value === 'infusion' ? '/ч' : '');
      row.value = '';
      row.reverse = false;
      row.preset = '';
    } else if (field === 'savedConcentration') {
      if (!el.value) {
        row.concentration = '';
        render(true);
        return;
      }
      const found = drugFor(row.drug)?.concentrations.filter(c => dimension(c.unit) === dimension(units[row.unit].mass))[Number(el.value)];
      if (!found) return;
      row.cUnit = found.unit;
      row.concentration = found.value;
    } else if (field === 'reverse') {
      row.reverse = el.value === 'true';
      row.value = '';
      row.preset = '';
    } else {
      if (field === 'value') row.preset = '';
      if (field === 'unit') {
        if (!row.reverse) row.value = '';
        row.preset = '';
      }
      if (field === 'preparation') {
        row.concentration = '';
        row.quantity = '';
        row.volume = '';
      }
      if (field === 'cUnit') {
        row.concentration = '';
        row.quantity = '';
      }
      row[field] = el.value;
      if (field === 'unit' && dimension(units[row.unit].mass) !== dimension(row.cUnit)) {
        row.cUnit = units[row.unit].mass;
        row.concentration = '';
        row.quantity = '';
      }
    }
    if (el.tagName === 'SELECT') render(true);
    else updateResults();
  }
  function loadPlan(id) {
    draft = clone(database.scenarios.find(item => item.id === id) || emptyPlan());
    pump = newPump(pump.drug);
    dirty = false;
    activeCard = 0;
    infusionCard = 0;
    render();
  }
  function loadScenario(id) {
    if (id === draft.id) return;
    if (dirty) {
      main.querySelector('[data-global="scenario"]').value = draft.id;
      promptDialog('Перейти к другому сценарию?',
        '<p class="subtle space">Текущие правки пропадут. Чтобы оставить их, сохрани сценарий.</p>',
        button('Открыть сценарий','load-scenario',id,'class="primary"'));
    } else loadPlan(id);
  }
  main.addEventListener('touchstart', event => {
    touchStart = null;
    if (event.touches.length !== 1 || !event.target.closest('[data-deck]') ||
        event.target.closest('input, select, textarea, a, [contenteditable]')) return;
    touchStart = event.touches[0];
  }, { passive: true });
  main.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
  main.addEventListener('touchend', event => {
    if (!touchStart) return;
    const start = touchStart;
    touchStart = null;
    const end = [...event.changedTouches].find(touch => touch.identifier === start.identifier);
    if (!end) return;
    const dx = end.clientX - start.clientX;
    const dy = end.clientY - start.clientY;
    if (Math.abs(dx) >= 55 && Math.abs(dx) > 1.35 * Math.abs(dy)) {
      if (event.cancelable) event.preventDefault();
      moveCard(currentIndex() + (dx < 0 ? 1 : -1));
    }
  }, { passive: false });
  main.addEventListener('input', event => {
    const el = event.target;
    if (el.tagName === 'SELECT' || el.type === 'file') return;
    if (el.dataset.pump) {
      pump[el.dataset.pump] = el.value;
      updatePump();
      return;
    }
    const global = el.dataset.global;
    if (global === 'patientWeight') {
      patientWeight = el.value;
      if (tab === 'pump' && infusionView === 'calculator') updatePump();
      else updateResults();
    } else if (global) {
      draft[global] = el.value;
      dirty = true;
      updateResults();
    } else handleField(el);
  });
  main.addEventListener('change', async event => {
    const el = event.target;
    if (el.id === 'file') {
      const file = el.files[0];
      el.value = '';
      if (!file) return;
      try {
        if (file.size > 5_000_000) throw Error('Файл настроек превышает 5 МБ.');
        pendingImport = migrate(validate(JSON.parse(await file.text())));
        promptDialog('Заменить настройки?',
          `<p class="subtle space">В файле препаратов: ${pendingImport.drugs.length}, сценариев: ${pendingImport.scenarios.length}. Импорт заменит текущие препараты и сценарии.</p>`,
          button('Импортировать','import','','class="primary"'));
      } catch (error) {
        notify(error instanceof SyntaxError ? 'Файл не удалось прочитать как JSON.' : error.message, true);
      }
      return;
    }
    if (el.tagName !== 'SELECT') return;
    if (el.dataset.pump) {
      changePump(el.dataset.pump, el.value);
      return;
    }
    if (el.dataset.global === 'scenario') loadScenario(el.value);
    else if (el.dataset.global === 'method') {
      draft.method = el.value;
      dirty = true;
      render(true);
    } else handleField(el);
  });
  nav.addEventListener('click', event => {
    const newTab = event.target.closest('button')?.dataset.tab;
    if (!newTab) return;
    tab = newTab;
    render();
  });
  dialog.addEventListener('input', event => {
    const el = event.target;
    const field = el.dataset.editor;
    if (!field || !editingDrug) return;
    const group = el.closest('[data-editor-group]');
    if (group) editingDrug[group.dataset.editorGroup][Number(group.dataset.index)][field] = el.value;
    else editingDrug[field] = el.value;
  });
  function saveDrug() {
    const drug = clone(editingDrug);
    drug.name = drug.name.trim();
    for (const dose of drug.doses) {
      dose.name = dose.name.trim();
      dose.source = dose.source.trim();
    }
    if (!drug.name || drug.concentrations.some(c => !number(c.value)) ||
      drug.doses.some(d => !d.name || (d.value.trim() && !number(d.value)) || (d.source && !url(d.source)))) {
      notify('Проверь название, числовые поля и ссылки на источники.'); return;
    }
    const next = clone(database);
    const index = next.drugs.findIndex(item => item.id === drug.id);
    if (index < 0) next.drugs.push(drug);
    else next.drugs[index] = drug;
    const committed = commit(next);
    if (!committed) return;
    if (!pump.drug) pump = newPump(defaultPumpDrug());
    dialog.close();
    if (committed === 'session') notify('Настройки доступны до закрытия вкладки. Выгрузи резервную копию.', true);
    render();
    if (committed === true) notify('Препарат сохранён.');
  }
  function deleteDrug() {
    const drug = drugFor(editingDrug.id);
    if (!drug) return;
    const convert = scenario => {
      for (const stage of Object.keys(stages)) {
        for (const row of scenario[stage]) {
          if (row.drug !== drug.id) continue;
          row.drug = null;
          row.label = drug.name;
          row.preset = '';
        }
      }
    };
    const next = clone(database);
    next.drugs = next.drugs.filter(item => item.id !== drug.id);
    next.scenarios.forEach(convert);
    const committed = commit(next);
    if (!committed) return;
    convert(draft);
    if (pump.drug === drug.id) pump = newPump(defaultPumpDrug());
    dialog.close();
    if (committed === 'session') notify('Настройки доступны до закрытия вкладки. Выгрузи резервную копию.', true);
    render();
    if (committed === true) notify('Препарат удалён из справочника.');
  }
  function exportSettings() {
    const payload = new Blob([JSON.stringify(database, null, 2)], { type:'application/json' });
    const blobUrl = URL.createObjectURL(payload);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = 'anesthesia-settings.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  }
  document.addEventListener('click', event => {
    const buttonEl = event.target.closest('button[data-action]');
    if (!buttonEl) return;
    const { action } = buttonEl.dataset;
    const value = buttonEl.value;
    const container = buttonEl.closest('[data-stage]');
    const row = rowFrom(buttonEl);
    switch (action) {
      case 'infusion-view':
        infusionView = value;
        render();
        break;
      case 'pump-direction': {
        const result = calculate(pump, pump.weightRequired ? '' : patientWeight);
        pump.reverse = !pump.reverse;
        pump.value = decimalInput(result.answer);
        render(true);
        break;
      }
      case 'pump-step': {
        const field = buttonEl.dataset.stepField;
        const step = field === 'value' ? pumpStep() : field === 'quantity' || field === 'concentration'
          ? (pump.cUnit === 'мг' ? 0.1 : 1) : 1;
        const previous = pump[field];
        const next = decimalInput((number(previous) || 0) + Number(value) * step);
        pump[field] = next;
        main.querySelector(`input[data-pump="${field}"]`).value = next;
        updatePump();
        break;
      }
      case 'pump-reference': {
        const dose = drugFor(pump.drug)?.doses.find(d => d.id === value);
        if (!dose || dose.referenceOnly) return;
        if (dimension(units[dose.unit].mass) !== dimension(pump.cUnit)) {
          pump.cUnit = units[dose.unit].mass;
          pump.quantity = '';
          pump.concentration = '';
        }
        pump.reverse = false;
        pump.unit = dose.unit;
        pump.value = dose.value;
        render(true);
        main.querySelector('#pump-value')?.focus();
        break;
      }
      case 'pump-save-mixture': {
        if (pump.preparation !== 'mix' || !number(pump.quantity) || !number(pump.volume)) {
          notify('Укажи количество препарата и итоговый объём.');
          break;
        }
        const next = clone(database);
        const drug = next.drugs.find(item => item.id === pump.drug);
        if (!drug) break;
        drug.mixtures ??= [];
        if (!drug.mixtures.some(m => m.unit === pump.cUnit && number(m.quantity) === number(pump.quantity) && number(m.volume) === number(pump.volume))) {
          drug.mixtures.push({ quantity:pump.quantity, unit:pump.cUnit, volume:pump.volume });
        }
        if (commit(next)) {
          render(true);
          notify('Разведение сохранено.');
        }
        break;
      }
      case 'previous-card': moveCard(currentIndex() - 1); break;
      case 'next-card': moveCard(currentIndex() + 1); break;
      case 'review': review(); break;
      case 'review-card':
        dialog.close();
        moveCard(Number(value));
        break;
      case 'step-dose': {
        const field = container.querySelector('[data-field="value"]');
        const step = doseStep(row);
        const next = (number(row.value) || 0) + Number(value) * step;
        field.value = new Intl.NumberFormat('ru-RU', { useGrouping:false, maximumSignificantDigits: 15 }).format(next);
        handleField(field);
        break;
      }
      case 'new-patient':
        if (dirty || patientWeight || pump.value || pump.quantity || pump.concentration) {
          promptDialog('Начать новый расчёт?',
            '<p class="subtle space">Масса пациента и правки текущего расчёта будут сброшены.</p>',
            button('Начать расчёт','confirm-new-patient','','class="primary"'));
          break;
        }
        // A clean draft can be reset immediately.
      case 'confirm-new-patient':
        dialog.close();
        patientWeight = '';
        pump = newPump(defaultPumpDrug());
        infusionView = 'calculator';
        loadPlan(draft.id);
        notify('Открыт новый расчёт.');
        break;
      case 'load-scenario': dialog.close(); loadPlan(value); break;
      case 'save-as':
        promptDialog('Сохранить как сценарий',
          `<label class="space">Название<input id="copy-name" value="${esc(draft.name ? draft.name + ' — копия' : '')}" maxlength="120" autofocus></label>
           <p class="subtle space">Расчётная и фактическая масса пациента при сохранении очищаются.</p>`,
          button('Сохранить','confirm-copy','','class="primary"'));
        break;
      case 'confirm-copy': savePlan(true, dialog.querySelector('#copy-name').value); break;
      case 'save-scenario': savePlan(false); break;
      case 'delete-scenario':
        promptDialog('Удалить сценарий?',
          `<p class="space">${esc(draft.name)}</p>`, button('Удалить','confirm-delete-scenario','','class="danger"'));
        break;
      case 'confirm-delete-scenario': {
        const next = clone(database);
        next.scenarios = next.scenarios.filter(item => item.id !== draft.id);
        const committed = commit(next);
        if (!committed) return;
        dialog.close();
        loadPlan(next.scenarios[0]?.id);
        if (committed === true) notify('Сценарий удалён.');
        break;
      }
      case 'add-row':
        draft[value].push(blank(null, value === 'maintenance' ? 'мг/кг/ч' : 'мг/кг'));
        setCard(draft[value].length - 1);
        dirty = true;
        render(true);
        main.querySelector(`[data-stage="${value}"]:last-of-type [data-field="drug"]`)?.focus();
        break;
      case 'up':
      case 'down':
      case 'remove-row': {
        const rows = draft[container.dataset.stage];
        const index = Number(container.dataset.index);
        rows.splice(index, 1);
        if (action === 'remove-row') {
          setCard(Math.max(0, Math.min(currentIndex(), cards().length - 1)));
        } else {
          const offset = action === 'up' ? -1 : 1;
          rows.splice(index + offset, 0, row);
          setCard(currentIndex() + offset);
        }
        dirty = true;
        render();
        break;
      }
      case 'apply-dose': {
        const dose = drugFor(row.drug)?.doses.find(item => item.id === value);
        if (!dose) return;
        if (dimension(units[dose.unit].mass) !== dimension(row.cUnit)) {
          row.cUnit = units[dose.unit].mass;
          row.quantity = '';
          row.concentration = '';
        }
        row.unit = dose.unit;
        row.value = dose.value;
        row.preset = dose.id;
        dirty = true;
        render(true);
        main.querySelector(`[data-stage="${container.dataset.stage}"][data-index="${container.dataset.index}"] [data-field="value"]`)?.focus();
        break;
      }
      case 'drug-reference': {
        const drug = drugFor(value);
        if (!drug) break;
        const body = drug.doses.map(dose => `<div class="reference">
          <p><b>${esc(dose.name)}</b>${dose.value ? ' · ' + esc(dose.value + ' ' + dose.unit) : ''}</p>
          <p class="subtle">${esc(dose.note)} ${link(dose.source)}</p></div>`).join('');
        promptDialog(drug.name, body, '');
        break;
      }
      case 'add-drug':
        editingDrug = { id: uid(), name: '', concentrations: [], doses: [] };
        drugEditor();
        break;
      case 'edit-drug': editingDrug = clone(drugFor(value)); drugEditor(); break;
      case 'add-concentration':
        editingDrug.concentrations.push({ value:'', unit:'мг' });
        drugEditor();
        dialog.querySelector('[data-editor-group="concentrations"]:last-of-type [data-editor="value"]')?.focus();
        break;
      case 'add-dose':
        editingDrug.doses.push({ id:uid(), name:'', value:'', unit:'мг/кг', note:'', source:'' });
        drugEditor();
        [...dialog.querySelectorAll('[data-editor-group="doses"] [data-editor="name"]')].at(-1)?.focus();
        break;
      case 'remove-entry': {
        const group = buttonEl.closest('[data-editor-group]');
        editingDrug[group.dataset.editorGroup].splice(Number(group.dataset.index), 1);
        drugEditor();
        break;
      }
      case 'save-drug': saveDrug(); break;
      case 'delete-drug':
        promptDialog('Удалить препарат?',
          '<p class="subtle space">В сценариях сохранятся строки с его названием, дозой и концентрацией. В справочнике будут удалены препарат и его записи.</p>',
          button('Удалить препарат','confirm-delete-drug','','class="danger"'));
        break;
      case 'confirm-delete-drug': deleteDrug(); break;
      case 'choose-file': main.querySelector('#file').click(); break;
      case 'export': exportSettings(); break;
      case 'import': {
        const committed = commit(pendingImport);
        if (!committed) return;
        pendingImport = null;
        patientWeight = '';
        pump = newPump(infusionDrugs().some(drug => drug.id === pump.drug) ? pump.drug : defaultPumpDrug());
        tab = 'calc';
        dialog.close();
        loadPlan(database.scenarios[0]?.id);
        if (committed === true) notify('Настройки импортированы.');
        break;
      }
      case 'close': dialog.close(); break;
    }
  });
  render();
  if (startupMessage) notify(startupMessage, true);
})();
