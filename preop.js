(() => {
  'use strict';
  const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase()
    .replaceAll('ё', 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const collator = new Intl.Collator('ru');
  const storageKey = 'anesthesia-preop-edits-v1';
  const validCard = card => card && typeof card.title === 'string' && card.title.trim() &&
    typeof card.subtitle === 'string' && Array.isArray(card.sections) &&
    card.sections.every(section => section && typeof section.id === 'string' &&
      typeof section.title === 'string' && typeof section.text === 'string');
  function readEdits() {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    return new Map(Object.entries(saved).filter(([id, card]) => /^drug_\d+$/.test(id) && validCard(card)));
  }
  // Cards with procedure-specific guidance in sections 5.1–5.6 of FAR 2025.
  const regionalCardIds = new Set([
    'drug_043', 'drug_044', 'drug_045', 'drug_046', 'drug_047', // Aspirin, P2Y12 inhibitors, warfarin
    'drug_048', 'drug_049', 'drug_050', 'drug_051', // Direct oral anticoagulants
    'drug_052', 'drug_053', 'drug_054', 'drug_055', 'drug_056', 'drug_057', // Heparins and fondaparinux
    'drug_176', 'drug_177' // Aspirin and clopidogrel combinations
  ]);
  function create(dialog) {
    let query = '';
    let archive;
    let loading;
    let failure = false;
    let requested = false;
    let edits = new Map();
    let cardId;
    try { edits = readEdits(); } catch { /* The published cards remain available. */ }

    function load() {
      if (archive || loading) return;
      failure = false;
      loading = fetch('./preop-drugs-2026.json?v=2')
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
      function consider(key, ids) {
        const rank = key === value ? 0 : key.startsWith(value) ? 1 : key.includes(value) ? 2 : -1;
        if (rank < 0) return;
        for (const id of ids) {
          const drug = archive.drugs.get(id);
          if (!drug) continue;
          const title = edits.get(id)?.title ?? drug.inn_ru;
          const priority = rank * 2 + (normalize(title) === value ? 0 : 1);
          if (!best.has(id) || priority < best.get(id).priority) best.set(id, { drug, title, key, priority });
        }
      }
      for (const [key, ids] of archive.search) consider(key, ids);
      for (const [id, card] of edits) {
        const extraNames = card.sections.filter(section => ['ingredients', 'brands'].includes(section.id))
          .flatMap(section => section.text.split(/[,+;\n]/));
        for (const name of [card.title, ...extraNames]) consider(normalize(name), [id]);
      }
      return [...best.values()].sort((a, b) =>
        a.priority - b.priority || collator.compare(a.title, b.title));
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
      results.innerHTML = found.slice(0, limit).map(({ drug, title, key }) => {
        const aliases = [drug.inn_ru, ...drug.trade_names_ru, ...drug.search_aliases_ru, ...drug.ingredients_ru];
        const matched = aliases.find(alias => normalize(alias) === key && normalize(alias) !== normalize(drug.inn_ru));
        const label = [matched, drug.subgroup].filter(Boolean).join(' · ');
        return `<li><button type="button" data-action="preop-card" value="${escape(drug.id)}">
          <strong>${escape(title)}</strong><small>${escape(label)}</small></button></li>`;
      }).join('');
    }
    function original(drug) {
      const { operation, regional_anesthesia: regional } = drug;
      const showRegional = regionalCardIds.has(drug.id) && drug.references.includes('FAR_ANTICOAG_2025');
      const sources = drug.references.map(key => archive.sources[key]).filter(Boolean)
        .map(s => `${s.title} · ${s.type} | ${s.url}`);
      if (drug.brand_source_url) sources.push('Торговые названия и состав | ' + drug.brand_source_url);
      return {
        title: drug.inn_ru,
        subtitle: [drug.group, drug.subgroup].filter(Boolean).join(' · '),
        sections: [
          ['ingredients', 'Действующие вещества', drug.ingredients_ru.join(' + ')],
          ['brands', 'Торговые названия', drug.trade_names_ru.join(', ')],
          ['risks', 'Особые риски', drug.high_risk_flags],
          ['before', 'Перед операцией', [operation.decision, operation.details].filter(Boolean).join('\n\n')],
          ['hold', 'Срок отмены', operation.hold_interval],
          ...(showRegional ? [
            ['spinal', 'Спинальная и эпидуральная анестезия', regional.spinal_epidural],
            ['deep', 'Глубокая периферическая блокада', regional.deep_peripheral_block],
            ['superficial', 'Поверхностная периферическая блокада', regional.superficial_peripheral_block]
          ] : []),
          ['checks', 'Что проверить', drug.preoperative_checks],
          ['resume', 'Возобновление', drug.resume],
          ['sources', 'Источники для сверки', sources.join('\n') || 'Клинический источник не указан.']
        ].filter(([, , text]) => text?.trim()).map(([id, title, text]) => ({ id, title, text }))
      };
    }
    function renderSources(text) {
      return '<ul class="preop-sources">' + text.split('\n').map(line => {
        const match = line.match(/^(.*?)(?:\s*\|\s*)?(https:\/\/\S+)\s*$/i);
        if (!match) return `<li>${escape(line)}</li>`;
        const [, title, href] = match;
        return `<li><a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(title.trim() || href)}</a></li>`;
      }).join('') + '</ul>';
    }
    function showCard(focusEdit = false) {
      const drug = archive.drugs.get(cardId);
      const saved = edits.get(cardId);
      const card = saved ?? original(drug);
      dialog.innerHTML = `<article class="preop-card">
        <h2 id="dialog-title">${escape(card.title)}</h2>
        <div class="actions space">
          <button type="button" data-action="close" autofocus>Закрыть</button>
          <button type="button" data-preop-editor="edit">Редактировать</button>
        </div>
        ${card.subtitle ? `<p class="subtle space">${escape(card.subtitle)}</p>` : ''}
        ${saved ? '<p class="subtle space">Личная редакция</p>' : ''}
        ${card.sections.map(section => `<section${section.id === 'risks' ? ' class="preop-evidence"' : ''}>
          <h3>${escape(section.title)}</h3>
          ${section.id === 'sources' ? renderSources(section.text) : `<p class="preop-content">${escape(section.text)}</p>`}
        </section>`).join('')}
        ${saved ? '' : `<p class="subtle space">Версия базы ${escape(archive.metadata.dataset_version)}.</p>`}
      </article>`;
      dialog.setAttribute('aria-labelledby', 'dialog-title');
      if (!dialog.open) dialog.showModal();
      dialog.scrollTop = 0;
      if (focusEdit) dialog.querySelector('[data-preop-editor="edit"]').focus();
    }
    function open(id) {
      if (!archive?.drugs.has(id) || dialog.open) return;
      cardId = id;
      showCard();
    }
    function sectionFields(section) {
      return `<fieldset class="editor-item" data-preop-section="${escape(section.id)}">
        <legend>Раздел карточки</legend>
        <label>Заголовок<input name="sectionTitle" maxlength="160" required value="${escape(section.title)}"></label>
        <label class="space">Текст<textarea name="sectionText" rows="4" maxlength="12000">${escape(section.text)}</textarea></label>
        ${section.id === 'sources' ? '<p class="subtle">По одному источнику на строку: название | https://…</p>' : ''}
        <button type="button" class="space danger" data-preop-editor="remove">Удалить раздел</button>
      </fieldset>`;
    }
    function edit() {
      const card = edits.get(cardId) ?? original(archive.drugs.get(cardId));
      dialog.innerHTML = `<form class="preop-editor" data-preop-form>
        <h2 id="dialog-title">Редактирование карточки</h2>
        <label class="space">Название препарата<input name="cardTitle" required maxlength="200" value="${escape(card.title)}"></label>
        <label class="space">Подзаголовок<input name="cardSubtitle" maxlength="240" value="${escape(card.subtitle)}"></label>
        <div data-preop-sections>${card.sections.map(sectionFields).join('')}</div>
        <button type="button" class="space" data-preop-editor="add">Добавить раздел</button>
        <p class="subtle space">Личная редакция сохраняется в этом браузере.</p>
        <p role="alert" data-preop-error></p>
        <div class="actions space preop-editor-actions">
          <button class="primary" type="submit">Сохранить</button>
          <button type="button" data-preop-editor="cancel">Отмена</button>
          ${edits.has(cardId) ? '<button type="button" data-preop-editor="restore">Вернуть исходную карточку</button>' : ''}
        </div>
      </form>`;
      dialog.scrollTop = 0;
      dialog.querySelector('[name="cardTitle"]').focus({ preventScroll: true });
    }
    function persist(card) {
      try {
        const next = readEdits();
        if (card) next.set(cardId, card);
        else next.delete(cardId);
        localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(next)));
        edits = next;
      } catch {
        dialog.querySelector('[data-preop-error]').textContent =
          'Не удалось сохранить карточку. Проверь, доступно ли хранилище браузера.';
        return;
      }
      refresh();
      showCard(true);
    }
    dialog.addEventListener('submit', event => {
      const form = event.target;
      if (!form.matches('[data-preop-form]')) return;
      event.preventDefault();
      const title = form.elements.cardTitle.value.trim();
      const sections = [...form.querySelectorAll('[data-preop-section]')].map(section => ({
        id: section.dataset.preopSection,
        title: section.querySelector('[name="sectionTitle"]').value.trim(),
        text: section.querySelector('[name="sectionText"]').value.trim()
      }));
      if (!title || sections.some(section => !section.title)) {
        form.querySelector('[data-preop-error]').textContent = 'Укажи название карточки и заголовки разделов.';
        return;
      }
      persist({ title, subtitle: form.elements.cardSubtitle.value.trim(), sections });
    });
    dialog.addEventListener('click', event => {
      const control = event.target.closest('[data-preop-editor]');
      if (!control) return;
      switch (control.dataset.preopEditor) {
        case 'edit': edit(); break;
        case 'cancel': showCard(true); break;
        case 'add': {
          const list = dialog.querySelector('[data-preop-sections]');
          list.insertAdjacentHTML('beforeend', sectionFields({ id: 'note', title: 'Примечание', text: '' }));
          const heading = list.lastElementChild.querySelector('[name="sectionTitle"]');
          heading.focus();
          heading.select();
          break;
        }
        case 'remove': {
          const section = control.closest('[data-preop-section]');
          const next = section.nextElementSibling;
          section.remove();
          (next?.querySelector('input') ?? dialog.querySelector('[data-preop-editor="add"]')).focus();
          break;
        }
        case 'restore':
          if (window.confirm('Удалить личную редакцию и вернуть исходную карточку?')) persist(null);
          break;
      }
    });
    dialog.addEventListener('cancel', event => {
      if (!dialog.querySelector('[data-preop-form]')) return;
      event.preventDefault();
      showCard(true);
    });
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
