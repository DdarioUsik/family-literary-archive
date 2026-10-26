const EUR = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const routeMeta = {
  license: { name: 'Лицензии', css: 'license' },
  own: { name: 'Собственные продукты', css: 'own' },
  hybrid: { name: 'Гибрид + архивный пилот', css: 'hybrid' },
};
const tierLabels = {
  primary_library: 'Библиотека / архив', primary_official: 'Официальный источник',
  primary_law: 'Закон / регулятор', primary_platform_terms: 'Условия платформы',
  primary_publisher: 'Издатель', primary_theatre: 'Театр / репертуар',
  primary_company: 'Компания / отчёт', secondary_biography: 'Биографический источник',
  secondary_bibliography: 'Библиография', secondary_market: 'Рынок / аналог',
};
let data;
let activeAuthor = '';
let activeScenario = 'base';
let activeHorizon = 36;

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const money = value => EUR.format(Math.round(Number(value || 0))).replace(/\u00a0/g, ' ');
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
    drawEconomics();
    wireControls();
  } catch (error) {
    document.getElementById('catalog-count').textContent = 'Не удалось загрузить исследовательский набор';
    console.error('Site data did not load', error);
  }
}

function setStats() {
  document.querySelector('[data-stat="records"]').textContent = data.catalog.length;
  document.querySelector('[data-stat="sources"]').textContent = data.validation.verified_sources;
  document.getElementById('material-count').textContent = `${data.documents.length + 13} материалов`;
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
    const strategyAnchor = record.id.toLowerCase();
    return `<article class="work-card">
      <div class="work-card-top"><span class="work-card-id">${escapeHtml(record.id)} · ${escapeHtml(year(record))}</span><span class="work-kind">${escapeHtml(record.kind)}</span></div>
      <h3>${escapeHtml(record.title)}</h3><span class="work-author">${escapeHtml(record.author)}</span>
      <p class="work-notes">${escapeHtml(record.notes || record.digital_availability || 'Описание ожидает сверки с экземпляром.')}</p>
      <span class="catalog-reading-status">${escapeHtml(data.reading_index?.[record.id]?.badge || 'Читательский материал ожидает текста')}</span>
      <div class="work-card-links"><a class="reading-link" href="library.html#${strategyAnchor}">${data.reading_index?.[record.id] ? 'Читать / узнать текст' : 'Сверить произведение'} ↗</a><a href="materials/work-strategies.html#${strategyAnchor}">Стратегия ↗</a><span class="work-source-links">${links || '<span>источник не установлен</span>'}</span></div>
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
    'catalog.json': 'Машиночитаемый каталог 86 записей', 'sources.json': 'Реестр 62 внешних ссылок',
    'source-log.json': 'Повторная проверка и claim log', 'search-log.json': 'Запросы и ветки поиска',
    'rights-register.json': 'Документы, доли и подтверждённые права', 'model-inputs.json': 'Допущения денежной модели',
    'model-results.json': 'Расчёт сценариев 12 и 36 месяцев', 'flagship-inputs.json': 'Допущения по пяти приоритетам',
    'flagship-results.json': 'Расчёты по пяти приоритетам', 'validation.json': 'Результат контроля комплекта',
    'browser-reopens.json': 'Особые способы повторной проверки ссылок',
  };
  const cards = data.documents.map(doc => ({ title: doc.title, slug: doc.slug, type: 'Отчёт', url: `materials/${doc.slug}.html`, download: `materials/${doc.slug}.md` }));
  Object.entries(jsonDescriptions).forEach(([filename, note]) => cards.push({ title: filename, slug: filename, type: 'Данные · JSON', note, url: `materials/${filename}`, download: `materials/${filename}` }));
  cards.push({title:'Читальня: карточки произведений', type:'Чтение и семейная сверка', url:'library.html', download:'assets/reading.json'});
  cards.push({title:'Проверка источников читальни', type:'Журнал · JSON', url:'assets/reading-source-checks.json', download:'assets/reading-source-checks.json'});
  host.innerHTML = cards.map(item => `<article class="material-card"><span class="material-type">${escapeHtml(item.type)}</span><h3>${escapeHtml(item.title)}</h3><div class="material-actions"><a href="${escapeHtml(item.url)}">Открыть ↗</a><a href="${escapeHtml(item.download)}" download>Скачать ↓</a></div></article>`).join('');
  document.getElementById('material-count').textContent = `${cards.length} материалов`;
}

function drawEconomics() {
  const models = data.models.rows.filter(row => row.scenario_key === activeScenario && row.horizon_months === activeHorizon);
  const scenarioName = models[0]?.scenario || 'Базовый';
  document.getElementById('economics-title').textContent = `${scenarioName} сценарий · ${activeHorizon} месяцев`;
  const order = ['license', 'own', 'hybrid'];
  const rows = order.map(route => models.find(row => row.route === route)).filter(Boolean);
  document.getElementById('economics-rows').innerHTML = rows.map(row => `<tr><td>${routeMeta[row.route].name}</td><td>${money(row.product_retail_ex_vat)}</td><td>${money(row.family_receipts_before_costs)}</td><td>${money(row.cost_total)}</td><td class="${row.family_cash_before_tax >= 0 ? 'positive' : 'negative'}">${money(row.family_cash_before_tax)}</td></tr>`).join('');
  drawChart(rows);
  const hybrid = rows.find(x => x.route === 'hybrid');
  document.getElementById('model-caveat').textContent = hybrid && activeScenario === 'high' && activeHorizon === 36
    ? 'Верхний гибрид: 6 книжных сделок, 150 показов, 2 опциона и 19 000 собственных продаж. Эти объёмы не подтверждены.'
    : 'Суммы накопительные, до налогов и часов семьи. Фактический спрос и доля наследников пока не установлены.';
}

function drawChart(rows) {
  const svg = document.getElementById('economics-chart');
  const zeroX = 445, half = 240;
  const max = Math.max(...rows.map(row => Math.abs(row.family_cash_before_tax)), 1000);
  const yTop = 25, rowHeight = 70, baseline = yTop + rowHeight * 2.75;
  const xZero = zeroX;
  let markup = `<line class="chart-zero" x1="${xZero}" y1="12" x2="${xZero}" y2="232"/><text class="chart-label" x="${xZero-8}" y="251" text-anchor="end">расходы</text><text class="chart-label" x="${xZero+8}" y="251">доходы</text>`;
  rows.forEach((row, index) => {
    const y = yTop + index * rowHeight;
    const amount = row.family_cash_before_tax;
    const width = Math.abs(amount) / max * half;
    const x = amount < 0 ? xZero - width : xZero;
    const valueX = amount < 0 ? x - 8 : x + width + 8;
    markup += `<line class="chart-grid-line" x1="195" y1="${y+33}" x2="750" y2="${y+33}"/>`;
    markup += `<text class="chart-label" x="0" y="${y+30}">${escapeHtml(routeMeta[row.route].name)}</text>`;
    markup += `<rect class="chart-bar-${routeMeta[row.route].css}" x="${x}" y="${y+12}" width="${Math.max(width,2)}" height="25" rx="2"/>`;
    markup += `<text class="chart-value" x="${valueX}" y="${y+30}" text-anchor="${amount < 0 ? 'end' : 'start'}">${escapeHtml(money(amount))}</text>`;
  });
  svg.innerHTML = markup;
}

function wireControls() {
  document.getElementById('work-search').addEventListener('input', drawCatalog);
  document.getElementById('kind-filter').addEventListener('change', drawCatalog);
  document.getElementById('scenario-controls').addEventListener('click', event => {
    const button = event.target.closest('[data-scenario]');
    if (!button) return;
    activeScenario = button.dataset.scenario;
    document.querySelectorAll('[data-scenario]').forEach(el => el.classList.toggle('active', el === button));
    drawEconomics();
  });
  document.getElementById('horizon-controls').addEventListener('click', event => {
    const button = event.target.closest('[data-horizon]');
    if (!button) return;
    activeHorizon = Number(button.dataset.horizon);
    document.querySelectorAll('[data-horizon]').forEach(el => el.classList.toggle('active', el === button));
    drawEconomics();
  });
  document.getElementById('scanned-pages').addEventListener('input', event => {
    const pages = Number(event.target.value);
    document.getElementById('scanned-pages-label').textContent = pages;
    document.getElementById('scan-cost').textContent = money(1780 + (300 - pages) * 0.4);
  });
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
