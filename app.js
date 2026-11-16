(() => {
  'use strict';
  const { units, number, calculate, scales, dimension } = AnesthesiaMath;
  const { fresh, upgrade, blank, plan } = AnesthesiaCatalog;
  const body = AnesthesiaBodyMass;
  const storageKey = 'anesthesia-calculator-v1';
  const main = document.querySelector('#main');
  const dialog = document.querySelector('#dialog');
  const preop = AnesthesiaPreop.create(dialog);
  const status = document.querySelector('#status');
  const nav = document.querySelector('#nav');
  const inhalation = AnesthesiaInhalation.create();
  const epidural = AnesthesiaEpidural.create();
  const nerveBlock = AnesthesiaNerveBlock.create();
  const calculators = AnesthesiaCalculators.create(main, [
    { label: 'Предоперационные', cards: AnesthesiaRiskCalculators },
    { label: 'Критические состояния', cards: AnesthesiaCriticalCalculators }
  ], () => patientProfile());
  const templates = AnesthesiaTemplates.create(main);
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
      (row.weightMode === undefined || ['recommended','actual','ideal','adjusted','lean','manual'].includes(row.weightMode)) &&
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
  let patientHeight = '';
  let patientSex = '';
  let patientCollapsed = false;
  const patientProfile = () => body.calculate({weight:patientWeight,height:patientHeight,sex:patientSex});
  const massText = amount => amount === null || !Number.isFinite(amount) ? '—' : body.fmt(amount) + ' кг';
  function massSummary() {
    const p = patientProfile();
    const massItem = (short, full, value) => `<div class="patient-mass-item" title="${esc(full)}">
      <span class="patient-mass-name">${esc(short)}</span>
      <strong class="patient-mass-value">${massText(value)}</strong>
    </div>`;
    return `<div class="patient-mass-summary" aria-live="polite" aria-label="Расчётные массы пациента">
      <div class="patient-mass-strip">
        ${massItem('ФМТ', 'Фактическая масса тела', p.actual)}
        ${massItem('ИдМТ', 'Идеальная масса тела', p.ideal)}
        ${massItem('СкМТ', 'Скорректированная масса тела', p.adjusted)}
        ${massItem('ТМТ', 'Тощая масса тела', p.lean)}
      </div>
      ${p.bmi !== null ? `<div class="patient-bmi">ИМТ <b>${body.fmt(p.bmi)} кг/м²</b></div>` : ''}
    </div>`;
  }
  let selectedMethod = 'gas';
  const spinalDefaults = { baricity: '', concentration: '', direction: 'dose', amount: '' };
  let spinal = { ...spinalDefaults };
  let tab = 'calc';
  let drugSection = 'preop';
  let dirty = false;
  let activeCard = 0;
  let infusionCard = 0;
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
    const working = tab === 'calc' || tab === 'pump';
    if (working) main.innerHTML = patientPanel() + renderCalc() + renderPatientReset();
    else if (tab === 'methods') main.innerHTML = renderMethods() + renderPatientReset();
    else if (tab === 'calculators') main.innerHTML = patientPanel(false) + calculators.markup() + renderPatientReset();
    else if (tab === 'templates') main.innerHTML = templates.markup();
    else if (tab === 'info') main.innerHTML = AnesthesiaAbout.markup();
    else main.innerHTML = renderDrugSections();
    if (tab === 'drugs' && drugSection === 'preop') preop.mount();
    inhalation.refresh(main);
    epidural.refresh(main);
    if (tab === 'methods' && selectedMethod === 'block') nerveBlock.refresh(main, patientWeight);
    if (tab === 'methods' && selectedMethod === 'spinal') updateSpinal();
    if (working) {
      for (const details of main.querySelectorAll('details[data-key]')) {
        if (opened.has(details.dataset.key)) details.open = true;
      }
      updateResults();
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
    render(true);
  }
  function patientPanel(withScenario = true) {
    const scenarioOptions = option('', 'Новый сценарий', draft.id) + database.scenarios
      .map(scenario => option(scenario.id, scenario.name, draft.id)).join('');
    const summary = [
      patientWeight ? patientWeight.replace(',', '.') + ' кг' : '',
      patientHeight ? patientHeight.replace(',', '.') + ' см' : '',
      patientSex === 'male' ? 'Муж.' : patientSex === 'female' ? 'Жен.' : ''
    ].filter(Boolean).join(' · ');
    return `<section class="patient-panel shared-patient${patientCollapsed ? ' is-collapsed' : ''}" aria-label="Текущий пациент">
      <div class="patient-panel-heading">
        <strong>${patientCollapsed ? 'Пациент' : 'Данные пациента'}</strong>
        ${patientCollapsed && summary ? `<span class="patient-panel-preview">${esc(summary)}</span>` : ''}
        ${button(patientCollapsed ? '+' : '−','toggle-patient','',`class="patient-collapse" aria-expanded="${!patientCollapsed}" aria-label="${patientCollapsed ? 'Развернуть данные пациента' : 'Свернуть данные пациента'}" title="${patientCollapsed ? 'Развернуть' : 'Свернуть'}"`)}
      </div>
      ${patientCollapsed ? '' : `
        ${withScenario ? `<div class="patient-scenario-row">${select('Сценарий','scenario',scenarioOptions,'global')}</div>` : ''}
        <div class="grid patient-anthropometry">
          ${input('Вес, кг','patientWeight',patientWeight,numeric,'global')}
          ${input('Рост, см','patientHeight',patientHeight,numeric,'global')}
          ${select('Пол','patientSex',
            option('', '—', patientSex) + option('male','Муж.',patientSex) + option('female','Жен.',patientSex),'global')}
        </div>
        <div data-patient-mass-summary>${massSummary()}</div>
        ${withScenario ? renderScenarioTools() : ''}
      `}
    </section>`;
  }
  function renderPatientReset() {
    return `<div class="patient-reset">${button('Новый пациент','new-patient')}</div>`;
  }
  function renderMethods() {
    const choices = option('gas','Ингаляционная анестезия',selectedMethod) +
      option('spinal','Спинальная анестезия',selectedMethod) +
      option('epidural','Эпидуральная анестезия',selectedMethod) +
      option('block','Проводниковая анестезия',selectedMethod);
    const picker = select('Метод','method',choices,'methods');
    if (selectedMethod === 'gas') return picker + inhalation.markup();
    if (selectedMethod === 'epidural') return picker + epidural.markup();
    if (selectedMethod === 'block') return picker + nerveBlock.markup(
      '<div class="space">' + input('Масса, кг','patientWeight',patientWeight,numeric,'global') + '</div>');
    return picker + `
      <section class="panel space gas-method">
        <h2>Бупивакаин</h2>
        <p class="subtle space">Используй концентрацию с упаковки формы для интратекального введения.</p>
        <div class="gas-grid space">
          ${select('Баричность','baricity',
            option('','Выбрать',spinal.baricity) + option('hyper','Гипербарический',spinal.baricity) +
            option('iso','Изобарический',spinal.baricity),'spinal')}
          ${input('Концентрация, мг/мл','concentration',spinal.concentration,numeric,'spinal')}
          ${select('Пересчёт','direction',option('dose','мг → мл',spinal.direction) +
            option('volume','мл → мг',spinal.direction),'spinal')}
          ${input(spinal.direction === 'dose' ? 'Выбранная доза, мг' : 'Объём, мл',
            'amount',spinal.amount,numeric,'spinal')}
        </div>
        <div class="result"><strong data-spinal-result role="status"></strong></div>
      </section>`;
  }
  function updateSpinal() {
    const concentration = number(spinal.concentration);
    const amount = number(spinal.amount);
    const fromDose = spinal.direction === 'dose';
    const result = concentration && amount && (fromDose ? amount / concentration : amount * concentration);
    main.querySelector('[data-spinal-result]').textContent = result
      ? fmt(result) + (Number.isFinite(result) ? (fromDose ? ' мл' : ' мг') : '')
      : 'Укажи концентрацию и ' + (fromDose ? 'дозу' : 'объём');
    for (const field of main.querySelectorAll('input[data-spinal]')) {
      field.setAttribute('aria-invalid', String(Boolean(field.value.trim() && !number(field.value))));
    }
  }
  function renderCalc() {
    const deck = cards();
    const index = currentIndex();
    const stage = currentStage();
    const maintenance = stage === 'maintenance';
    const card = deck[index];
    return `
      <section class="deck${maintenance ? ' infusion-deck' : ''}" aria-label="Карточки препаратов" data-deck>
        ${card || maintenance ? `<div class="deck-toolbar">
          ${card ? `<div class="deck-header">
            <button type="button" data-action="previous-card" aria-label="Предыдущий препарат" ${index === 0 ? 'disabled' : ''}>‹</button>
            <p role="status"><span>${index+1} / ${deck.length}</span></p>
            <button type="button" data-action="next-card" aria-label="Следующий препарат" ${index + 1 === deck.length ? 'disabled' : ''}>›</button>
          </div>` : ''}
          ${maintenance ? `<div class="deck-tools">
            ${button('+','add-row',stage,'aria-label="Добавить инфузию" title="Добавить инфузию"')}
            ${card ? button('×','remove-row','','aria-label="Убрать текущую карточку" title="Убрать текущую карточку"') : ''}
          </div>` : ''}
        </div>` : ''}
        ${card ? renderRow(card.row, card.stage, card.index)
          : maintenance ? '' : `<div class="panel">${button('Добавить первый препарат','add-row',stage)}</div>`}
      </section>
      <div class="deck-actions">
        ${button('Итог','review','','class="primary"')}
      </div>`;
  }
  function renderScenarioTools() {
    const stage = currentStage();
    return `<details class="scenario-tools" data-key="scenario-tools">
      <summary aria-label="Настроить сценарий" title="Настроить сценарий">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
          <path d="M4 7h6m4 0h6M4 17h10m4 0h2"/>
          <circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>
        </svg>
      </summary>
      <div class="panel scenario-editor">
        ${draft.note ? `<p class="subtle">${esc(draft.note)} ${link(draft.source)}</p>` : ''}
        <div class="grid">${input('Название','name',draft.name,' maxlength="120"','global')}
        ${input('Описание','note',draft.note,' maxlength="1000"','global')}</div>
        ${stage === 'maintenance' ? renderMethod() : ''}
        <div class="actions space">
          ${button('Добавить препарат','add-row',stage)}
          ${button('Сохранить как сценарий','save-as')}
          ${draft.id ? button('Обновить сценарий','save-scenario') : ''}
          ${draft.id ? button('Удалить сценарий','delete-scenario','','class="danger"') : ''}
        </div>
      </div>
    </details>`;
  }
  function renderMethod() {
    return `<div class="grid">
      ${select('Метод','method',Object.entries(methods).map(([id, name]) => option(id,name,draft.method)).join(''),'global')}
      ${draft.method === 'gas' ? input('Анестетик и параметры','gas',draft.gas,' placeholder="Препарат, концентрация или целевая МАК"','global') : ''}
    </div>`;
  }
  function rowMassMode(row) { return row.weightMode || 'recommended'; }
  function rowMass(row, stage) {
    const profile = patientProfile();
    const rule = body.forDrug(row.drug, stage, profile);
    const mode = rowMassMode(row);
    if (mode === 'manual') return number(row.weight);
    if (profile.actual === null) return null;
    // Если врач явно выбрал ФМТ, рост и пол для умножения на кг не требуются.
    if (mode === 'actual') return profile.actual;
    // Автоподбор при неизвестном росте/поле может ошибочно классифицировать ожирение.
    if (profile.height === null || !profile.sex) return null;
    return body.choose(profile, mode, rule.mode);
  }
  function calculateDrugRow(row, stage) {
    const weight = rowMass(row, stage);
    const manual = rowMassMode(row) === 'manual';
    // Игнорируем прежнее поле weight, если выбран один из автоматически рассчитываемых видов массы.
    return calculate({...row,weight:manual ? row.weight : ''}, weight ?? '');
  }
  function massPickerMarkup(row,stage) {
    const profile = patientProfile();
    const rule = body.forDrug(row.drug,stage,profile);
    const mode = rowMassMode(row);
    const selectedMode = mode === 'recommended' ? rule.mode : mode;
    const selectedMass = rowMass(row,stage);
    const rec = body.labels[rule.mode] || 'Фактическая (ФМТ)';
    const opts = option('recommended',(rule.uncertain ? 'Начальный вариант (не рекомендация): ' : 'Рекомендуемая: ') + rec,mode) +
      body.modes.map(([key,label]) => option(key,label + ' · ' + massText(profile[key]),mode)).join('') +
      option('manual','Ввести массу вручную',mode);
    return `<details class="mass-disclosure" data-key="${stage}-${currentIndex()}-mass" data-mass-widget>
      <summary class="mass-trigger" aria-label="Настроить массу для расчёта дозы" title="Масса для расчёта дозы">
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3v17M5 6h14M5 6l-3 7h6L5 6ZM19 6l-3 7h6l-3-7ZM8 20h8"/>
        </svg>
      </summary>
      <div class="mass-widget mass-popover">
        ${select('Масса для расчёта дозы','weightMode',opts)}
        <p class="mass-current">Используется: <b>${mode==='manual' ? 'введённая вручную' : esc(body.labels[selectedMode])} · ${massText(selectedMass)}</b></p>
        <p class="subtle mass-advice">${esc(rule.note)}</p>
        ${profile.obese && row.drug === 'roc' && (row.preset === 'roc-rsi' || draft.id === 'rsi') ?
          `<p class="subtle mass-advice">При быстрой последовательной индукции у пациентов с ожирением руководство SOBA (2025) приводит отдельный пример: 1,2 мг/кг по тощей массе, чтобы обеспечить быстрое наступление блока. Это не автоматическая замена режима по инструкции Эсмерона. ${link('https://doi.org/10.1111/anae.16647')}</p>` : ''}
        ${profile.obese && row.drug === 'roc' ?
          `<p class="subtle mass-advice">В этом приложении идеальная масса вычисляется по Devine; в методических рекомендациях ФАР (2021) используется упрощённая формула по росту. Значения могут отличаться.</p>` : ''}
        ${profile.obese && !rule.uncertain ?
          `<p class="subtle mass-advice">${link(row.drug === 'remi'
            ? 'https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/9110/characteristic'
            : 'https://intensive-care.ru/index.php/acc/article/download/230/2362?inline=1')}</p>` : ''}
        ${mode === 'manual' ? input('Масса вручную, кг','weight',row.weight,numeric) : ''}
        ${row.note ? `<p class="subtle mass-advice">${esc(row.note)}</p>` : ''}
      </div>
    </details>`;
  }
  function updatePatientMassView() {
    const summary = main.querySelector('[data-patient-mass-summary]');
    if (summary) summary.innerHTML = massSummary();
    const article = main.querySelector('article[data-stage]');
    const widget = article?.querySelector('[data-mass-widget]');
    if (widget) {
      const wasOpen = widget.open;
      widget.outerHTML = massPickerMarkup(rowFrom(article), article.dataset.stage);
      if (wasOpen) article.querySelector('[data-mass-widget]').open = true;
    }
  }
  function renderRow(row, stage, index) {
    const drug = drugFor(row.drug);
    const infusion = units[row.unit].time;
    const weightBased = units[row.unit].weight;
    const key = stage + '-' + index;
     const drugPicker = button(drug?.name || 'Выбрать препарат','open-drug-picker','',
      'class="drug-picker-trigger" aria-haspopup="dialog"');
    const mixtures = infusion ? (drug?.mixtures ?? []).filter(m => dimension(m.unit) === dimension(units[row.unit].mass)) : [];
    const concentrations = (drug?.concentrations ?? []).filter(c => dimension(c.unit) === dimension(units[row.unit].mass));
    const doses = (drug?.doses ?? []).filter(d => !d.referenceOnly && units[d.unit].time === infusion && !row.reverse);
    const doseLabel = row.reverse ? 'Скорость, мл/ч' : 'Доза';
    const quickConcentration = row.preparation === 'direct' && concentrations.length > 0
      ? select('Концентрация','savedConcentration',
        option('', 'Выбрать', '') +
        concentrations.map((c,i) => option(String(i), c.value + ' ' + c.unit + '/мл', '')).join(''))
      : '';
    const preparationOptions = option('mix','Количество и объём',row.preparation) +
      option('direct','Концентрация на мл',row.preparation);
    const concentrationUnits = massOptions(row.cUnit, Object.keys(scales).filter(unit =>
      dimension(unit) === dimension(units[row.unit].mass)));
    const concentrationName = row.preparation === 'mix' ? 'Единица количества' : 'Единица концентрации';
    const arrows = `<button type="button" data-action="up" aria-label="Выше" ${index === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" data-action="down" aria-label="Ниже" ${index === draft[stage].length-1 ? 'disabled' : ''}>↓</button>`;
    return `<article class="row${infusion ? ' infusion-card' : ''}" data-stage="${stage}" data-index="${index}" aria-label="${esc(drug?.name || row.label || 'Строка расчёта')}">
      <div class="card-title">
        <h2>${esc(drug?.name || row.label || 'Выбор препарата')}</h2>
        <div class="card-title-actions">
          ${infusion ? button('⇄','flip-infusion','',row.reverse
            ? 'class="infusion-flip" aria-label="Ввод дозы" title="Ввод дозы"'
            : 'class="infusion-flip" aria-label="Ввод скорости в мл/ч" title="Ввод скорости в мл/ч"') : ''}
          ${weightBased ? massPickerMarkup(row,stage) : ''}
        </div>
      </div>
      ${!drug && !row.label ? `<div class="space">${drugPicker}</div>` : ''}
      <div class="dose-line space">
        <div>
          <label for="card-dose">${doseLabel}</label>
          <div class="stepper">
            <button type="button" data-action="step-dose" value="-1" aria-label="${row.reverse ? 'Уменьшить скорость' : 'Уменьшить дозу'}">−</button>
            <input id="card-dose" data-field="value" value="${esc(row.value)}"${numeric}>
            <button type="button" data-action="step-dose" value="1" aria-label="${row.reverse ? 'Увеличить скорость' : 'Увеличить дозу'}">+</button>
          </div>
        </div>
        ${select(infusion ? 'Единица дозы' : 'Единица','unit',unitOptions(row.unit, infusion))}
      </div>
      ${infusion ? `<div class="infusion-preparation space">
        ${select('Разведение','preparation',preparationOptions)}
        ${row.preparation === 'mix' ? `<div class="mixture-fields">
          <div class="mixture-amount">
            ${input('Количество','quantity',row.quantity,numeric)}
            ${select('Единица','cUnit',concentrationUnits)}
          </div>
          ${input('Итоговый объём, мл','volume',row.volume,numeric)}
        </div>` : quickConcentration || `<div class="mixture-fields direct-fields">
          ${input('Концентрация, ' + row.cUnit + '/мл','concentration',row.concentration,numeric)}
          ${select('Единица','cUnit',concentrationUnits)}
        </div>`}
      </div>` : quickConcentration ? `<div class="quick-concentration space">${quickConcentration}</div>` : ''}
      ${mixtures.length ? `<div class="quick-concentration space">${select('Сохранённое разведение','mixture',option('', 'Выбрать', '') +
        mixtures.map((m,i) => option(String(i), m.quantity + ' ' + m.unit + ' / ' + m.volume + ' мл', '')).join(''))}</div>` : ''}
      <div class="result"><strong data-answer></strong><small data-math hidden></small></div>
      <p class="dose-safety-note" data-dose-safety role="note" hidden></p>
      ${doses.length ? `<details data-key="${key}-doses"><summary>Справочные и сохранённые дозы</summary>
        ${doses.map(d => `<div class="reference"${d.id === row.preset ? ' aria-current="true"' : ''}>
          <p><b>${esc(d.name)}</b>${d.value ? ' · ' + esc(d.value + ' ' + d.unit) : ''}</p>
          <p class="subtle">${esc(d.note)} ${link(d.source)}</p>
          ${d.value ? button('Подставить дозу','apply-dose',d.id) : button('Ввести дозу в ' + d.unit,'apply-dose',d.id)}
        </div>`).join('')}</details>` : ''}
      <details data-key="${key}-prep">
        <summary>Настроить карточку</summary>
        <div class="grid">
        ${!infusion ? select('Приготовление раствора','preparation',preparationOptions) : ''}
        ${drug || row.label ? drugPicker : ''}
        ${stage === 'maintenance' ? select('Введение','kind',option('bolus','Болюс',infusion ? 'infusion' : 'bolus') + option('infusion','Инфузия',infusion ? 'infusion' : 'bolus')) : ''}
        ${!infusion || quickConcentration ? select(concentrationName,'cUnit',concentrationUnits) : ''}
        ${!infusion && row.preparation === 'mix' ? input('Количество препарата','quantity',row.quantity,numeric) +
          input('Итоговый объём раствора, мл','volume',row.volume,numeric) : (!infusion || quickConcentration)
            ? input('Концентрация, ' + row.cUnit + '/мл','concentration',row.concentration,numeric) : ''}
         ${input('Примечание к строке','note',row.note)}
        ${!drug ? input('Название препарата вручную','label',row.label) : ''}
        </div>
        <div class="actions space">${infusion && drug && row.preparation === 'mix' ? button('Сохранить разведение','save-row-mixture') : ''}${arrows}${stage === 'induction' ? button('Убрать','remove-row','','class="danger"') : ''}</div>
      </details>
    </article>`;
  }
  function doseSafetyNotice(row, stage) {
    if (stage === 'induction' && row.drug === 'fent') {
      const result = calculateDrugRow(row, stage);
      const amountMcg = Number.isFinite(result.amount)
        ? result.amount * (units[row.unit].mass === 'мг' ? 1000 : 1) : null;
      // Российская инструкция описывает типовую вводную анестезию 100–200 мкг,
      // а не абсолютный предел фентанила для всех хирургических ситуаций.
      if (amountMcg !== null && amountMcg > 200)
        return 'Внимание: сумма превышает 200 мкг. Российская инструкция Эндофарм для вводной анестезии описывает 100–200 мкг; другие режимы могут отличаться. Проверьте выбранное показание и обоснование дозы.';
    }
    return '';
  }
  function describe(row) {
    const unit = units[row.unit];
    const result = calculateDrugRow(row, currentStage());
    const { value, weight, rawConcentration, concentration, amount, answer } = result;
    const c = concentration && Number.isFinite(concentration)
      ? fmt(rawConcentration) + ' ' + row.cUnit + '/мл' : '';
    const context = [unit.weight && weight ? fmt(weight) + ' кг' : '', c].filter(Boolean).join(' · ');
    if (!value) return { answer: 'Введите ' + (row.reverse ? 'скорость насоса' : 'дозу'), context };
    if (unit.weight && !weight) return { answer: 'Укажите фактическую массу, рост и пол или выберите ручной ввод массы', context };
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
      const answer = article.querySelector('[data-answer]');
      answer.textContent = result.answer;
      answer.parentElement.classList.toggle('has-value', Boolean(result.ready));
      article.querySelector('[data-math]').textContent = result.context;
      article.querySelector('[data-math]').hidden = !result.ready || !calculateDrugRow(row, currentStage()).rawConcentration;
      const safety = article.querySelector('[data-dose-safety]');
      if (safety) {
        const notice = doseSafetyNotice(row, currentStage());
        safety.textContent = notice;
        safety.hidden = !notice;
      }
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
    patient?.setAttribute('aria-invalid', String(Boolean(patientWeight.trim() && !number(patientWeight))));
  }
  function doseStep(row) {
    if (row.reverse) return 0.1;
    if (units[row.unit].weight) return row.unit.endsWith('/кг/мин') ? 0.01 : 0.1;
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
      ${content || '<p class="space">Нет препаратов для расчёта.</p>'}`;
    dialog.setAttribute('aria-labelledby','dialog-title');
    dialog.showModal();
  }
  function renderDrugSections() {
    const sectionButton = (title, key) => button(title, 'drug-section', key,
      drugSection === key ? 'aria-current="true"' : '');
    return `<div class="drug-sections" role="group" aria-label="Разделы препаратов">
      ${sectionButton('Перед операцией', 'preop')}
      ${sectionButton('Индукция и инфузии', 'catalog')}
      </div>` + (drugSection === 'preop' ? preop.markup() : renderCatalog());
  }
  function renderCatalog() {
    return `<div class="bar space"><h2>Справочник препаратов</h2>
      ${button('Добавить препарат','add-drug','','class="primary"')}</div>` + database.drugs.map(drug =>
      `<section class="row"><div class="bar"><h3>${esc(drug.name)}</h3>
      <div class="actions">${drug.doses.length ? button('Справочник','drug-reference',drug.id) : ''}
      ${button('Редактировать','edit-drug',drug.id)}</div></div>
      <p class="subtle">${drug.concentrations.map(c => esc(c.value + ' ' + c.unit + '/мл')).join(' · ')}
      ${drug.doses.length ? (drug.concentrations.length ? ' · ' : '') + drug.doses.length + ' справочных записей' : ''}</p></section>`
    ).join('') + renderBackup();
  }
  function renderBackup() {
    return `<section class="panel space" aria-labelledby="backup-title"><h2 id="backup-title">Резервная копия</h2>
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
        // Не переносим в шаблон персональную ручную массу без её значения.
        if (row.weightMode === 'manual') row.weightMode = 'recommended';
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
  function chooseDrug(row, id) {
    if (row.drug === id) return;
    const previous = { weightRequired: row.weightRequired };
    const dose = units[row.unit].time && drugFor(id)?.doses.find(d => !d.referenceOnly && units[d.unit].time);
    const next = blank(id || null, dose ? dose.unit : row.unit);
    if (units[next.unit].time) {
      const family = dimension(units[next.unit].mass);
      if (!drugFor(id)?.concentrations.some(c => dimension(c.unit) === family)) {
        next.preparation = 'mix';
        next.cUnit = family === 'ммоль' ? 'ммоль' : 'мг';
      }
    }
    Object.assign(row, next, previous);
    dirty = true;
    render(true);
  }
  function renderDrugChoices(query = '') {
    const normalize = value => value.toLocaleLowerCase('ru').replaceAll('ё','е').trim();
    const names = database.drugs.filter(drug => normalize(drug.name).includes(normalize(query)));
    dialog.querySelector('#drug-choices').innerHTML = names.length
      ? names.map(drug => button(drug.name,'choose-drug',drug.id)).join('')
      : '<p role="status" class="subtle">Препараты не найдены.</p>';
  }
  function handleField(el) {
    const row = rowFrom(el);
    const field = el.dataset.field;
    if (!row || !field) return;
    dirty = true;
    if (field === 'weightRequired') {
      row.weightRequired = el.value === 'true';
    } else if (field === 'kind') {
      row.unit = units[row.unit].mass + (units[row.unit].weight ? '/кг' : '') + (el.value === 'infusion' ? '/ч' : '');
      row.value = '';
      row.reverse = false;
      row.preset = '';
    } else if (field === 'mixture') {
      if (el.value === '') return;
      const mixture = drugFor(row.drug)?.mixtures?.filter(m => dimension(m.unit) === dimension(units[row.unit].mass))[Number(el.value)];
      if (!mixture) return;
      Object.assign(row, { preparation:'mix', cUnit:mixture.unit, quantity:mixture.quantity, volume:mixture.volume, concentration:'' });
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
  main.addEventListener('click', event => {
    if (tab !== 'methods') return;
    if (selectedMethod === 'gas') inhalation.click(event, main);
    if (selectedMethod === 'epidural') epidural.click(event, main);
    if (selectedMethod === 'block') {
      const control = event.target.closest('[data-block-action]');
      if (!control || control.disabled) return;
      const focus = nerveBlock.click(control);
      if (focus) {
        render();
        const field = main.querySelector(focus);
        field?.focus({ preventScroll: true });
        if (control.dataset.blockAction === 'add') field?.scrollIntoView({ block: 'nearest' });
      }
    }
  });
  main.addEventListener('input', event => {
    const el = event.target;
    if (el.dataset.global === 'patientWeight' || el.dataset.global === 'patientHeight') {
      if (el.dataset.global === 'patientWeight') patientWeight = el.value;
      else patientHeight = el.value;
      updatePatientMassView();
      if (tab === 'calculators') calculators.patientChanged();
      else if (tab === 'calc' || tab === 'pump') updateResults();
      else if (tab === 'methods' && selectedMethod === 'block') nerveBlock.refresh(main, patientWeight);
      return;
    }
    if (tab === 'calculators' || tab === 'templates') return;
    if (el.id === 'preop-query') {
      preop.input(el.value);
      return;
    }
    if (tab === 'methods') {
      if (selectedMethod === 'block' && el.tagName === 'INPUT') {
        if (el.dataset.global === 'patientWeight') patientWeight = el.value;
        else nerveBlock.edit(el);
        nerveBlock.refresh(main, patientWeight);
      } else if (selectedMethod === 'epidural' && el.tagName === 'INPUT' && el.type !== 'checkbox') {
        epidural.input(el, main);
      } else if (el.dataset.spinal && el.tagName === 'INPUT') {
        spinal[el.dataset.spinal] = el.value;
        updateSpinal();
      } else if (selectedMethod === 'gas') inhalation.input(el);
      return;
    }
    if (el.tagName === 'SELECT' || el.type === 'file') return;
    const global = el.dataset.global;
    if (global) {
      draft[global] = el.value;
      dirty = true;
      updateResults();
    } else handleField(el);
  });
  main.addEventListener('change', async event => {
    const el = event.target;
    if (el.dataset.global === 'patientSex') {
      patientSex = el.value;
      render(true);
      return;
    }
    if (el.dataset.global === 'patientWeight' || el.dataset.global === 'patientHeight') {
      render(true);
      return;
    }
    if (tab === 'calculators' || tab === 'templates') return;
    if (tab === 'methods') {
      if (el.dataset.methods === 'method') {
        selectedMethod = el.value;
        render();
        main.querySelector('[data-methods="method"]').focus({ preventScroll: true });
      } else if (selectedMethod === 'block' && el.dataset.blockField && el.tagName === 'SELECT') {
        if (nerveBlock.edit(el)) {
          const row = el.closest('[data-block-row]');
          const cleared = el.dataset.blockField === 'drug' ? ['stock'] : ['adjunctStock', 'adjunctDrawn'];
          for (const key of cleared) row.querySelector(`[data-block-field="${key}"]`).value = '';
        }
        nerveBlock.refresh(main, patientWeight);
      } else if (selectedMethod === 'epidural' && (el.tagName === 'SELECT' || el.type === 'checkbox')) {
        epidural.input(el, main);
      } else if (el.dataset.spinal && el.tagName === 'SELECT') {
        spinal[el.dataset.spinal] = el.value;
        if (el.dataset.spinal === 'direction') spinal.amount = '';
        render();
        main.querySelector(`[data-spinal="${el.dataset.spinal}"]`).focus({ preventScroll: true });
      } else if (selectedMethod === 'gas' && el.tagName === 'SELECT') inhalation.input(el);
      return;
    }
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
    if (el.id === 'drug-search') {
      renderDrugChoices(el.value);
      return;
    }
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
      case 'toggle-patient':
        patientCollapsed = !patientCollapsed;
        render(true);
        break;
      case 'drug-section':
        if (tab !== 'drugs' || value === drugSection || !['preop', 'catalog'].includes(value)) break;
        drugSection = value;
        render();
        main.querySelector('[data-action="drug-section"][aria-current]')?.focus({ preventScroll: true });
        break;
      case 'preop-card':
        preop.open(value);
        break;
      case 'preop-browse':
        preop.open();
        break;
      case 'preop-retry':
        preop.retry();
        break;
      case 'flip-infusion': {
        if (!row || !units[row.unit].time) break;
        const { answer } = calculateDrugRow(row, currentStage());
        row.reverse = !row.reverse;
        row.value = Number.isFinite(answer) && answer > 0
          ? new Intl.NumberFormat('ru-RU',{ useGrouping:false, maximumSignificantDigits:15 }).format(answer) : '';
        row.preset = '';
        dirty = true;
        render(true);
        break;
      }
      case 'save-row-mixture': {
        if (!row?.drug || !number(row.quantity) || !number(row.volume)) {
          notify('Укажи количество препарата и итоговый объём.');
          break;
        }
        const next = clone(database);
        const drug = next.drugs.find(item => item.id === row.drug);
        drug.mixtures ??= [];
        if (!drug.mixtures.some(m => m.unit === row.cUnit && number(m.quantity) === number(row.quantity) && number(m.volume) === number(row.volume))) {
          drug.mixtures.push({ quantity:row.quantity, unit:row.cUnit, volume:row.volume });
        }
        const committed = commit(next);
        if (committed) render(true);
        if (committed === true) notify('Разведение сохранено.');
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
        if (dirty || patientWeight || patientHeight || patientSex || inhalation.hasData() || epidural.hasData() || nerveBlock.hasData() || calculators.hasData() ||
            spinal.concentration || spinal.amount || spinal.baricity) {
          promptDialog('Начать новый расчёт?',
            '<p class="subtle space">Данные пациента, текущие расчёты и журнал расхода будут сброшены.</p>',
            button('Начать расчёт','confirm-new-patient','','class="primary"'));
          break;
        }
        // A clean draft can be reset immediately.
      case 'confirm-new-patient':
        dialog.close();
        patientWeight = '';
        patientHeight = '';
        patientSex = '';
        patientCollapsed = false;
        inhalation.reset();
        epidural.reset();
        nerveBlock.reset();
        calculators.reset();
        spinal = { ...spinalDefaults };
        loadPlan(draft.id);
        main.scrollIntoView({ block: 'start' });
        notify('Открыт новый расчёт.');
        break;
      case 'load-scenario': dialog.close(); loadPlan(value); break;
      case 'save-as':
        promptDialog('Сохранить как сценарий',
          `<label class="space">Название<input id="copy-name" value="${esc(draft.name ? draft.name + ' — копия' : '')}" maxlength="120" autofocus></label>
           <p class="subtle space">Масса пациента при сохранении очищается; ручной выбор массы сбрасывается на рекомендованный, чтобы шаблон не использовал неизвестный вес.</p>`,
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
      case 'open-drug-picker': {
        promptDialog('Выбрать препарат',
          '<label class="space">Поиск по названию<input id="drug-search" type="search" autocomplete="off" autofocus></label><div id="drug-choices" class="drug-choices space"></div>', '');
        renderDrugChoices();
        dialog.querySelector('#drug-search').focus();
        break;
      }
      case 'choose-drug': {
        const selectedRow = cards()[currentIndex()]?.row;
        if (!selectedRow || !drugFor(value)) break;
        dialog.close();
        chooseDrug(selectedRow,value);
        break;
      }
      case 'add-row':
        draft[value].push(blank(null, value === 'maintenance' ? 'мг/кг/ч' : 'мг/кг'));
        setCard(draft[value].length - 1);
        dirty = true;
        render(true);
        main.querySelector(`[data-stage="${value}"]:last-of-type [data-action="open-drug-picker"]`)?.focus();
        break;
      case 'remove-row': {
        const rows = draft[currentStage()];
        if (!rows[currentIndex()]) break;
        rows.splice(currentIndex(), 1);
        setCard(Math.max(0, Math.min(currentIndex(), rows.length - 1)));
        dirty = true;
        render(true);
        if (!container) {
          const action = rows.length ? 'remove-row' : 'add-row';
          main.querySelector(`.deck-tools [data-action="${action}"]`)?.focus();
        }
        break;
      }
      case 'up':
      case 'down': {
        const rows = draft[container.dataset.stage];
        const index = Number(container.dataset.index);
        const offset = action === 'up' ? -1 : 1;
        rows.splice(index, 1);
        rows.splice(index + offset, 0, row);
        setCard(index + offset);
        dirty = true;
        render(true);
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
        patientHeight = '';
        patientSex = '';
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
