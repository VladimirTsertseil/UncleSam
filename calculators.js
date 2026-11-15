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

  function visibleFields(card, raw) {
    return typeof card.fields === 'function' ? card.fields(raw) : card.fields;
  }

  function calculate(card, raw) {
    const values = {};
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

  function create(root, groups) {
    let groupIndex = 0;
    const selected = groups.map(group => group.cards[0].id);
    const saved = new Map();
    const reports = new Map();
    const active = () => groups[groupIndex].cards.find(card => card.id === selected[groupIndex]);
    const getData = card => saved.get(card.id) ?? {};

    function layout() {
      const card = active();
      const raw = getData(card);
      const report = reports.get(card.id);
      return `<div class="clinical-groups" role="group" aria-label="Раздел калькуляторов">${groups.map((group, index) =>
        `<button type="button" data-clinical-group="${index}" aria-pressed="${index === groupIndex}">${escape(group.label)}</button>`).join('')}</div>
        <label class="clinical-picker">Калькулятор<select data-clinical-picker>${groups[groupIndex].cards.map(item => option(item.id, item.title, card.id)).join('')}</select></label>
        <form class="panel clinical-card" data-clinical-form novalidate>
          <h2>${escape(card.title)}</h2><p class="subtle">${escape(card.description)}</p>
          ${renderFields(visibleFields(card, raw), raw)}
          <div class="actions space"><button class="primary" type="submit">Рассчитать</button><button type="button" data-clinical-clear>Очистить</button></div>
          <section class="clinical-output" aria-live="polite" aria-atomic="true">${report ? showResult(report) : ''}</section>
          <details class="clinical-sources"><summary>Источники и версия</summary><ul>${card.sources.map(item =>
            `<li><a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">${escape(item.label)} ↗</a></li>`).join('')}</ul></details>
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
        refresh('[data-clinical-picker]');
      } else if (field.matches('select[data-clinical-field]')) {
        update(field, typeof active().fields === 'function');
      }
    });
    root.addEventListener('submit', event => {
      const form = event.target;
      if (!form.matches('[data-clinical-form]')) return;
      event.preventDefault();
      const card = active();
      const report = calculate(card, getData(card));
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
      reset() { saved.clear(); reports.clear(); }
    };
  }

  globalThis.AnesthesiaCalculators = { create, calculate, num, choice, check, total, result, source, clamp, fmt, signed };
})();
