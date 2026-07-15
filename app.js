const DATA_URL = "./data/festival-data-v0.2.json";
const STORAGE_KEY = "fgf-2026-favorites";
const TASTING_STORAGE_KEY = "fgf-2026-tastings";

const state = {
  exhibitors: [],
  query: "",
  filter: "all",
  favorites: loadFavorites(),
  tastings: loadTastings(),
  openExhibitorId: null,
};

const app = document.querySelector("#app");
const searchInput = document.querySelector("#search-input");
const filters = document.querySelector("#category-filters");
const favoriteCount = document.querySelector("#favorite-count");
const resultSummary = document.querySelector("#result-summary");
const toTop = document.querySelector("#to-top");
const sendListForm = document.querySelector("#send-list-form");
const sendListMessage = document.querySelector("#send-list-message");

function loadFavorites() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return new Set(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set();
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.favorites]));
  } catch {
    // Favoritter virker fortsatt i denne fanen hvis lagring er utilgjengelig.
  }
}

function loadTastings() {
  try {
    const stored = JSON.parse(localStorage.getItem(TASTING_STORAGE_KEY));
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

function saveTastings() {
  try {
    localStorage.setItem(TASTING_STORAGE_KEY, JSON.stringify(state.tastings));
  } catch {
    // Smaksnotater virker fortsatt i denne fanen hvis lagring er utilgjengelig.
  }
}

function favoriteId(product) {
  return product.favoriteId || product.id;
}

function normalize(value) {
  return String(value || "").toLocaleLowerCase("nb-NO");
}

function categoryLabel(category) {
  return ({ gin: "Gin", mixer: "Tonic / mixer", "ready-to-drink": "Ready-to-drink", cocktail: "Cocktail", content: "Innhold" })[category] || category;
}

function bottlePlaceholder() {
  return `<svg class="product__placeholder" aria-hidden="true" viewBox="0 0 32 52"><path fill="currentColor" d="M12 1h8v11l4 6v29a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V18l4-6V1Zm2 3v9l-3 6v28c0 .6.4 1 1 1h8c.6 0 1-.4 1-1V19l-4-6V4h-3Z"/></svg>`;
}

function glassIcon() {
  return `<svg aria-hidden="true" viewBox="0 0 32 32"><path d="M4.5 5h23L17 17.2V27h5v2H10v-2h5v-9.8L4.5 5Zm4.4 2 7.1 8.3L23.1 7H8.9Z"/></svg>`;
}

function contentCard(product) {
  const url = product.productUrl ? escapeAttribute(product.productUrl) : "";
  const logo = product.imageUrl
    ? `<img class="content-card__logo" src="${escapeAttribute(product.imageUrl)}" alt="Alt om Gin" loading="lazy" decoding="async">`
    : "";

  return `
    <article class="content-card">
      <div class="content-card__image">${logo}</div>
      <div class="content-card__body">
        <p class="content-card__label">Kunnskap og inspirasjon</p>
        <h3>Alt om gin og tilbehør</h3>
        <p>Utforsk Nordens største nettsted om gin, tonic, garnityr og gode kombinasjoner.</p>
        ${url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">Besøk Alt om Gin ↗</a>` : ""}
      </div>
    </article>`;
}

function productCard(product) {
  if (product.category === "content") return contentCard(product);

  const id = favoriteId(product);
  const isFavorite = state.favorites.has(id);
  const tasting = state.tastings[id];
  const isTasted = Boolean(tasting?.tasted);
  const rating = Number(tasting?.rating) || 0;
  const name = escapeHtml(product.name || "Uten navn");
  const nameElement = product.productUrl
    ? `<a class="product__name" href="${escapeAttribute(product.productUrl)}" target="_blank" rel="noopener noreferrer">${name} <span class="sr-only">(åpnes i ny fane)</span></a>`
    : `<span class="product__name">${name}</span>`;
  const image = product.imageUrl
    ? `<img class="product__image" src="${escapeAttribute(product.imageUrl)}" alt="" loading="lazy" decoding="async" onerror="this.hidden=true">`
    : bottlePlaceholder();

  const ratingControls = isTasted ? `
    <div class="rating" role="group" aria-label="Vurder ${name}">
      <span class="rating__label">Din vurdering</span>
      <div class="rating__choices">
        ${[1, 2, 3, 4, 5, 6].map((value) => `<button class="rating__button${rating === value ? " is-selected" : ""}" type="button" data-rating="${value}" data-product-id="${escapeAttribute(id)}" aria-pressed="${rating === value}" aria-label="Terningkast ${value}">${["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][value - 1]}</button>`).join("")}
      </div>
    </div>` : "";

  return `
    <article class="product">
      <div class="product__image-wrap">${image}</div>
      <div class="product__content">
        ${nameElement}
        <p class="product__meta">
          <span>${escapeHtml(categoryLabel(product.category))}</span>
          ${product.retailer ? `<span>${escapeHtml(product.retailer)}</span>` : ""}
        </p>
      </div>
      <div class="product__actions">
        <button class="tasted${isTasted ? " is-tasted" : ""}" type="button" data-tasted-id="${escapeAttribute(id)}" aria-pressed="${isTasted}" aria-label="${isTasted ? "Marker som ikke smakt" : "Marker som smakt"}">${glassIcon()}</button>
        <button class="favorite${isFavorite ? " is-favorite" : ""}" type="button" data-favorite-id="${escapeAttribute(id)}" aria-pressed="${isFavorite}" aria-label="${isFavorite ? "Fjern fra favoritter" : "Legg til som favoritt"}">♥</button>
      </div>
      ${ratingControls}
    </article>`;
}

function exhibitorCard(exhibitor, products) {
  const isOpen = state.openExhibitorId === exhibitor.id;
  const panelId = `products-${exhibitor.id}`;
  const isContent = products.every((product) => product.category === "content");
  const itemWord = isContent ? (products.length === 1 ? "ressurs" : "ressurser") : (products.length === 1 ? "produkt" : "produkter");
  const website = exhibitor.websiteUrl
    ? `<a class="exhibitor__website" href="${escapeAttribute(exhibitor.websiteUrl)}" target="_blank" rel="noopener noreferrer">Besøk nettside ↗</a>`
    : "";

  return `
    <section class="exhibitor${isOpen ? " is-open" : ""}">
      <header class="exhibitor__header">
        <div class="exhibitor__info">
          <span class="exhibitor__kicker">${products.length} ${itemWord}</span>
          <button class="exhibitor__title" type="button" data-exhibitor-id="${escapeAttribute(exhibitor.id)}" aria-expanded="${isOpen}" aria-controls="${panelId}">${escapeHtml(exhibitor.name)}</button>
          ${website}
        </div>
        <button class="exhibitor__toggle" type="button" data-exhibitor-id="${escapeAttribute(exhibitor.id)}" aria-expanded="${isOpen}" aria-controls="${panelId}">${isOpen ? "Lukk" : "Vis produkter"}</button>
      </header>
      <div id="${panelId}" class="products"${isOpen ? "" : " hidden"}>${isOpen ? products.map(productCard).join("") : ""}</div>
    </section>`;
}

function visibleExhibitors() {
  return state.exhibitors.map((exhibitor) => {
    const exhibitorMatch = normalize(exhibitor.name).includes(state.query);
    const products = (exhibitor.products || []).filter((product) => {
      const queryMatch = !state.query || exhibitorMatch || normalize(product.name).includes(state.query);
      const filterMatch = state.filter === "all"
        || (state.filter === "favorites" ? state.favorites.has(favoriteId(product)) : product.category === state.filter);
      return queryMatch && filterMatch;
    });
    return { exhibitor, products };
  }).filter(({ products }) => products.length);
}

function render() {
  const visible = visibleExhibitors();
  const productTotal = visible.reduce((sum, item) => sum + item.products.length, 0);
  favoriteCount.textContent = state.favorites.size;
  resultSummary.textContent = `${productTotal} ${productTotal === 1 ? "produkt" : "produkter"} fra ${visible.length} ${visible.length === 1 ? "utstiller" : "utstillere"}`;

  if (!visible.length) {
    const favoritesEmpty = state.filter === "favorites" && state.favorites.size === 0;
    app.innerHTML = `<div class="status"><h2>${favoritesEmpty ? "Ingen favoritter ennå" : "Ingen treff"}</h2><p>${favoritesEmpty ? "Trykk på hjertet ved et produkt for å lagre det her." : "Prøv et annet søk eller filter."}</p></div>`;
  } else {
    app.innerHTML = visible.map(({ exhibitor, products }) => exhibitorCard(exhibitor, products)).join("");
  }
  app.setAttribute("aria-busy", "false");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function allProducts() {
  return state.exhibitors.flatMap((exhibitor) => (exhibitor.products || []).map((product) => ({ ...product, exhibitorName: exhibitor.name })));
}

function productsForEmail(listType) {
  const products = allProducts();
  if (listType === "favorites") {
    return products.filter((product) => state.favorites.has(favoriteId(product)));
  }
  return products.filter((product) => state.tastings[favoriteId(product)]?.tasted || state.favorites.has(favoriteId(product)));
}

function emailBody(products, sharedWithBrewery) {
  const lines = [
    "Hei!",
    "",
    "Her er listen din fra Fredrikstad Ginfestival 2026:",
    "",
  ];

  products.forEach((product) => {
    const id = favoriteId(product);
    const details = [];
    if (state.favorites.has(id)) details.push("favoritt");
    if (state.tastings[id]?.tasted) details.push("smakt");
    if (state.tastings[id]?.rating) details.push(`terningkast ${state.tastings[id].rating}`);
    lines.push(`• ${product.name} — ${product.exhibitorName}${details.length ? ` (${details.join(", ")})` : ""}`);
    if (product.productUrl) lines.push(`  ${product.productUrl}`);
  });

  lines.push("", "Takk for besøket, og velkommen tilbake til Fredrikstad Ginfestival!");
  if (sharedWithBrewery) {
    lines.push("", "Du er også med i trekningen av 2 billetter til neste års arrangement.");
  }
  return lines.join("\n");
}

searchInput.addEventListener("input", (event) => {
  state.query = normalize(event.target.value.trim());
  render();
});

filters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  filters.querySelectorAll("[data-filter]").forEach((item) => {
    const active = item === button;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  render();
});

app.addEventListener("click", (event) => {
  const exhibitorButton = event.target.closest("[data-exhibitor-id]");
  if (exhibitorButton) {
    const id = exhibitorButton.dataset.exhibitorId;
    state.openExhibitorId = state.openExhibitorId === id ? null : id;
    render();
    return;
  }

  const button = event.target.closest("[data-favorite-id]");
  if (button) {
    const id = button.dataset.favoriteId;
    state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
    saveFavorites();
    render();
    return;
  }

  const tastedButton = event.target.closest("[data-tasted-id]");
  if (tastedButton) {
    const id = tastedButton.dataset.tastedId;
    if (state.tastings[id]?.tasted) {
      delete state.tastings[id];
    } else {
      state.tastings[id] = { tasted: true, rating: null };
    }
    saveTastings();
    render();
    return;
  }

  const ratingButton = event.target.closest("[data-rating]");
  if (ratingButton) {
    const id = ratingButton.dataset.productId;
    state.tastings[id] = { tasted: true, rating: Number(ratingButton.dataset.rating) };
    saveTastings();
    render();
  }
});

window.addEventListener("scroll", () => toTop.classList.toggle("is-visible", window.scrollY > 650), { passive: true });
toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

sendListForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!sendListForm.reportValidity()) return;

  const listType = event.submitter?.dataset.listType || "favorites";
  const products = productsForEmail(listType);
  if (!products.length) {
    sendListMessage.textContent = listType === "favorites"
      ? "Du har ikke lagret noen favoritter ennå."
      : "Du har ikke markert noen produkter som smakt eller favoritt ennå.";
    return;
  }

  const email = document.querySelector("#list-email").value.trim();
  const sharedWithBrewery = document.querySelector("#share-with-brewery").checked;
  const subject = listType === "favorites"
    ? "Mine favoritter fra Fredrikstad Ginfestival 2026"
    : "Min smaksliste fra Fredrikstad Ginfestival 2026";
  const parameters = [
    `subject=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(emailBody(products, sharedWithBrewery))}`,
  ];
  if (sharedWithBrewery) parameters.push(`cc=${encodeURIComponent("kontakt@fredrikstadbryggeri.no")}`);

  sendListMessage.textContent = "Åpner en ferdig e-post …";
  window.location.href = `mailto:${encodeURIComponent(email)}?${parameters.join("&")}`;
});

async function init() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.exhibitors)) throw new Error("Ugyldig datastruktur");
    state.exhibitors = [...data.exhibitors].sort((a, b) => a.name.localeCompare(b.name, "nb-NO", { sensitivity: "base" }));
    render();
  } catch (error) {
    console.error("Kunne ikke laste festivaldata:", error);
    app.setAttribute("aria-busy", "false");
    app.innerHTML = `<div class="status status--error"><h2>Festivalguiden kunne ikke lastes</h2><p>Prøv å laste siden på nytt. Hvis problemet fortsetter, kom tilbake litt senere.</p></div>`;
    resultSummary.textContent = "";
  }
}

init();
