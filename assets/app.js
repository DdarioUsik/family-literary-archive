const tierLabels = {
  primary_library: 'Библиотека / архив', primary_official: 'Официальный источник',
  primary_newspaper_scan: 'Газетный первоисточник',
  primary_law: 'Закон / регулятор', primary_platform_terms: 'Условия платформы',
  primary_publisher: 'Издатель', primary_theatre: 'Театр / репертуар',
  primary_company: 'Компания / отчёт', secondary_biography: 'Биографический источник',
  secondary_bibliography: 'Библиография', secondary_market: 'Рынок / аналог',
};
let data;
let activeAuthor = '';

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const year = record => record.earliest_observed_date ? record.earliest_observed_date : 'дата уточняется';

async function start() {
  try {
    const response = await fetch('assets/data.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    setStats();
    drawAuthorFilters();
    drawKinds();
    drawCatalog();
    drawSources();
    drawMaterials();
    wireControls();
  } catch (error) {
    document.getElementById('catalog-count').textContent = 'Не удалось загрузить исследовательский набор';
    console.error('Site data did not load', error);
  }
}

function setStats() {
  document.querySelector('[data-stat="records"]').textContent = data.catalog.length;
  document.querySelector('[data-stat="sources"]').textContent = data.validation.verified_sources;
}

function drawAuthorFilters() {
  const authors = [...new Set(data.catalog.map(x => x.author))];
  const container = document.getElementById('author-filters');
  container.innerHTML = `<button class="filter-chip active" data-author="">Все авторы · ${data.catalog.length}</button>` + authors.map(name =>
    `<button class="filter-chip" data-author="${escapeHtml(name)}">${escapeHtml(name === 'Виктор Типот' ? 'Виктор Типот — Гинзбург' : name)}</button>`
  ).join('');
  container.addEventListener('click', event => {
    const button = event.target.closest('[data-author]');
    if (!button) return;
    activeAuthor = button.dataset.author;
    container.querySelectorAll('.filter-chip').forEach(el => el.classList.toggle('active', el === button));
    drawCatalog();
  });
}

function drawKinds() {
  const select = document.getElementById('kind-filter');
  const kinds = [...new Set(data.catalog.map(x => x.kind))].sort((a, b) => a.localeCompare(b, 'ru'));
  select.innerHTML = '<option value="">Все типы</option>' + kinds.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
}

function filteredRecords() {
  const query = document.getElementById('work-search').value.trim().toLocaleLowerCase('ru');
  const kind = document.getElementById('kind-filter').value;
  return data.catalog.filter(record => {
    const haystack = [record.id, record.author, record.title, record.kind, record.coauthors, record.notes, ...(data.author_aliases?.[record.author] || [])].join(' ').toLocaleLowerCase('ru');
    return (!activeAuthor || record.author === activeAuthor) && (!kind || record.kind === kind) && (!query || haystack.includes(query));
  });
}

function drawCatalog() {
  const rows = filteredRecords();
  const grid = document.getElementById('catalog-grid');
  document.getElementById('catalog-count').textContent = `${rows.length} из ${data.catalog.length} записей · произведения, части, версии и открытые вопросы`;
  document.getElementById('catalog-empty').hidden = rows.length !== 0;
  grid.innerHTML = rows.map(record => {
    const links = record.source_ids.map(id => {
      const source = data.sources.find(x => x.id === id);
      return source ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer" aria-label="Открыть источник ${escapeHtml(id)}">${escapeHtml(id)}</a>` : '';
    }).join('');
    const recordAnchor = record.id.toLowerCase();
    return `<article class="work-card">
      <div class="work-card-top"><span class="work-card-id">${escapeHtml(record.id)} · ${escapeHtml(year(record))}</span><span class="work-kind">${escapeHtml(record.kind)}</span></div>
      <h3>${escapeHtml(record.title)}</h3><span class="work-author">${escapeHtml(record.author)}</span>
      <p class="work-notes">${escapeHtml(record.notes || record.digital_availability || 'Описание ожидает сверки с экземпляром.')}</p>
      <span class="catalog-reading-status">${escapeHtml(data.reading_index?.[record.id]?.badge || 'Читательский материал ожидает текста')}</span>
      <div class="work-card-links"><a class="reading-link" href="library.html#${recordAnchor}">${data.reading_index?.[record.id]?.format === 'candidate' ? 'Проверить библиографическую наводку' : data.reading_index?.[record.id] ? 'Читать / узнать текст' : 'Сверить произведение'} ↗</a><span class="work-source-links">${links || '<span>источник не установлен</span>'}</span></div>
    </article>`;
  }).join('');
}

function drawSources() {
  const tiers = [...new Set(data.sources.map(x => x.tier))].sort();
  const select = document.getElementById('source-tier');
  select.innerHTML = '<option value="">Все типы источников</option>' + tiers.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(tierLabels[t] || t.replaceAll('_', ' '))}</option>`).join('');
  const render = () => {
    const query = document.getElementById('source-search').value.trim().toLocaleLowerCase('ru');
    const tier = select.value;
    const rows = data.sources.filter(s => (!tier || s.tier === tier) && (!query || `${s.id} ${s.relevance_note} ${s.claim_ids.join(' ')}`.toLocaleLowerCase('ru').includes(query)));
    document.getElementById('source-count').textContent = `${rows.length} / ${data.sources.length} источников`;
    document.getElementById('source-grid').innerHTML = rows.map(s => `<article class="source-card"><div class="source-card-top"><span class="source-id">${escapeHtml(s.id)}</span><span class="source-tier">${escapeHtml(tierLabels[s.tier] || s.tier.replaceAll('_', ' '))}</span></div><p>${escapeHtml(s.relevance_note)}</p><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">Открыть оригинал ↗</a></article>`).join('');
  };
  document.getElementById('source-search').addEventListener('input', render);
  select.addEventListener('change', render);
  render();
}

