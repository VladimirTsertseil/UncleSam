(() => {
  'use strict';
  const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase()
    .replaceAll('ё', 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const collator = new Intl.Collator('ru');
  function create(dialog) {
    let query = '';
    let archive;
    let loading;
    let failure = false;
    let requested = false;

    function load() {
      if (archive || loading) return;
      failure = false;
      loading = fetch('./preop-drugs-2026.json?v=1')
        .then(response => {
          if (!response.ok) throw Error('Database unavailable');
          return response.json();
        })
        .then(data => {
          archive = {
            ...data,
            drugs: new Map(data.drugs.map(drug => [drug.id, drug])),
            search: Object.entries(data.search_index)
          };
        })
        .catch(() => { failure = true; })
        .finally(() => {
          loading = null;
          refresh();
        });
    }
    function matches(value) {
      if (!archive || value.length < 2) return [];
      const best = new Map();
      for (const [key, ids] of archive.search) {
        const rank = key === value ? 0 : key.startsWith(value) ? 1 : key.includes(value) ? 2 : -1;
        if (rank < 0) continue;
        for (const id of ids) {
          const drug = archive.drugs.get(id);
          if (!drug) continue;
          const priority = rank * 2 + (normalize(drug.inn_ru) === value ? 0 : 1);
          if (!best.has(id) || priority < best.get(id).priority) best.set(id, { drug, key, priority });
        }
      }
      return [...best.values()].sort((a, b) =>
        a.priority - b.priority || collator.compare(a.drug.inn_ru, b.drug.inn_ru));
    }
    function markup() {
      return `<section class="panel preop-search space">
        <label>Название препарата
          <input id="preop-query" type="search" autocomplete="off" autocapitalize="none" spellcheck="false"
            placeholder="Например, Эликвис или апиксабан" value="${escape(query)}">
        </label>
        <p class="subtle space" id="preop-status" role="status"></p>
        <button type="button" data-action="preop-retry" class="space" hidden>Повторить загрузку</button>
        <ul class="preop-results" id="preop-results"></ul>
        <details class="space">
          <summary>О базе и источниках</summary>
          <p class="subtle">189 карточек для плановых операций у взрослых. Торговые названия приведены для поиска. Сверяй состав с упаковкой.</p>
          <p class="subtle space">На карточке указан тип источника. Сводки базы требуют клинической сверки, особенно перед нейроаксиальной анестезией и при работе с катетером.</p>
        </details>
      </section>`;
    }
    function refresh() {
      const status = document.querySelector('#preop-status');
      if (!status) return;
      const results = document.querySelector('#preop-results');
      document.querySelector('[data-action="preop-retry"]').hidden = !failure;
      const value = normalize(query);
      const found = matches(value);
      const limit = 40;
      status.textContent = failure ? 'Не удалось загрузить базу.' : !archive ? 'Загрузка базы…'
        : value.length < 2 ? 'Введи хотя бы две буквы МНН или торгового названия.'
        : !found.length ? 'Совпадений нет. Проверь написание или введи часть названия.'
        : found.length > limit ? `Показаны первые ${limit} из ${found.length}. Уточни название.` : `Найдено: ${found.length}`;
      results.innerHTML = found.slice(0, limit).map(({ drug, key }) => {
        const aliases = [...drug.trade_names_ru, ...drug.search_aliases_ru, ...drug.ingredients_ru];
        const matched = aliases.find(alias => normalize(alias) === key && normalize(alias) !== normalize(drug.inn_ru));
        const label = [matched, drug.subgroup].filter(Boolean).join(' · ');
        return `<li><button type="button" data-action="preop-card" value="${escape(drug.id)}">
          <strong>${escape(drug.inn_ru)}</strong><small>${escape(label)}</small></button></li>`;
      }).join('');
    }
    const paragraph = (title, value) => value ? `<h3>${title}</h3><p>${escape(value)}</p>` : '';
    const sourceLink = (url, title) => /^https:\/\//i.test(url ?? '')
      ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(title)}</a>` : '';
    function open(id) {
      const drug = archive?.drugs.get(id);
      if (!drug || dialog.open) return;
      const { operation, regional_anesthesia: regional } = drug;
      const sources = drug.references.map(key => archive.sources[key]).filter(Boolean)
        .map(s => `<li>${sourceLink(s.url, s.title)}<small>${escape(s.type)}</small></li>`).join('');
      const brands = sourceLink(drug.brand_source_url, 'Торговые названия и состав');
      dialog.innerHTML = `<article class="preop-card">
        <div class="bar"><h2 id="dialog-title">${escape(drug.inn_ru)}</h2>
          <button type="button" data-action="close">Закрыть</button></div>
        <p class="subtle">${escape(drug.group)} · ${escape(drug.subgroup)}</p>
        ${paragraph('Действующие вещества', drug.ingredients_ru.join(' + '))}
        ${paragraph('Торговые названия', drug.trade_names_ru.join(', '))}
        <p class="preop-evidence"><b>Основание по данным базы:</b>
          ${escape(drug.evidence_status.replaceAll('_', ' '))}.
          Сверь интервалы и условия с источником перед назначением.</p>
        ${drug.high_risk_flags ? `<aside class="preop-evidence">${paragraph('Особые риски', drug.high_risk_flags)}</aside>` : ''}
        ${paragraph('Перед операцией', operation.decision)}
        ${paragraph('Срок отмены', operation.hold_interval)}
        ${operation.details ? `<p class="space">${escape(operation.details)}</p>` : ''}
        ${paragraph('Спинальная и эпидуральная анестезия', regional.spinal_epidural)}
        ${paragraph('Глубокая периферическая блокада', regional.deep_peripheral_block)}
        ${paragraph('Поверхностная периферическая блокада', regional.superficial_peripheral_block)}
        ${paragraph('Что проверить', drug.preoperative_checks)}
        ${paragraph('Возобновление', drug.resume)}
        <h3>Источники для сверки</h3>
        ${sources ? `<ul class="preop-sources">${sources}</ul>` : '<p>Клинический источник не указан.</p>'}
        ${brands ? `<p class="space">${brands}</p>` : ''}
        <p class="subtle space">Версия базы ${escape(archive.metadata.dataset_version)}.</p>
      </article>`;
      dialog.setAttribute('aria-labelledby', 'dialog-title');
      dialog.showModal();
    }
    return {
      markup,
      mount() {
        if (!requested) { requested = true; load(); }
        refresh();
      },
      input(value) { query = value; refresh(); },
      retry() { load(); refresh(); },
      open
    };
  }
  globalThis.AnesthesiaPreop = { create };
})();
