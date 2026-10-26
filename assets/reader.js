const REVIEW_KEY = 'family-heritage-reading-reviews-v1';
const esc = (value = '') => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const statusLabels = {unreviewed:'Нужно сверить', match:'Узнаю произведение', different:'Ошибка / другая версия'};
let corpus, shelf, selectedId = '', reviews = {}, storageAvailable = true, readingSize = 19;
try { const raw = JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}'); reviews = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}; } catch (_) { storageAvailable = false; }

async function initReader() {
  try {
    const results = await Promise.all([fetch('assets/data.json'), fetch('assets/reading.json')]);
    if (results.some(r => !r.ok)) throw new Error('Читальня временно недоступна');
    [corpus, shelf] = await Promise.all(results.map(r => r.json()));
    const authorSelect = document.getElementById('reading-author');
    authorSelect.innerHTML = '<option value="">Все авторы</option>' + [...new Set(corpus.catalog.map(w => w.author))].map(a => `<option value="${esc(a)}">${esc(displayAuthor(a))}</option>`).join('');
    ['reading-search','reading-author','reading-availability','reading-review-filter'].forEach(id => document.getElementById(id).addEventListener(id === 'reading-search' ? 'input' : 'change', drawShelf));
    document.getElementById('reading-list').addEventListener('click', e => { const b = e.target.closest('[data-work]'); if (b) chooseWork(b.dataset.work, true); });
    window.addEventListener('hashchange', () => { const id = location.hash.slice(1).toUpperCase(); if (corpus.catalog.some(w => w.id === id)) chooseWork(id, false); });
    document.getElementById('export-reviews').addEventListener('click', exportReviews);
    const checked = shelf.sources.filter(s => s.validation_status === 'verified').length;
    document.getElementById('reading-stat').textContent = `${shelf.entries.length} кратких материалов · ${shelf.entries.filter(e => e.format === 'text').length} текста по внешним ссылкам · ${corpus.catalog.length} записей для семейной сверки`;
    document.getElementById('reading-last-check').textContent = `Проверка: ${checked}/${shelf.sources.length} источников · ${shelf.checked_date}`;
    const requested = location.hash.slice(1).toUpperCase();
    chooseWork(corpus.catalog.some(w => w.id === requested) ? requested : 'N07', false);
  } catch (error) {
    document.getElementById('reading-work').innerHTML = '<h1>Читальня временно недоступна</h1><p>Обновите страницу или откройте <a href="index.html#catalog">основной каталог</a>.</p>';
    document.getElementById('reading-stat').textContent = 'Данные пока не загрузились';
    console.error(error);
  }
}

