(() => {
  'use strict';

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const decimals = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  const fmt = value => decimals.format(Object.is(value, -0) ? 0 : value);
  const signed = value => `${value > 0 ? '+' : ''}${fmt(value)}`;
  const num = (key, label, min, max, extra = {}) => ({ key, label, min, max, kind: 'number', ...extra });
  const choice = (key, label, options, initial = '', clears = []) => ({ key, label, options, initial, clears, kind: 'select' });
  const check = (key, label, points = 1) => ({ key, label, points, kind: 'check' });
  const total = (checks, values) => checks.reduce((count, field) => count + (values[field.key] ? field.points : 0), 0);
  const result = (value, interpretation, action, metrics = []) => ({ value, interpretation, action, metrics });
  const source = (label, url) => ({ label, url });
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const body = AnesthesiaBodyMass;
  const profileCards = new Set(['crcl','stop-bang','blood-volume','blood-loss','sodium']);
  const massCards = new Set(['crcl','blood-volume','blood-loss','sodium']);
  const needsMass = (card, raw) => massCards.has(card.id) &&
    !(card.id === 'blood-loss' && raw.volumeMode === 'known') &&
    !(card.id === 'sodium' && raw.mode === 'trend');

  function visibleFields(card, raw) {
    const fields = typeof card.fields === 'function' ? card.fields(raw) : card.fields;
    if (!profileCards.has(card.id)) return fields;
    return fields.filter(field => !['sex','height','weight'].includes(field.key) &&
      !(card.id === 'stop-bang' && field.key === 'bmi'));
  }

  function calculate(card, raw, profile = null) {
    const values = {};
    if (profileCards.has(card.id)) {
      if (card.id === 'stop-bang' || needsMass(card, raw)) {
        if (!profile?.actual) return {error:'Укажите фактическую массу в профиле пациента.'};
        if (!profile.height || !profile.sex) return {error:'Укажите рост и пол в профиле пациента для расчётных показателей массы.'};
      }
      if (profile?.sex) values.sex = profile.sex;
      if (profile?.height) values.height = profile.height;
      if (profile?.bmi) values.bmi = profile.bmi;
      if (needsMass(card, raw)) {
        const recommended = body.forCalculator(card.id, profile);
        values.weight = body.choose(profile, raw.massMode || 'recommended', recommended.mode);
        if (values.weight === null) return {error:'Невозможно рассчитать выбранную массу. Проверьте рост, пол и фактическую массу пациента.'};
        // Для описания результата по Кокрофту–Голту доступны и альтернативные массы.
        values.actualWeight = profile.actual;
        values.idealWeight = profile.ideal;
        values.adjustedWeight = profile.adjusted;
      }
    }
    for (const field of visibleFields(card, raw)) {
      const entered = raw[field.key] ?? field.initial ?? '';
      if (field.kind === 'check') {
        values[field.key] = entered === true;
      } else if (field.kind === 'select') {
        if (!field.options.some(([key]) => key === entered)) return { error: `Выберите «${field.label}».`, field: field.key };
        values[field.key] = entered;
      } else {
        const text = String(entered).trim().replace(',', '.');
        if (field.optional && text === '') continue;
        if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return { error: `Введите число в поле «${field.label}».`, field: field.key };
        const value = Number(text);
        if (!Number.isFinite(value) || value < field.min || value > field.max || (field.integer && !Number.isInteger(value))) {
          return { error: `«${field.label}» — ${field.integer ? 'целое число ' : ''}от ${fmt(field.min)} до ${fmt(field.max)}.`, field: field.key };
        }
        values[field.key] = value;
      }
    }
    return card.compute(values);
  }

  const option = (key, label, selected) => `<option value="${escape(key)}"${key === selected ? ' selected' : ''}>${escape(label)}</option>`;

  function fieldMarkup(field, raw) {
    const value = raw[field.key] ?? field.initial ?? '';
    const attr = `data-clinical-field="${field.key}"`;
    if (field.kind === 'check') {
      return `<label class="clinical-check"><input type="checkbox" ${attr}${value === true ? ' checked' : ''}><span>${escape(field.label)}</span></label>`;
    }
    const input = field.kind === 'select'
      ? `<select ${attr}>${field.initial ? '' : option('', 'Выбрать', value)}${field.options.map(([key, label]) => option(key, label, value)).join('')}</select>`
      : `<input type="text" inputmode="${field.min < 0 ? 'text' : field.integer ? 'numeric' : 'decimal'}" maxlength="16" autocomplete="off" spellcheck="false" ${attr} value="${escape(value)}">`;
    return `<label>${escape(field.label)}${input}${field.note ? `<small>${escape(field.note)}</small>` : ''}</label>`;
  }

  function renderFields(fields, raw) {
    const scalars = fields.filter(field => field.kind !== 'check');
    const flags = fields.filter(field => field.kind === 'check');
    return `${scalars.length ? `<div class="grid clinical-fields">${scalars.map(field => fieldMarkup(field, raw)).join('')}</div>` : ''}
      ${flags.length ? `<fieldset class="clinical-checks"><legend>Отметьте все применимые пункты</legend>${flags.map(field => fieldMarkup(field, raw)).join('')}</fieldset>` : ''}`;
  }

  function showResult(report) {
    if (report.error) return `<p class="clinical-error">${escape(report.error)}</p>`;
    return `<div class="clinical-result"><h3>Результат</h3><strong>${escape(report.value)}</strong>
      ${report.metrics.length ? `<dl>${report.metrics.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>` : ''}
      <p>${escape(report.interpretation)}</p><p class="clinical-next">${escape(report.action)}</p></div>`;
  }

  // Справка отображается в самом низу каждой клинической карточки.
  const helpById = {
  "rcri": [
    "При предоперационной оценке сердечно-сосудистого риска у взрослых перед некардиальной операцией, особенно при сопутствующих заболеваниях и повышенном хирургическом риске.",
    "Индекс не определяет самостоятельно показания к эхокардиографии, нагрузочным тестам или переносу операции. Учитывайте симптомы, функциональные возможности и характер вмешательства."
  ],
  "dasi": [
    "Когда нужно уточнить функциональные возможности пациента перед операцией, особенно если субъективная оценка переносимости нагрузки неясна.",
    "Это опросник, а не нагрузочный тест. Оценка зависит от ответов пациента и должна сопоставляться с симптомами и клинической картиной."
  ],
  "ariscat": [
    "Перед операцией для оценки вероятности послеоперационных лёгочных осложнений и планирования мер профилактики.",
    "Шкала применяется к соответствующей взрослой хирургической популяции; балл не является самостоятельным основанием для отмены вмешательства."
  ],
  "stop-bang": [
    "При предоперационном скрининге вероятного синдрома обструктивного апноэ сна, в том числе при ожирении, храпе и дневной сонливости.",
    "Высокий балл указывает на вероятность апноэ, но не подтверждает диагноз. Учитывайте особенности дыхательных путей, анестезии и послеоперационного наблюдения."
  ],
  "apfel": [
    "При планировании профилактики послеоперационной тошноты и рвоты у взрослых, прежде всего при общей анестезии.",
    "Оценка приблизительна и не заменяет выбора профилактики с учётом анестезиологической техники, предполагаемых опиоидов и индивидуального анамнеза."
  ],
  "crcl": [
    "Когда почечная функция влияет на дозировку, интервалы приёма или периоперационную отмену препарата, в частности некоторых антикоагулянтов.",
    "Формула предназначена для приблизительной оценки клиренса при относительно стабильном креатинине. Выбор массы тела и нужного показателя функции почек сверяйте с инструкцией препарата."
  ],
  "mica": [
    "Для дополнительной количественной оценки риска инфаркта миокарда или остановки кровообращения в течение 30 дней после некардиальной операции.",
    "Модель зависит от исходной популяции и определения вмешательства. Результат не заменяет клинической оценки и не является самостоятельным назначением обследований."
  ],
  "chads": [
    "При фибрилляции предсердий для оценки риска инсульта и системной эмболии, в том числе в контексте решения о длительной антикоагулянтной терапии.",
    "Шкала не рассчитывает непосредственно риск тромбоза за несколько дней отмены антикоагулянта и сама по себе не определяет необходимость мостовой терапии."
  ],
  "caprini": [
    "Для стратификации риска венозных тромбоэмболических осложнений и обсуждения профилактики у хирургических пациентов, к которым применима используемая версия шкалы.",
    "Не переносите пороги и профилактические схемы на любые виды операций: учитывайте профиль хирургии, риск кровотечения и локальный протокол."
  ],
  "liver": [
    "При циррозе печени для описания тяжести заболевания и предоперационного обсуждения рисков декомпенсации и осложнений.",
    "Child–Pugh и MELD-Na не являются самостоятельными калькуляторами операционного риска. В карточке используется историческая версия MELD-Na, а не актуальная формула распределения донорских органов."
  ],
  "blood-volume": [
    "Для ориентировочного расчёта объёма циркулирующей крови взрослого при планировании кровопотери, инфузии или трансфузионной готовности.",
    "Это популяционная оценка по антропометрическим данным, а не измеренный объём крови конкретного пациента. При ожирении и особых физиологических состояниях точность может снижаться."
  ],
  "blood-loss": [
    "Для предварительной оценки возможной кровопотери с учётом исходного и выбранного целевого гемоглобина или гематокрита.",
    "Результат не является порогом для гемотрансфузии. Учитывайте темп кровотечения, гемодинамику, перфузию, сопутствующие болезни и повторные лабораторные измерения."
  ],
  "sodium": [
    "При гипо- или гипернатриемии для ориентировочной оценки дефицита свободной воды, теоретического эффекта инфузии либо фактической скорости коррекции.",
    "Формулы не предсказывают точно динамику при изменении диуреза и продолжающихся потерях. Необходимы повторные измерения натрия и контроль безопасной скорости коррекции."
  ],
  "anion-gap": [
    "При анализе метаболического ацидоза, особенно при снижении бикарбоната, чтобы выявить увеличение анионной разницы.",
    "Низкий альбумин способен маскировать повышенную анионную разницу. Оценка причины требует газового состава крови, электролитов, клиники и дополнительных анализов."
  ],
  "acid-base": [
    "При интерпретации газов артериальной крови для проверки ожидаемой компенсации и выявления возможных смешанных кислотно-основных нарушений.",
    "Формулы описывают ожидаемые диапазоны компенсации, а не подтверждают причину расстройства. Сопоставляйте показатели с электролитами, альбумином и клинической ситуацией."
  ],
  "lactate": [
    "При оценке метаболического компонента кислотно-основных нарушений, тяжести гипоперфузии и динамики лактата у тяжёлого пациента.",
    "Лактат может повышаться не только из-за гипоксии тканей. Дефицит оснований неспецифичен; важнее динамика, причина изменений и состояние пациента."
  ],
  "shock-index": [
    "При первичной и повторной оценке возможной гемодинамической нестабильности, например при кровотечении или подозрении на шок.",
    "Нормальный индекс не исключает шок. Частота пульса зависит от лекарств, аритмий, возраста и других факторов; интерпретируйте вместе с перфузией и артериальным давлением."
  ]
};

  function helpMarkup(card) {
    const notes = helpById[card.id];
    if (!notes) return '';
    return `<section class="clinical-help" aria-label="Справка по использованию калькулятора">
      <h3>Когда использовать калькулятор</h3>
      <p>${escape(notes[0])}</p>
      <h4>Что учитывать</h4>
      <p>${escape(notes[1])}</p>
    </section>`;
  }

  function create(root, groups, getPatient = () => null) {
    let groupIndex = 0;
    const selected = groups.map(group => group.cards[0].id);
    const saved = new Map();
    const reports = new Map();
    const active = () => groups[groupIndex].cards.find(card => card.id === selected[groupIndex]);
    const getData = card => saved.get(card.id) ?? {};

    function massMarkup(card,raw) {
      if (!needsMass(card,raw)) return '';
      const p = getPatient();
      const recommendation = body.forCalculator(card.id,p);
      const mode = raw.massMode || 'recommended';
      const selected = body.choose(p,mode,recommendation.mode);
      const opts = option('recommended','Рекомендуемая: ' + body.labels[recommendation.mode],mode) +
        body.modes.map(([id,label]) => option(id,label + ' · ' + (p?.[id] !== null && p?.[id] !== undefined ? body.fmt(p[id])+' кг' : '—'),mode)).join('');
      return `<div class="mass-widget clinical-mass-widget">
        <label>Масса для расчёта<select data-clinical-mass-mode>${opts}</select></label>
        <p class="mass-current">Выбрано: <b>${escape(body.labels[mode==='recommended' ? recommendation.mode : mode])} · ${selected === null ? '—' : body.fmt(selected) + ' кг'}</b></p>
        <p class="subtle mass-advice">${escape(recommendation.note)}</p>
      </div>`;
    }

    function layout() {
      const card = active();
      const raw = getData(card);
      const report = reports.get(card.id);
      return `<div class="clinical-groups" role="group" aria-label="Раздел калькуляторов">${groups.map((group, index) =>
        `<button type="button" data-clinical-group="${index}" aria-pressed="${index === groupIndex}">${escape(group.label)}</button>`).join('')}</div>
        <label class="clinical-picker">Калькулятор<select data-clinical-picker>${groups[groupIndex].cards.map(item => option(item.id, item.title, card.id)).join('')}</select></label>
        <form class="panel clinical-card" data-clinical-form novalidate>
          <h2 tabindex="-1" data-clinical-title>${escape(card.title)}</h2><p class="subtle">${escape(card.description)}</p>
          ${renderFields(visibleFields(card, raw), raw)}
          ${massMarkup(card,raw)}
          <div class="actions space"><button class="primary" type="submit">Рассчитать</button><button type="button" data-clinical-clear>Очистить</button></div>
          <section class="clinical-output" aria-live="polite" aria-atomic="true">${report ? showResult(report) : ''}</section>
          <details class="clinical-sources"><summary>Источники и версия</summary><ul>${card.sources.map(item =>
            `<li><a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">${escape(item.label)} ↗</a></li>`).join('')}</ul></details>
          ${helpMarkup(card)}
        </form>`;
    }

    function refresh(focus) {
      const section = root.querySelector('[data-clinical-root]');
      if (!section) return;
      section.innerHTML = layout();
      if (focus) section.querySelector(focus)?.focus({ preventScroll: true });
    }

    function update(field, rebuild) {
      const card = active();
      const key = field.dataset.clinicalField;
      const next = { ...getData(card), [key]: field.type === 'checkbox' ? field.checked : field.value };
      const cleared = visibleFields(card, getData(card)).find(item => item.key === key)?.clears ?? [];
      for (const fieldKey of cleared) delete next[fieldKey];
      saved.set(card.id, next);
      reports.delete(card.id);
      if (rebuild || cleared.length) refresh(`[data-clinical-field="${key}"]`);
      else {
        const form = field.closest('form');
        form.querySelector('.clinical-output').textContent = '';
        form.querySelector('[aria-invalid]')?.removeAttribute('aria-invalid');
      }
    }

    root.addEventListener('click', event => {
      const group = event.target.closest('[data-clinical-group]');
      if (group) {
        groupIndex = Number(group.dataset.clinicalGroup);
        refresh(`[data-clinical-group="${groupIndex}"]`);
      }
      if (event.target.closest('[data-clinical-clear]')) {
        saved.delete(active().id);
        reports.delete(active().id);
        refresh('[data-clinical-form] input, [data-clinical-form] select');
      }
    });
    root.addEventListener('input', event => {
      if (event.target.matches('input[data-clinical-field]')) update(event.target, false);
    });
    root.addEventListener('change', event => {
      const field = event.target;
      if (field.matches('[data-clinical-picker]')) {
        selected[groupIndex] = field.value;
        // На iOS фокус нового select повторно открывал системный список выбора.
        field.blur();
        requestAnimationFrame(() => refresh('[data-clinical-title]'));
      } else if (field.matches('[data-clinical-mass-mode]')) {
        const card = active();
        saved.set(card.id, {...getData(card),massMode:field.value});
        reports.delete(card.id);
        field.blur();
        requestAnimationFrame(() => refresh());
      } else if (field.matches('select[data-clinical-field]')) {
        update(field, typeof active().fields === 'function');
      }
    });
    root.addEventListener('submit', event => {
      const form = event.target;
      if (!form.matches('[data-clinical-form]')) return;
      event.preventDefault();
      const card = active();
      const report = calculate(card, getData(card), getPatient());
      const output = form.querySelector('.clinical-output');
      form.querySelector('[aria-invalid]')?.removeAttribute('aria-invalid');
      output.innerHTML = showResult(report);
      if (report.error) {
        const field = report.field && form.querySelector(`[data-clinical-field="${report.field}"]`);
        field?.setAttribute('aria-invalid', 'true');
        field?.focus();
      } else {
        reports.set(card.id, report);
        output.scrollIntoView({ block: 'nearest' });
      }
    });

    return {
      markup: () => `<section class="clinical-shell" aria-label="Калькуляторы" data-clinical-root>${layout()}</section>`,
      hasData: () => reports.size > 0 || [...saved.values()].some(values => Object.values(values).some(Boolean)),
      patientChanged() { reports.clear(); refresh(); },
      reset() { saved.clear(); reports.clear(); }
    };
  }

  globalThis.AnesthesiaCalculators = { create, calculate, num, choice, check, total, result, source, clamp, fmt, signed };
})();
