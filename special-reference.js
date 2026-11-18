(() => {
  'use strict';
  const data = globalThis.AnesthesiaSpecialReferenceData;
  const esc = value => String(value ?? '').replace(/[&<>"']/g,
    ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
  const normalize = value => String(value ?? '').toLocaleLowerCase('ru-RU').replaceAll('ё','е').trim();
  const terms = query => normalize(query).split(/\s+/).filter(Boolean);
  const matches = (section, query) => terms(query).every(term =>
    normalize(section.title + ' ' + section.text).includes(term));

  function create(root) {
    let topicId = 'pregnancy';
    const queries = new Map();
    const opened = new Map();
    const current = () => data.topics.find(topic => topic.id === topicId);
    const query = () => queries.get(topicId) ?? '';
    const selectedSections = () => current().sections.filter(section => matches(section, query()));
    const detailsId = id => `sr-section-${id}`;

    function sourceMarkup(ids = current().sources) {
      return data.sources.filter(source => ids.includes(source.id)).map(source =>
        `<li id="sr-source-${source.id}" tabindex="-1" data-reference-source="${source.id}">
          <span class="sr-source-number">${source.id}</span>
          <div><p>${esc(source.title)}</p><div class="sr-source-links">${source.links.map(link =>
            `<a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.label)} ↗</a>`).join('')}</div></div>
        </li>`).join('');
    }

    function sectionMarkup(section, index) {
      const expanded = opened.get(section.id) ?? (index === 0);
      return `<details class="sr-section ui-card${section.review ? ' sr-section-review' : ''}"
        id="${detailsId(section.id)}" data-reference-section="${section.id}"${expanded ? ' open' : ''}>
        <summary><span>${esc(section.title)}</span><span class="sr-section-toggle" aria-hidden="true"></span></summary>
        <div class="sr-content">${section.html}</div>
      </details>`;
    }

    function resultMarkup() {
      const sections = selectedSections();
      const searching = terms(query()).length > 0;
      return `<p class="sr-search-status" role="status" aria-live="polite"${searching ? '' : ' hidden'}>${sections.length
        ? `Разделов: ${sections.length}` : 'Ничего не найдено. Измените запрос или выберите другую тему.'}</p>
        <div class="sr-sections">${sections.map(sectionMarkup).join('')}</div>`;
    }

    function markup() {
      const topic = current();
      return `<section class="sr-page" data-reference-root aria-label="Клиническая справка">
        <div class="sr-topic-switch" role="group" aria-label="Темы справки">
          ${data.topics.map(item => `<button type="button" data-reference-topic="${item.id}"
            aria-pressed="${item.id === topicId}">${esc(item.label)}</button>`).join('')}
        </div>
        <header class="sr-heading"><h2>${esc(topic.title)}</h2><span class="sr-date">${esc(data.reviewed)}</span></header>
        <p class="sr-scope">${esc(topic.summary)}</p>
        <div class="sr-search-row">
          <label for="sr-query" class="sr-search-label">Поиск по теме
            <input id="sr-query" type="search" value="${esc(query())}" autocomplete="off" spellcheck="false"
              placeholder="Название препарата или вопрос" aria-controls="sr-results">
          </label>
          <button type="button" class="ui-icon-button sr-clear" data-reference-clear aria-label="Очистить поиск"
            title="Очистить поиск"${query() ? '' : ' hidden'}>×</button>
        </div>
        <nav class="sr-shortcuts" aria-label="Быстрые переходы по теме">
          ${topic.quick.map(item => `<button type="button" data-reference-jump="${item.id}">${esc(item.label)}</button>`).join('')}
        </nav>
        <div id="sr-results" data-reference-results>${resultMarkup()}</div>
        <details class="sr-sources ui-card" data-reference-source-list>
          <summary>Источники и версии <span>${topic.sources.length}</span></summary>
          <ol class="sr-source-list">${sourceMarkup()}</ol>
        </details>
      </section>`;
    }

    function highlight() {
      const words = terms(query());
      if (!words.length) return;
      const contents = root.querySelectorAll('[data-reference-results] .sr-content');
      for (const content of contents) {
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.parentElement.closest('a,mark,.sr-mobile-label')) nodes.push(node);
        }
        for (const node of nodes) {
          const raw = node.textContent;
          // Search normalization replaces one character with one character.
          const haystack = raw.toLocaleLowerCase('ru-RU').replaceAll('ё','е');
          const ranges = [];
          for (const word of words) {
            let at = 0;
            while ((at = haystack.indexOf(word, at)) !== -1) {
              ranges.push([at, at + word.length]);
              at += word.length;
            }
          }
          if (!ranges.length) continue;
          ranges.sort((a,b) => a[0]-b[0]);
          const merged = [];
          for (const range of ranges) {
            const last = merged.at(-1);
            if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
            else merged.push([...range]);
          }
          const fragment = document.createDocumentFragment();
          let at = 0;
          for (const [start,end] of merged) {
            fragment.append(document.createTextNode(raw.slice(at,start)));
            const mark = document.createElement('mark');
            mark.textContent = raw.slice(start,end);
            fragment.append(mark);
            at = end;
          }
          fragment.append(document.createTextNode(raw.slice(at)));
          node.replaceWith(fragment);
        }
      }
    }

    function renderResults() {
      const results = root.querySelector('[data-reference-results]');
      if (!results) return;
      results.innerHTML = resultMarkup();
      const clear = root.querySelector('[data-reference-clear]');
      if (clear) clear.hidden = !query();
      highlight();
    }

    function refresh() { highlight(); }

    root.addEventListener('input', event => {
      if (event.target.id !== 'sr-query') return;
      queries.set(topicId,event.target.value);
      renderResults();
    });
    root.addEventListener('toggle', event => {
      const section = event.target;
      if (section.dataset.referenceSection) opened.set(section.dataset.referenceSection, section.open);
    }, true);
    root.addEventListener('click', event => {
      const topicButton = event.target.closest('[data-reference-topic]');
      if (topicButton) {
        if (!data.topics.some(topic => topic.id === topicButton.dataset.referenceTopic)) return;
        topicId = topicButton.dataset.referenceTopic;
        const page = root.querySelector('[data-reference-root]');
        if (!page) return;
        page.outerHTML = markup();
        refresh();
        root.querySelector(`[data-reference-topic="${topicId}"]`)?.focus({preventScroll:true});
        return;
      }
      if (event.target.closest('[data-reference-clear]')) {
        queries.set(topicId,'');
        const field = root.querySelector('#sr-query');
        if (field) { field.value=''; field.focus({preventScroll:true}); }
        renderResults();
        return;
      }
      const jump = event.target.closest('[data-reference-jump]');
      if (jump) {
        const id = jump.dataset.referenceJump;
        if (!current().sections.some(section => section.id === id)) return;
        queries.set(topicId,'');
        root.querySelector('#sr-query').value = '';
        opened.set(id,true);
        renderResults();
        const section = root.querySelector(`#${detailsId(id)}`);
        section?.querySelector('summary')?.focus({preventScroll:true});
        section?.scrollIntoView({block:'start',behavior:'auto'});
        return;
      }
      const citation = event.target.closest('[data-reference-sources]');
      if (citation) {
        event.preventDefault();
        const ids = citation.dataset.referenceSources.split(',').map(Number);
        const sourceList = root.querySelector('[data-reference-source-list]');
        if (!sourceList) return;
        // Include cross-topic sources explicitly referenced by a paragraph.
        const missing = ids.filter(id => !current().sources.includes(id));
        if (missing.length) sourceList.querySelector('ol').innerHTML=sourceMarkup([...current().sources,...missing]);
        sourceList.open = true;
        for (const item of sourceList.querySelectorAll('[data-reference-source]')) {
          item.classList.toggle('sr-source-selected',ids.includes(Number(item.dataset.referenceSource)));
        }
        const target = sourceList.querySelector(`#sr-source-${ids[0]}`);
        target?.focus({preventScroll:true});
        target?.scrollIntoView({block:'center',behavior:'auto'});
      }
    });
    return { markup, refresh };
  }

  globalThis.AnesthesiaSpecialReference = {create};
  if (typeof module !== 'undefined') module.exports = {normalize,matches};
})();