function displayAuthor(author) { return author === 'Виктор Типот' ? 'Виктор Типот — Гинзбург' : author; }
function entryFor(id) { return shelf.entries.find(e => e.id === id); }
function reviewFor(id) { return reviews[id] && typeof reviews[id] === 'object' ? reviews[id] : {status:'unreviewed', note:''}; }
function drawShelf() {
  const query = document.getElementById('reading-search').value.trim().toLocaleLowerCase('ru');
  const author = document.getElementById('reading-author').value;
  const availability = document.getElementById('reading-availability').value;
  const review = document.getElementById('reading-review-filter').value;
  const order = new Map(shelf.entries.map((e, i) => [e.id, i]));
  const works = corpus.catalog.filter(w => {
    const e = entryFor(w.id), aliases = shelf.author_aliases[w.author] || [];
    const haystack = [w.id,w.author,w.title,w.coauthors,...aliases].join(' ').toLocaleLowerCase('ru');
    return (!query || haystack.includes(query)) && (!author || author === w.author) && (availability === 'all' || (availability === 'ready' ? !!e : e?.format === availability)) && (review === 'all' || reviewFor(w.id).status === review);
  }).sort((a,b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  document.getElementById('reading-list-count').textContent = `${works.length} из ${corpus.catalog.length} записей`;
  document.getElementById('reading-list').innerHTML = works.length ? works.map(w => {
    const e = entryFor(w.id), r = reviewFor(w.id), reviewed = r.status === 'match' || r.status === 'different';
    return `<button type="button" class="${selectedId === w.id ? 'selected' : ''}" data-work="${esc(w.id)}" aria-pressed="${selectedId === w.id}"><span class="reader-id">${esc(w.id)}</span>${reviewed ? `<span class="review-mark ${esc(r.status)}">${r.status === 'match' ? '✓ Узнаю' : '↔ Сверить версию'}</span>` : ''}<b>${esc(w.title)}</b><small>${esc(displayAuthor(w.author))}</small><small>${esc(e?.badge || 'Текст ожидает получения')}</small></button>`;
  }).join('') : '<p class="reading-list-empty">По этим фильтрам записей нет. Измените поиск или выберите весь каталог.</p>';
}

function chooseWork(id, focus) {
  selectedId = id;
  const w = corpus.catalog.find(w => w.id === id), entry = entryFor(id);
  if (!entry) document.getElementById('reading-availability').value = 'all';
  if (location.hash.slice(1).toUpperCase() !== id) history.replaceState(null, '', `#${id.toLowerCase()}`);
  drawShelf(); drawWork(w, entry);
  if (focus && matchMedia('(max-width:680px)').matches) document.getElementById('reading-work').scrollIntoView({behavior:'smooth',block:'start'});
  if (focus) document.getElementById('reading-work').focus({preventScroll:true});
}

function sourceLink(s) { return `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a>`; }
function drawWork(w, entry) {
  const host = document.getElementById('reading-work'), r = reviewFor(w.id);
  const author = displayAuthor(w.author);
  const sources = entry ? entry.source_ids.map(id => shelf.sources.find(s => s.id === id)).filter(Boolean) : [];
  const readSource = entry && shelf.sources.find(s => s.id === entry.read_source_id);
  const bibliography = w.source_ids.map(id => corpus.sources.find(s => s.id === id)).filter(Boolean);
  const summary = entry ? `<h2 class="reader-section-name">${esc(entry.heading)}</h2><div class="reader-prose" style="--reading-font:${readingSize}px">${entry.summary.map(p => `<p>${esc(p)}</p>`).join('')}</div>` : `<h2 class="reader-section-name">Оригинал ещё предстоит получить</h2><div class="reader-prose"><p>Для этой записи есть сведения в каталоге. Читательская карточка с пересказом появится после получения и чтения конкретного текста.</p><p>Откройте библиографические источники ниже: заглавие, соавторы, год и принадлежность к сборнику помогут найти нужный экземпляр.</p></div>`;
  host.innerHTML = `<div class="reader-kicker"><span>${esc(w.id)} · ${esc(w.kind)}</span><span class="reader-badge ${esc(entry?.format || '')}">${esc(entry?.badge || 'Текст ожидает получения')}</span></div>
    <h1>${esc(w.title)}</h1><p class="reader-byline">${esc(author)}${w.author === 'Виктор Типот' ? '<span>Виктор Яковлевич Гинзбург — настоящее имя; Типот — псевдоним одного и того же автора.</span>' : ''}${w.coauthors ? `<span>Связанные авторы и версии в каталоге: ${esc(w.coauthors)}</span>` : ''}</p>
    <div class="reader-size"><span>Размер текста</span><button type="button" data-size="-1" aria-label="Уменьшить шрифт">A−</button><button type="button" data-size="1" aria-label="Увеличить шрифт">A+</button><span>${entry?.format === 'text' ? 'Краткий пересказ · около 1 минуты' : 'Материал для знакомства'}</span></div>
    ${summary}${entry?.excerpt ? `<blockquote class="reader-quote"><small>КОРОТКАЯ ЦИТАТА ДЛЯ УЗНАВАНИЯ · ${esc(entry.source_ids[0])}</small>${esc(entry.excerpt)}</blockquote>` : ''}
    ${entry?.spoiler ? `<details class="reader-spoiler"><summary>Показать, чем заканчивается история · спойлер</summary><p>${esc(entry.spoiler)}</p></details>` : ''}
    <section class="reader-identification"><h2>Как узнать произведение</h2><ul>${(entry?.markers || [`Автор в каталоге: ${author}.`, `Наблюдаемая дата: ${w.earliest_observed_date || 'уточняется'}.`, w.parent_id ? `Связь со сборником / основной записью: ${w.parent_id}.` : 'Сверьте титульный лист, начало, окончание и состав соавторов.']).map(m => `<li>${esc(m)}</li>`).join('')}</ul></section>
    <p class="reader-edition">${esc(entry?.edition || w.digital_availability || w.notes)}</p>
    <div class="reader-links">${readSource ? `<a class="button button-dark" href="${esc(readSource.url)}" target="_blank" rel="noopener noreferrer">${esc(entry.read_label)} ↗</a>` : ''}<a class="button button-small" href="materials/work-strategies.html#${esc(w.id.toLowerCase())}">Стратегия произведения ↗</a></div>
    ${entry?.format === 'text' ? '<p class="reader-note">Полный текст открывается у внешнего источника. Здесь — собственный краткий пересказ. У электронной копии ещё предстоит сверить редакцию и качество распознавания.</p>' : ''}
    <details class="reader-evidence" open><summary>Источник и объём проверки</summary><p>${esc(entry?.coverage || 'Содержимое произведения пока не прочитано. Библиографическая запись и владение семейными правами требуют отдельных подтверждений.')}</p>${sources.length ? `<ol>${sources.map(s => `<li>${sourceLink(s)}<br><span class="source-check">${s.validation_status === 'verified' ? 'Страница и тематические маркеры проверены' : 'Доступ к источнику требует дополнительной проверки'} · ${esc(s.checked_at || shelf.checked_date)}</span></li>`).join('')}</ol>` : ''}${bibliography.length ? `<p>Библиографические источники из основного исследования:</p><ol>${bibliography.map(s => `<li>${sourceLink({url:s.url,label:`${s.id} · ${s.relevance_note}`})}</li>`).join('')}</ol>` : ''}</details>
    <section class="reader-verification" aria-label="Семейная сверка"><h2>Это то самое произведение?</h2><p>Отметьте узнавание или расхождение. Семейная отметка помогает сверять каталог; юридическое подтверждение прав оформляется отдельно.</p><div class="review-buttons">${Object.entries(statusLabels).map(([key,label]) => `<button type="button" data-review="${key}" aria-pressed="${(r.status || 'unreviewed') === key}">${esc(label)}</button>`).join('')}</div><label for="family-note">Что узналось, что нужно уточнить<textarea id="family-note" maxlength="10000" placeholder="Например: у нас другой финал; название на обложке отличается…">${esc(r.note || '')}</textarea></label><p id="reader-saved" class="reader-saved" role="status">${storageAvailable ? 'Отметки хранятся в этом браузере. Скачайте их, чтобы перенести на другое устройство.' : 'Хранилище браузера недоступно. Скачайте отметки перед закрытием страницы.'}</p></section>`;
  host.querySelectorAll('[data-size]').forEach(button => button.addEventListener('click', () => {readingSize = Math.max(16, Math.min(26, readingSize + Number(button.dataset.size))); const prose = host.querySelector('.reader-prose'); if (prose) prose.style.setProperty('--reading-font', `${readingSize}px`);}));
  host.querySelectorAll('[data-review]').forEach(button => button.addEventListener('click', () => {
    saveReview(w.id, {status:button.dataset.review});
    host.querySelectorAll('[data-review]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    drawShelf();
  }));
  host.querySelector('#family-note').addEventListener('input', e => saveReview(w.id, {note:e.target.value}));
  document.title = `${w.title} · Читальня семейного наследия`;
}

function saveReview(id, changes) {
  reviews[id] = {...reviewFor(id), ...changes, updated_at:new Date().toISOString()};
  try { localStorage.setItem(REVIEW_KEY, JSON.stringify(reviews)); storageAvailable = true; } catch (_) { storageAvailable = false; }
  document.getElementById('reader-saved').textContent = storageAvailable ? 'Сохранено в этом браузере. Отметки можно скачать кнопкой вверху.' : 'Отметка доступна до закрытия страницы. Скачайте её: хранилище браузера недоступно.';
}

function exportReviews() {
  const knownIds = new Set(corpus.catalog.map(w => w.id));
  const items = Object.entries(reviews).filter(([id,r]) => knownIds.has(id) && (r.status !== 'unreviewed' || r.note)).map(([id,r]) => ({work_id:id, title:corpus.catalog.find(w => w.id === id).title, ...r}));
  const blob = new Blob([JSON.stringify({schema_version:1, exported_at:new Date().toISOString(), meaning:'Семейные читательские отметки; юридический статус прав подтверждается документами.', reviews:items}, null, 2)], {type:'application/json;charset=utf-8'});
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href=url; a.download=`family-reading-reviews-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  const announcement = document.getElementById('reader-announcement'); announcement.textContent = `Подготовлены отметки по ${items.length} произведениям.`; announcement.classList.add('visible'); setTimeout(() => announcement.classList.remove('visible'), 4000);
}

initReader();
