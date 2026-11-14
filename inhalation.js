(() => {
  'use strict';
  const agents = {
    sevo: { name: 'Севофлуран', mac40: 1.80, molarMass: 200.05, density: 1.52 },
    iso: { name: 'Изофлуран', mac40: 1.17, molarMass: 184.49, density: 1.50 },
    des: { name: 'Десфлуран', mac40: 6.60, molarMass: 168.04, density: 1.465 }
  };
  const format = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
  const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function decimal(raw, max) {
    const input = raw.trim();
    if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(input)) return null;
    const value = Number(input.replace(',', '.'));
    return Number.isFinite(value) && value <= max ? value : null;
  }
  function escapeValue(value) {
    return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }
  function duration(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map(n => String(n).padStart(2, '0')).join(':');
  }
  function create() {
    const defaults = { agent: 'sevo', age: '', endTidal: '', target: '', flow: '', dial: '' };
    const limits = { age: [18, 120], endTidal: [0, 100], target: [0, 100], flow: [Number.MIN_VALUE, 100], dial: [0, 100] };
    let fields = { ...defaults };
    let segments = [];
    let active = null;
    let observed = null;
    let interval = null;

    const field = (key, label) => `<label>${label}<input type="text" inputmode="decimal"
      autocomplete="off" maxlength="16" data-gas-field="${key}" value="${escapeValue(fields[key])}"></label>`;
    const action = (key, label, extra = '') =>
      `<button type="button" data-gas-action="${key}" ${extra}>${label}</button>`;
    const settings = () => {
      const flow = decimal(fields.flow, 100);
      const dial = decimal(fields.dial, 100);
      return flow > 0 && dial !== null ? { agent: fields.agent, flow, dial } : null;
    };
    function liquid(segment, end) {
      const { molarMass, density } = agents[segment.agent];
      const minutes = Math.max(0, end - segment.start) / 60000;
      // Convert the delivered vapour to liquid using a molar volume of 24.12 L at 21 °C.
      return segment.flow * segment.dial / 100 * minutes * molarMass / (24.12 * density);
    }
    function ageAdjustedMac() {
      const age = decimal(fields.age, 120);
      if (age === null || age < 18) return null;
      return agents[fields.agent].mac40 * 10 ** (-0.00269 * (age - 40));
    }
    function mac() {
      const reference = ageAdjustedMac();
      const endTidal = decimal(fields.endTidal, 100);
      return reference && endTidal !== null ? format.format(endTidal / reference) : '—';
    }
    function targetConcentration() {
      const reference = ageAdjustedMac();
      const target = decimal(fields.target, 100);
      if (!reference || target === null) return '—';
      const concentration = target * reference;
      return concentration <= 100 ? format.format(concentration) + ' %' : '—';
    }
    function markup() {
      const options = Object.entries(agents).map(([id, agent]) =>
        `<option value="${id}"${id === fields.agent ? ' selected' : ''}>${agent.name}</option>`).join('');
      return `<div class="gas-method" data-gas-root>
        <label>Метод<select><option>Ингаляционная анестезия</option></select></label>
        <label class="space">Анестетик<select data-gas-field="agent">${options}</select></label>
        <section class="panel space">
          <h2>МАК с поправкой на возраст</h2>
          <div class="gas-grid space">
            ${field('age', 'Возраст, лет')}
            ${field('endTidal', 'В конце выдоха, об. %')}
          </div>
          <div class="result"><strong>МАК <span data-gas-mac>—</span></strong></div>
          <details>
            <summary>Пересчёт целевой МАК</summary>
            ${field('target', 'Целевая доля МАК')}
            <p class="space">В конце выдоха <strong data-gas-target>—</strong></p>
          </details>
          <p class="subtle space">Расчёт для взрослых по последнему введённому измерению выбранного анестетика. Вклад закиси азота не учитывается.</p>
        </section>
        <section class="panel space">
          <h2>Расход анестетика</h2>
          <div class="gas-grid space">
            ${field('flow', 'Свежий газ, л/мин')}
            ${field('dial', 'На испарителе, об. %')}
          </div>
          <div class="result"><strong data-gas-total>≈ 0 мл</strong><small data-gas-active hidden></small></div>
          <p class="subtle space" data-gas-breakdown hidden></p>
          <div class="actions space">
            ${action('start', 'Начать', 'class="primary"')}
            ${action('apply', 'Применить настройки', 'class="primary" hidden')}
            ${action('stop', 'Остановить', 'hidden')}
          </div>
          <p class="subtle space" data-gas-pending hidden>Журнал пока считает по предыдущим настройкам.</p>
          <p class="subtle space">Приблизительный расход жидкого анестетика по настройкам испарителя.</p>
          <ol class="gas-journal space" data-gas-journal hidden></ol>
          <p class="subtle space">Журнал хранится до обновления страницы или начала расчёта для нового пациента.</p>
        </section>
        <details>
          <summary>Источники расчёта</summary>
          <p><a href="https://pubmed.ncbi.nlm.nih.gov/12878613/" target="_blank" rel="noopener">Возрастная поправка к МАК</a></p>
          <p><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC8769493/" target="_blank" rel="noopener">Формула расхода, приложение 5</a></p>
        </details>
      </div>`;
    }
    function updateClock(root) {
      const now = Date.now();
      const totals = {};
      for (const segment of active ? [...segments, active] : segments) {
        totals[segment.agent] = (totals[segment.agent] || 0) + liquid(segment, segment.end ?? now);
      }
      root.querySelector('[data-gas-total]').textContent =
        '≈ ' + format.format(Object.values(totals).reduce((sum, value) => sum + value, 0)) + ' мл';
      const breakdown = root.querySelector('[data-gas-breakdown]');
      breakdown.hidden = Object.keys(totals).length < 2;
      breakdown.textContent = Object.entries(totals)
        .map(([agent, value]) => agents[agent].name + ' ≈ ' + format.format(value) + ' мл').join(' · ');
      const status = root.querySelector('[data-gas-active]');
      status.hidden = !active;
      if (active) status.textContent = [
        agents[active.agent].name, format.format(active.flow) + ' л/мин',
        format.format(active.dial) + ' %', duration(now - active.start)
      ].join(' · ');
    }
    function updateFields(root) {
      root.querySelector('[data-gas-mac]').textContent = mac();
      root.querySelector('[data-gas-target]').textContent = targetConcentration();
      for (const [key, [min, max]] of Object.entries(limits)) {
        const value = decimal(fields[key], max);
        root.querySelector(`[data-gas-field="${key}"]`).setAttribute('aria-invalid',
          String(Boolean(fields[key].trim() && (value === null || value < min))));
      }
      const next = settings();
      const start = root.querySelector('[data-gas-action="start"]');
      start.hidden = Boolean(active);
      start.disabled = !next;
      start.textContent = segments.length ? 'Продолжить' : 'Начать';
      const apply = root.querySelector('[data-gas-action="apply"]');
      const pending = active && (!next || ['agent', 'dial', 'flow'].some(key => next[key] !== active[key]));
      apply.hidden = !active;
      apply.disabled = !next || !pending;
      root.querySelector('[data-gas-pending]').hidden = !pending;
      root.querySelector('[data-gas-action="stop"]').hidden = !active;
    }
    function refresh(main) {
      clearInterval(interval);
      observed = main.querySelector('[data-gas-root]');
      if (!observed) return;
      const journal = observed.querySelector('[data-gas-journal]');
      journal.hidden = !segments.length;
      journal.innerHTML = segments.map(segment => `<li>
        <b>${agents[segment.agent].name} · ≈ ${format.format(liquid(segment, segment.end))} мл</b>
        <small>${time.format(segment.start)}–${time.format(segment.end)} · ${duration(segment.end - segment.start)}
        · ${format.format(segment.flow)} л/мин · ${format.format(segment.dial)} %</small></li>`).join('');
      updateFields(observed);
      updateClock(observed);
      if (active) interval = setInterval(() => updateClock(observed), 1000);
    }
    function input(el) {
      const key = el.dataset.gasField;
      if (!Object.hasOwn(fields, key)) return;
      if (key === 'agent') {
        if (!Object.hasOwn(agents, el.value) || fields.agent === el.value) return;
        for (const field of ['endTidal', 'dial']) {
          fields[field] = '';
          observed.querySelector(`[data-gas-field="${field}"]`).value = '';
        }
      }
      fields[key] = el.value;
      updateFields(observed);
    }
    function click(event, main) {
      const button = event.target.closest('[data-gas-action]');
      if (!button || button.disabled) return;
      const action = button.dataset.gasAction;
      const next = settings();
      const now = Date.now();
      if (action === 'stop' && active) {
        segments.push({ ...active, end: Math.max(active.start, now) });
        active = null;
      } else if (next && ((action === 'start' && !active) || (action === 'apply' && active))) {
        if (active) segments.push({ ...active, end: Math.max(active.start, now) });
        active = { ...next, start: now };
      }
      refresh(main);
      observed.querySelector(`[data-gas-action="${active ? 'stop' : 'start'}"]`)?.focus({ preventScroll: true });
    }
    return {
      markup, refresh, input, click,
      hasData: () => Boolean(active || segments.length || Object.keys(fields).some(key => fields[key] !== defaults[key])),
      reset() { fields = { ...defaults }; segments = []; active = null; }
    };
  }
  globalThis.AnesthesiaInhalation = { create };
})();
