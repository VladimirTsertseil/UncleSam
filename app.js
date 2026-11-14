(() => {
  'use strict';
  const { units, number, calculate } = AnesthesiaMath;
  const { fresh, blank, plan } = AnesthesiaCatalog;
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
  const massOptions = selection => ['мг','мкг'].map(mass => option(mass, mass, selection)).join('');

  function validate(data) {
    const string = value => typeof value === 'string';
    const named = item => item && string(item.id) && item.id && string(item.name) && item.name.trim();
    const unique = items => new Set(items.map(item => item.id)).size === items.length;
    const decimal = value => string(value) && (!value.trim() || number(value) !== null);
    const mass = value => ['мг','мкг'].includes(value);
    const list = (items, test) => Array.isArray(items) && items.every(test);
    if (data?.version !== 1 || !list(data.drugs, drug => named(drug) &&
      list(drug.concentrations, c => c && number(c.value) && string(c.value) && mass(c.unit)) &&
      list(drug.doses, d => named(d) && decimal(d.value) && isUnit(d.unit) &&
        string(d.note) && string(d.source) && (!d.source || url(d.source))) && unique(drug.doses)) ||
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
  let database = fresh();
  let startupMessage = '';
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) database = validate(JSON.parse(saved));
  } catch {
    startupMessage = 'Не удалось загрузить настройки браузера. Открыты стартовые шаблоны.';
  }
  const emptyPlan = () => plan('', '', '', []);
  let draft = clone(database.scenarios[0] || emptyPlan());
  let patientWeight = '';
  let tab = 'calc';
  let dirty = false;
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
    main.innerHTML = tab === 'calc' ? renderCalc() : tab === 'drugs' ? renderCatalog() : renderSettings();
    if (tab === 'calc') {
      for (const details of main.querySelectorAll('details[data-key]')) {
        if (opened.has(details.dataset.key)) details.open = true;
      }
      updateResults();
    }
  }
  function renderCalc() {
    const scenarioOptions = option('', 'Новый сценарий', draft.id) + database.scenarios
      .map(scenario => option(scenario.id, scenario.name, draft.id)).join('');
    return `<section class="panel" aria-labelledby="patient-title">
      <div class="bar"><h2 id="patient-title">Пациент и сценарий</h2>
      ${button('Новый пациент','new-patient')}</div>
      <div class="grid weight-grid">
      ${select('Сценарий','scenario',scenarioOptions,'global')}
      ${input('Фактическая масса, кг','patientWeight',patientWeight,numeric,'global')}
      </div>
      ${draft.note ? `<p class="subtle space">${esc(draft.note)} ${link(draft.source)}</p>` : ''}
      <div class="actions space">
        ${button('Сохранить как сценарий','save-as','','class="primary"')}
        ${draft.id ? button('Обновить сценарий','save-scenario') : ''}
        ${draft.id ? button('Удалить сценарий','delete-scenario','','class="danger"') : ''}
      </div>
      <details data-key="scenario-notes"><summary>Название и описание сценария</summary>
      <div class="grid">${input('Название','name',draft.name,' maxlength="120"','global')}
      ${input('Описание','note',draft.note,' maxlength="1000"','global')}</div></details>
      </section>` + Object.entries(stages).map(([stage, title]) =>
        `<section class="stage" aria-labelledby="title-${stage}"><div class="bar">
           <h2 id="title-${stage}">${title}</h2>${button('Добавить строку','add-row',stage)}</div>
           ${stage === 'maintenance' ? renderMethod() : ''}
           ${draft[stage].map((row,index) => renderRow(row, stage, index)).join('')}
         </section>`).join('') + renderReview();
  }
  function renderMethod() {
    return `<div class="grid">
      ${select('Метод','method',Object.entries(methods).map(([id, name]) => option(id,name,draft.method)).join(''),'global')}
      ${draft.method === 'gas' ? input('Анестетик и параметры','gas',draft.gas,' placeholder="Препарат, концентрация или целевая МАК"','global') : ''}
    </div>`;
  }
  function renderReview() {
    return `<details class="panel" data-key="review">
      <summary>Сводка расчётов</summary>
      <div id="review"></div>
    </details>`;
  }
  function renderRow(row, stage, index) {
    const drug = drugFor(row.drug);
    const infusion = units[row.unit].time;
    const weightBased = units[row.unit].weight;
    const key = stage + '-' + index;
    const weightLabel = row.weightRequired ? 'Расчётная масса, кг · требуется' : 'Расчётная масса, кг · по желанию';
    const drugOptions = option('', 'Выбрать препарат', row.drug || '') +
      database.drugs.map(d => option(d.id, d.name, row.drug)).join('');
    const concentrations = drug?.concentrations ?? [];
    const doses = (drug?.doses ?? []).filter(d => units[d.unit].time === infusion && !row.reverse);
    const doseLabel = row.reverse ? 'Скорость насоса, мл/ч' : 'Доза';
    const showWeight = weightBased && row.weightRequired;
    const concentrationName = row.preparation === 'mix' ? 'Единица количества' : 'Единица концентрации';
    const arrows = `<button type="button" data-action="up" aria-label="Выше" ${index === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" data-action="down" aria-label="Ниже" ${index === draft[stage].length-1 ? 'disabled' : ''}>↓</button>`;
    return `<article class="row" data-stage="${stage}" data-index="${index}" aria-label="${esc(drug?.name || row.label || 'Строка расчёта')}">
      <div class="bar"><h3>${esc(drug?.name || row.label || 'Выбор препарата')}</h3>
      <div class="actions">${arrows}${button('Убрать','remove-row','','class="danger"')}</div></div>
      ${row.note ? `<p class="subtle space">${esc(row.note)}</p>` : ''}
      <div class="grid">
        ${select('Препарат','drug',drugOptions)}
        ${stage === 'maintenance' ? select('Введение','kind',option('bolus','Болюс',infusion ? 'infusion' : 'bolus') + option('infusion','Инфузия',infusion ? 'infusion' : 'bolus')) : ''}
        ${input(doseLabel,'value',row.value,numeric)}
        ${select(row.reverse ? 'Единица результата' : 'Единица дозы','unit',unitOptions(row.unit, infusion))}
        ${showWeight ? input(weightLabel,'weight',row.weight,numeric) : ''}
      </div>
      <div class="result"><strong data-answer></strong><small data-math></small></div>
      ${doses.length ? `<details data-key="${key}-doses"><summary>Справочные и сохранённые дозы</summary>
        ${doses.map(d => `<div class="reference"${d.id === row.preset ? ' aria-current="true"' : ''}>
          <p><b>${esc(d.name)}</b>${d.value ? ' · ' + esc(d.value + ' ' + d.unit) : ''}</p>
          <p class="subtle">${esc(d.note)} ${link(d.source)}</p>
          ${d.value ? button('Подставить дозу','apply-dose',d.id) : button('Ввести дозу в ' + d.unit,'apply-dose',d.id)}
        </div>`).join('')}</details>` : ''}
      <details data-key="${key}-prep"${infusion || row.concentration || row.preparation === 'mix' ? ' open' : ''}>
        <summary>${infusion ? 'Настройки инфузии' : 'Концентрация и настройки строки'}</summary>
        <div class="grid">
        ${infusion ? select('Направление расчёта','reverse',option('false','Доза → мл/ч',String(row.reverse)) + option('true','Мл/ч → доза',String(row.reverse))) : ''}
        ${select('Приготовление раствора','preparation',option('direct','Указать концентрацию',row.preparation) + option('mix','Количество и итоговый объём',row.preparation))}
        ${row.preparation === 'direct' && concentrations.length ? select('Сохранённая концентрация','savedConcentration',
          option('','Выбрать или ввести вручную','') + concentrations.map((c,i) => option(String(i), c.value + ' ' + c.unit + '/мл','')).join('')) : ''}
        ${select(concentrationName,'cUnit',massOptions(row.cUnit))}
        ${row.preparation === 'mix' ? input('Количество препарата','quantity',row.quantity,numeric) +
          input('Итоговый объём раствора, мл','volume',row.volume,numeric) : input('Концентрация, ' + row.cUnit + '/мл','concentration',row.concentration,numeric)}
        ${!showWeight && weightBased ? input(weightLabel,'weight',row.weight,numeric) : ''}
        ${select('Правило расчётной массы','weightRequired',
          option('false','Фактическая или указанная',String(row.weightRequired)) +
          option('true','Всегда указывать отдельно',String(row.weightRequired)))}
        ${input('Примечание к строке','note',row.note)}
        ${!drug ? input('Название препарата вручную','label',row.label) : ''}
        </div>
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
    const summaries = { induction: [], maintenance: [] };
    for (const article of main.querySelectorAll('article[data-stage]')) {
      const { stage, index } = article.dataset;
      const row = draft[stage][Number(index)];
      const result = describe(row);
      article.querySelector('[data-answer]').textContent = result.answer;
      article.querySelector('[data-math]').textContent = result.context;
      for (const el of article.querySelectorAll('input[inputmode="decimal"]')) {
        el.setAttribute('aria-invalid', String(Boolean(el.value.trim() && !number(el.value))));
      }
      if (result.ready && (row.drug || row.label)) {
        summaries[stage].push(`<li><b>${esc(drugFor(row.drug)?.name || row.label)}</b> · ${esc(result.answer)}
          <br><span class="subtle">${esc(result.context)}</span></li>`);
      }
    }
    const patient = main.querySelector('[data-global="patientWeight"]');
    patient.setAttribute('aria-invalid', String(Boolean(patientWeight.trim() && !number(patientWeight))));
    main.querySelector('#review').innerHTML = Object.keys(stages).map(stage =>
      `<h3 class="space">${stages[stage]}</h3>${
        stage === 'maintenance' && draft.method !== 'none'
        ? `<p class="subtle">${esc(methods[draft.method])}${draft.method === 'gas' && draft.gas ? ' · ' + esc(draft.gas) : ''}</p>` : ''
      }${summaries[stage].length ? '<ul>' + summaries[stage].join('') + '</ul>' : '<p class="subtle">Пока нет рассчитанных строк.</p>'}`
    ).join('');
  }
  function renderCatalog() {
    return `<div class="bar"><h2>Справочник препаратов</h2>
      ${button('Добавить препарат','add-drug','','class="primary"')}</div>` + database.drugs.map(drug =>
      `<section class="row"><div class="bar"><h3>${esc(drug.name)}</h3>
      ${button('Редактировать','edit-drug',drug.id)}</div>
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
    } else if (field === 'savedConcentration' && el.value !== '') {
      const found = drugFor(row.drug)?.concentrations[Number(el.value)];
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
        row.value = '';
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
    }
    if (el.tagName === 'SELECT') render(true);
    else updateResults();
  }
  function loadPlan(id) {
    draft = clone(database.scenarios.find(item => item.id === id) || emptyPlan());
    dirty = false;
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
  main.addEventListener('input', event => {
    const el = event.target;
    if (el.tagName === 'SELECT' || el.type === 'file') return;
    const global = el.dataset.global;
    if (global === 'patientWeight') {
      patientWeight = el.value;
      updateResults();
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
        pendingImport = validate(JSON.parse(await file.text()));
        promptDialog('Заменить настройки?',
          `<p class="subtle space">В файле препаратов: ${pendingImport.drugs.length}, сценариев: ${pendingImport.scenarios.length}. Импорт заменит текущие препараты и сценарии.</p>`,
          button('Импортировать','import','','class="primary"'));
      } catch (error) {
        notify(error instanceof SyntaxError ? 'Файл не удалось прочитать как JSON.' : error.message, true);
      }
      return;
    }
    if (el.tagName !== 'SELECT') return;
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
      case 'new-patient':
        if (dirty) {
          promptDialog('Начать новый расчёт?',
            '<p class="subtle space">Масса пациента и правки текущего расчёта будут сброшены.</p>',
            button('Начать расчёт','confirm-new-patient','','class="primary"'));
          break;
        }
        // A clean draft can be reset immediately.
      case 'confirm-new-patient':
        dialog.close();
        patientWeight = '';
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
        draft[value].push(blank());
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
        if (action !== 'remove-row') rows.splice(index + (action === 'up' ? -1 : 1), 0, row);
        dirty = true;
        render();
        break;
      }
      case 'apply-dose': {
        const dose = drugFor(row.drug)?.doses.find(item => item.id === value);
        if (!dose) return;
        row.unit = dose.unit;
        row.value = dose.value;
        row.preset = dose.id;
        dirty = true;
        render(true);
        main.querySelector(`[data-stage="${container.dataset.stage}"][data-index="${container.dataset.index}"] [data-field="value"]`)?.focus();
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
