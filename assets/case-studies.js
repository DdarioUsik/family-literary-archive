(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const filters = { cases: "all", buyers: "all", query: "" };
  const labels = { family:"Семейная компания", partner:"Партнёрство и доля", sale:"Продажа каталога", diary:"Личный архив" };

  function sourceLinks(ids, sources) {
    const byId = new Map(sources.map(source => [source.id, source]));
    return `<ul class="case-citations">${ids.map(id => {
      const source = byId.get(id);
      if (!source) return "";
      return `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)} ↗</a><span>${escapeHtml(source.evidence)}</span></li>`;
    }).join("")}</ul>`;
  }

  function renderCase(item, sources) {
    const categoryLabels = item.filter.map(key => labels[key] || key).join(" · ");
    return `<article class="case-card" id="${escapeHtml(item.id)}" data-filter="${escapeHtml(item.filter.join(" "))}" data-search="${escapeHtml([item.title,item.authors,item.model,item.genres,item.summary,item.transfer,item.family_match].join(" ").toLocaleLowerCase("ru"))}">
      <div class="case-card-head"><div class="case-card-title"><div class="case-card-meta"><span>${escapeHtml(item.year)}</span><span>${escapeHtml(categoryLabels)}</span></div><h3>${escapeHtml(item.title)}</h3><p class="case-authors">${escapeHtml(item.authors)}</p></div><div class="case-figure"><b>${escapeHtml(item.headline)}</b><span>${escapeHtml(item.headline_label)}</span></div></div>
      <p class="case-summary">${escapeHtml(item.summary)}</p>
      <details class="case-details"><summary>Смотреть ход сделки, цифры и выводы для семьи <span>＋</span></summary>
        <div class="case-details-body"><div class="case-detail-column"><h4>Как развивалась история</h4><ol class="case-timeline">${item.timeline.map(text => `<li>${escapeHtml(text)}</li>`).join("")}</ol></div>
          <div class="case-detail-column"><h4>Что известно о деньгах</h4><div class="money-breakdown">${item.money.map(row => `<div><b>${escapeHtml(row.value)}</b><span>${escapeHtml(row.label)}</span></div>`).join("")}</div><p class="money-caveat">${escapeHtml(item.money_caveat)}</p></div>
          <div class="case-transfer"><h4>Что отсюда переносится на семейный архив</h4><p>${escapeHtml(item.transfer)}</p><span class="fit-statement">Сходство с портфелем: ${escapeHtml(item.family_match)}</span></div>
          <div class="case-evidence"><h4>Источники по этой истории</h4>${sourceLinks(item.source_ids, sources)}</div>
        </div>
      </details></article>`;
  }

  function renderBuyer(route, sources) {
    return `<article class="buyer-card" data-buyer-category="${escapeHtml(route.category)}"><div class="buyer-card-top"><span>${escapeHtml(route.title)}</span><b>${escapeHtml(route.category.toUpperCase())}</b></div><dl>
      <div><dt>Что покупают</dt><dd>${escapeHtml(route.buys)}</dd></div>
      <div><dt>Где искать в этом архиве</dt><dd>${escapeHtml(route.family)}</dd></div>
      <div><dt>Рыночный след</dt><dd>${escapeHtml(route.proof)}</dd></div>
      </dl>${sourceLinks(route.sources, sources)}</article>`;
  }

  function renderSource(source, check) {
    const status = check?.status === "verified" ? "Проверена" : "Требует повторной проверки";
    return `<li class="source-row"><div><span class="source-row-id">${escapeHtml(source.id)} · ${escapeHtml(source.tier)}</span><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)} ↗</a><p>${escapeHtml(source.evidence)}</p></div><span class="source-row-status">${status}</span></li>`;
  }

  function applyCaseFilters() {
    const query = filters.query.trim().toLocaleLowerCase("ru");
    let visible = 0;
    document.querySelectorAll(".case-card").forEach(card => {
      const typeMatch = filters.cases === "all" || card.dataset.filter.split(" ").includes(filters.cases);
      const queryMatch = !query || card.dataset.search.includes(query);
      card.hidden = !(typeMatch && queryMatch);
      if (!card.hidden) visible++;
    });
    $("#case-count").textContent = `Показано историй: ${visible} из ${document.querySelectorAll(".case-card").length}`;
    $("#case-empty").hidden = visible > 0;
  }

  function bindControls() {
    $("#case-search").addEventListener("input", event => { filters.query = event.target.value; applyCaseFilters(); });
    document.querySelectorAll(".case-filter").forEach(button => button.addEventListener("click", () => {
      filters.cases = button.dataset.filter;
      document.querySelectorAll(".case-filter").forEach(item => { const active = item === button; item.classList.toggle("is-active", active); item.setAttribute("aria-pressed", String(active)); });
      applyCaseFilters();
    }));
    document.querySelectorAll(".buyer-tab").forEach(button => button.addEventListener("click", () => {
      filters.buyers = button.dataset.buyerFilter;
      document.querySelectorAll(".buyer-tab").forEach(item => { const active = item === button; item.classList.toggle("is-active", active); item.setAttribute("aria-pressed", String(active)); });
      document.querySelectorAll(".buyer-card").forEach(card => { card.hidden = filters.buyers !== "all" && card.dataset.buyerCategory !== filters.buyers; });
    }));
  }

  async function init() {
    try {
      const [caseResponse, checkResponse] = await Promise.all([fetch("assets/cases.json"), fetch("assets/case-source-checks.json")]);
      if (!caseResponse.ok || !checkResponse.ok) throw new Error("Не удалось загрузить локальные карточки.");
      const data = await caseResponse.json();
      const checks = await checkResponse.json();
      $("#case-grid").innerHTML = data.cases.map(item => renderCase(item, data.sources)).join("");
      $("#buyer-grid").innerHTML = data.buyers.map(item => renderBuyer(item, data.sources)).join("");
      const checkedById = new Map(checks.sources.map(source => [source.id, source]));
      $("#case-source-list").innerHTML = data.sources.map(source => renderSource(source, checkedById.get(source.id))).join("");
      $("#source-validation").textContent = `${checks.summary.verified_sources} из ${checks.summary.total_sources} внешних ссылок повторно открыты и подтверждены · ${checks.checked_at.slice(0,10)} · неразрешённых ссылок: ${checks.summary.unresolved_sources}.`;
      bindControls();
      applyCaseFilters();
    } catch (error) {
      $("#case-count").textContent = "Карточки кейсов загрузить не удалось.";
      $("#source-validation").textContent = "Журнал проверки источников не загрузился. Обновите страницу или скачайте исходные JSON-файлы.";
      console.error(error);
    }
  }
  init();
})();
