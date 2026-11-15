(() => {
  'use strict';

  const archive = globalThis.AnesthesiaTemplateArchive;
  const protocolItems = archive?.protocol_templates ?? [];
  const preopItems = globalThis.AnesthesiaPreopTemplateArchive?.preop_templates ?? [];
  const consentItems = globalThis.AnesthesiaConsentArchive?.consent_templates ?? [];
  const groups = [
    { id: 'protocol', title: 'Протоколы', items: protocolItems },
    { id: 'preop', title: 'Предоперационный осмотр', items: preopItems },
    { id: 'consent', title: 'Предоперационные согласия', items: consentItems }
  ];
  const esc = value => String(value ?? '').replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const normalize = value => String(value ?? '').toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').trim();
  const quality = item => !item.text_original ? 'Только название'
    : item.capture_state === 'transcribed_from_photos' ? 'Перенесено с фото'
    : item.capture_state === 'complete_visible_text' || item.capture_state === 'full_visible_tooltip_transcribed'
      ? 'Текст сохранён' : 'Нужна сверка';

  function create(root) {
    let groupId = 'protocol';
    let consentType = 'oms';
    let query = '';
    const selected = {
      protocol: protocolItems[0]?.id ?? null,
      preop: preopItems[0]?.id ?? null,
      consent: consentItems.find(item => item.consent_group === 'oms')?.id ?? null
    };
    const current = () => groups.find(group => group.id === groupId);
    const visibleItems = () => groupId === 'consent'
      ? consentItems.filter(item => item.consent_group === consentType)
      : current().items;
    const filtered = () => {
      const terms = normalize(query).split(/\s+/).filter(Boolean);
      if (!terms.length) return visibleItems();
      return visibleItems().filter(item => {
        const haystack = normalize([item.name_original, item.category, item.text_original].join(' '));
        return terms.every(term => haystack.includes(term));
      });
    };
    const active = (items = filtered()) => {
      if (!items.some(item => item.id === selected[groupId])) selected[groupId] = items[0]?.id ?? null;
      return items.find(item => item.id === selected[groupId]) ?? null;
    };

    function listMarkup(items = filtered()) {
      const item = active(items);
      if (!items.length) return '<p class="template-empty">Ничего не найдено. Попробуйте изменить запрос.</p>';
      return items.map(record =>
        `<button type="button" class="template-item" data-template-id="${esc(record.id)}" aria-current="${record.id === item.id ? 'true' : 'false'}">
          <span class="template-item-title">${esc(record.name_original)}</span>
          <span class="template-item-status">${esc(record.category)} · ${esc(quality(record))}</span>
        </button>`).join('');
    }

    function detailMarkup(item = active()) {
      if (!item) return '<article class="template-detail"><p class="template-empty">Уточните поиск или выберите другой протокол.</p></article>';
      const hasText = typeof item.text_original === 'string' && item.text_original.length > 0;
      const flagged = quality(item) !== 'Текст сохранён';
      const notes = Array.isArray(item.review_notes) ? item.review_notes : [];
      const sources = Array.isArray(item.source_images) ? item.source_images : [];
      return `<article class="template-detail" data-template-detail>
        <div class="template-detail-head">
          <div class="template-detail-heading">
            <h3>${esc(item.name_original)}</h3>
            <p class="subtle">${esc(item.category)} · ${esc(quality(item))}</p>
          </div>
          <button type="button" class="primary" data-template-copy ${hasText ? '' : 'disabled'}>Скопировать текст</button>
        </div>
        <p class="template-copy-status" data-template-copy-status role="status" aria-live="polite" hidden></p>
        <p class="template-safety">${hasText
          ? 'Архивная рабочая запись, не готовая клиническая рекомендация. Фиксированные дозы, параметры и описания следует сверять с фактическими данными пациента и действующими протоколами.'
          : 'В исходном архиве доступно только название. Текст отсутствует, поэтому копирование недоступно.'}</p>
        ${flagged && hasText ? '<p class="template-quality-warning">Текст или соответствие названия и записи требует сверки с исходными фотографиями.</p>' : ''}
        ${hasText ? `<div class="template-text" aria-label="Исходный текст шаблона">${esc(item.text_original)}</div>` : ''}
        ${(notes.length || sources.length || item.source_created_at_visible) ?
          `<details class="template-provenance"><summary>Источники и примечания</summary>
            ${item.source_created_at_visible ? `<p>Дата в исходной записи: ${esc(item.source_created_at_visible)}</p>` : ''}
            ${notes.length ? `<p><b>Примечания при переносе:</b></p><ul>${notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul>` : ''}
            ${sources.length ? `<p>Фотографии-источники: ${sources.map(esc).join(', ')}</p>` : ''}
          </details>` : ''}
      </article>`;
    }

    function markup() {
      const items = filtered();
      return `<section class="templates-shell" data-templates-root aria-label="Архив протоколов, осмотров и предоперационных согласий">
        <div class="templates-heading"><h2>${esc(current().title)}</h2>
          <p class="subtle">${visibleItems().length} записей из рабочего архива</p></div>
        <div class="template-switch" role="group" aria-label="Разделы рабочих записей">
          ${groups.map(group => `<button type="button" data-template-group="${group.id}" aria-pressed="${group.id === groupId}">${esc(group.title)} · ${group.items.length}</button>`).join('')}
        </div>
        ${groupId === 'consent' ? `<div class="template-consent-subnav" role="group" aria-label="Источник согласия">
          <button type="button" data-consent-type="oms" aria-pressed="${consentType === 'oms'}">ОМС · ${consentItems.filter(item => item.consent_group === 'oms').length}</button>
          <button type="button" data-consent-type="hr" aria-pressed="${consentType === 'hr'}">х/р · ${consentItems.filter(item => item.consent_group === 'hr').length}</button>
        </div>
        <p class="subtle template-consent-notice">Архивные формулировки для предоперационных согласий. Не заменяют оформленное информированное добровольное согласие.</p>` : ''}
        <label class="template-search">Поиск по названию и тексту
          <input type="search" data-template-query autocomplete="off" autocapitalize="off" spellcheck="false"
                 placeholder="Например, СМА, ЛОР, аорта" value="${esc(query)}">
        </label>
        <p class="template-count" data-template-count role="status">Найдено: ${items.length}</p>
        <div class="template-layout">
          <div class="template-list" aria-label="Найденные шаблоны" data-template-list>${listMarkup(items)}</div>
          ${detailMarkup(active(items))}
        </div>
      </section>`;
    }

    function refresh() {
      const host = root.querySelector('[data-templates-root]');
      if (host) host.outerHTML = markup();
    }

    function refreshResults() {
      const host = root.querySelector('[data-templates-root]');
      if (!host) return;
      const items = filtered();
      host.querySelector('[data-template-list]').innerHTML = listMarkup(items);
      host.querySelector('[data-template-count]').textContent = 'Найдено: ' + items.length;
      host.querySelector('.template-detail').outerHTML = detailMarkup(active(items));
    }

    async function copyOriginal() {
      const item = active();
      if (!item?.text_original) return;
      const output = root.querySelector('[data-template-copy-status]');
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(item.text_original);
        } else {
          const input = document.createElement('textarea');
          input.value = item.text_original;
          input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
          document.body.append(input);
          input.focus();
          input.select();
          const ok = document.execCommand('copy');
          input.remove();
          if (!ok) throw Error('copy not supported');
        }
        if (output?.isConnected) {
          output.textContent = 'Полный исходный текст скопирован.';
          output.hidden = false;
        }
      } catch {
        if (output?.isConnected) {
          output.textContent = 'Не удалось скопировать автоматически. Выделите текст вручную.';
          output.hidden = false;
        }
      }
    }

    root.addEventListener('click', event => {
      const host = event.target.closest('[data-templates-root]');
      if (!host) return;
      const group = event.target.closest('[data-template-group]');
      if (group) {
        if (groupId !== group.dataset.templateGroup) {
          groupId = group.dataset.templateGroup;
          query = '';
          refresh();
        }
        return;
      }
      const consentButton = event.target.closest('[data-consent-type]');
      if (consentButton) {
        if (consentType !== consentButton.dataset.consentType) {
          consentType = consentButton.dataset.consentType;
          query = '';
          refresh();
        }
        return;
      }
      const itemButton = event.target.closest('[data-template-id]');
      if (itemButton) {
        selected[groupId] = itemButton.dataset.templateId;
        refreshResults();
        if (window.matchMedia('(max-width: 760px)').matches) {
          root.querySelector('[data-template-detail]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
        return;
      }
      if (event.target.closest('[data-template-copy]')) void copyOriginal();
    });

    root.addEventListener('input', event => {
      if (!event.target.matches('[data-template-query]')) return;
      query = event.target.value;
      // Меняем список и карточку, не пересоздавая поисковое поле и клавиатуру iPhone.
      refreshResults();
    });

    return { markup };
  }

  globalThis.AnesthesiaTemplates = { create };
})();
