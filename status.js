const DATA_URL = "./data/festival-data-v0.2.json";
const EVENT_YEAR = 2026;
const API_BASE_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:8787"
  : "https://ginfestival-2026-api.ole-leister.workers.dev";

const statsList = document.querySelector("#stats-list");
const statsUpdated = document.querySelector("#stats-updated");
const statsDevices = document.querySelector("#stats-devices");
const statsFilters = [...document.querySelectorAll("[data-stats-filter]")];
let statisticsByProduct = [];
let productsById = new Map();

function statisticsCategory(category) {
  if (["gin", "cocktail"].includes(category)) return "gin";
  if (["mixer", "ready-to-drink"].includes(category)) return "other";
  return null;
}

function favoriteId(product) {
  return product.favoriteId || product.id;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function buildProductIndex(exhibitors) {
  const products = new Map();
  exhibitors.forEach((exhibitor) => {
    (exhibitor.products || []).forEach((product) => {
      const id = favoriteId(product);
      const existing = products.get(id);
      if (existing) {
        if (!existing.exhibitors.includes(exhibitor.name)) existing.exhibitors.push(exhibitor.name);
      } else {
        products.set(id, {
          name: product.name || id,
          exhibitors: [exhibitor.name],
          category: product.category,
        });
      }
    });
  });
  return products;
}

function voteText(count) {
  return `basert på ${count} ${count === 1 ? "stemme" : "stemmer"}`;
}

function renderStatistics(gins, productIndex) {
  if (!gins.length) {
    statsList.innerHTML = '<div class="status"><h2>Ingen terningkast ennå</h2><p>Resultatene vises her når den første stemmen er registrert.</p></div>';
    return;
  }

  const numberFormat = new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });

  statsList.innerHTML = gins.map((gin, index) => {
    const product = productIndex.get(gin.ginId);
    const name = product?.name || gin.ginId;
    const exhibitors = product?.exhibitors.join(" · ") || "Ukjent produkt-ID";
    return `
      <article class="stats-card">
        <span class="stats-card__rank" aria-label="Plass ${index + 1}">${index + 1}</span>
        <div class="stats-card__info">
          <h3>${escapeHtml(name)}</h3>
          <p>${escapeHtml(exhibitors)}</p>
        </div>
        <div class="stats-card__score">
          <strong>${numberFormat.format(gin.averageRating)}</strong>
          <span>av 6 · ${voteText(gin.ratingCount)}</span>
        </div>
      </article>`;
  }).join("");
}

function setFilter(filter) {
  statsFilters.forEach((button) => {
    const active = button.dataset.statsFilter === filter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const visibleStatistics = filter === "all"
    ? statisticsByProduct
    : statisticsByProduct.filter((item) => item.category === filter);
  renderStatistics(visibleStatistics, productsById);
}

function renderUniqueDevices(uniqueDevices) {
  statsDevices.innerHTML = `
    <strong>Stemmer fra ${uniqueDevices.total} unike ${uniqueDevices.total === 1 ? "enhet" : "enheter"}</strong>
    <span>${uniqueDevices.gin} på gin · ${uniqueDevices.other} på tonic / andre produkter</span>`;
}

async function init() {
  try {
    const [dataResponse, statisticsResponse] = await Promise.all([
      fetch(DATA_URL),
      fetch(`${API_BASE_URL}/api/statistics?eventYear=${EVENT_YEAR}`),
    ]);
    if (!dataResponse.ok || !statisticsResponse.ok) throw new Error("Kunne ikke hente data");

    const [data, statistics] = await Promise.all([
      dataResponse.json(),
      statisticsResponse.json(),
    ]);
    if (!Array.isArray(data.exhibitors) || !statistics.success || !Array.isArray(statistics.gins)) {
      throw new Error("Ugyldig datastruktur");
    }

    productsById = buildProductIndex(data.exhibitors);
    statisticsByProduct = statistics.gins
      .map((item) => ({
        ...item,
        category: statisticsCategory(productsById.get(item.ginId)?.category),
      }))
      .filter((item) => item.category);

    const uniqueResponse = await fetch(`${API_BASE_URL}/api/statistics/unique-devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventYear: EVENT_YEAR,
        ginIds: statisticsByProduct.filter((item) => item.category === "gin").map((item) => item.ginId),
        otherIds: statisticsByProduct.filter((item) => item.category === "other").map((item) => item.ginId),
      }),
    });
    if (!uniqueResponse.ok) throw new Error("Kunne ikke hente deltakerstatistikk");
    const uniqueStatistics = await uniqueResponse.json();
    if (!uniqueStatistics.success) throw new Error("Ugyldig deltakerstatistikk");

    renderUniqueDevices(uniqueStatistics.uniqueDevices);
    setFilter("all");
    statsUpdated.textContent = `Oppdatert ${new Intl.DateTimeFormat("nb-NO", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date())}`;
    statsList.setAttribute("aria-busy", "false");
  } catch (error) {
    console.error("Kunne ikke laste statistikk:", error);
    statsList.setAttribute("aria-busy", "false");
    statsList.innerHTML = '<div class="status status--error"><h2>Statistikken kunne ikke lastes</h2><p>Prøv å laste siden på nytt.</p></div>';
  }
}

statsFilters.forEach((button) => {
  button.addEventListener("click", () => setFilter(button.dataset.statsFilter));
});

init();