function drawMaterials() {
  const host = document.getElementById('materials-grid');
  const jsonDescriptions = {
    'catalog.json': 'Машиночитаемый семейный каталог', 'sources.json': 'Библиографические и правовые источники',
    'validation.json': 'Результат контроля комплекта',
  };
  const cards = data.documents.map(doc => ({ title: doc.title, slug: doc.slug, type: 'Отчёт', url: `materials/${doc.slug}.html`, download: `materials/${doc.slug}.md` }));
  Object.entries(jsonDescriptions).forEach(([filename, note]) => cards.push({ title: filename, slug: filename, type: 'Данные · JSON', note, url: `materials/${filename}`, download: `materials/${filename}` }));
  cards.push({title:'Читальня: карточки произведений', type:'Чтение и семейная сверка', url:'library.html', download:'assets/reading.json'});
  cards.push({title:'Проверка источников читальни', type:'Журнал · JSON', url:'assets/reading-source-checks.json', download:'assets/reading-source-checks.json'});
  host.innerHTML = cards.map(item => `<article class="material-card"><span class="material-type">${escapeHtml(item.type)}</span><h3>${escapeHtml(item.title)}</h3><div class="material-actions"><a href="${escapeHtml(item.url)}">Открыть ↗</a><a href="${escapeHtml(item.download)}" download>Скачать ↓</a></div></article>`).join('');
  document.getElementById('material-count').textContent = `${cards.length} материалов`;
}

function wireControls() {
  document.getElementById('work-search').addEventListener('input', drawCatalog);
  document.getElementById('kind-filter').addEventListener('change', drawCatalog);
  const toggle = document.querySelector('.menu-toggle');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    document.querySelector('.main-nav').classList.toggle('open', open);
  });
  document.querySelectorAll('.main-nav a').forEach(a => a.addEventListener('click', () => {
    document.querySelector('.main-nav').classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }));
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      document.getElementById('work-search').focus();
      document.getElementById('catalog').scrollIntoView({ behavior: 'smooth' });
    }
  });
}

start();
