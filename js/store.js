
let cart = [];

// ==========================================
// API HELPERS
// ==========================================

async function requestJSON(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body
        ? { "Content-Type": "application/json" }
        : {})
    }
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `Invalid API response from ${url} (${response.status}).`
    );
  }

  if (!response.ok || data.success === false) {
    throw new Error(
      data.message || `Request failed (${response.status}).`
    );
  }

  return data;
}

// ==========================================
// IMAGE URL VALIDATION
// ==========================================

function safeImageUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(
      String(value).trim(),
      window.location.origin
    );

    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

// ==========================================
// LOAD BOOKS
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  fetchStoreBooks();
  loadPublicContent();
  updateCartUI();
});

async function fetchStoreBooks() {
  const grid = document.getElementById("product-grid");

  if (!grid) return;

  grid.textContent = "መጽሐፍት በመጫን ላይ...";

  try {
    const data = await requestJSON("/api/books");

    grid.replaceChildren();

    if (!Array.isArray(data.books) || data.books.length === 0) {
      grid.textContent = "ምንም መጽሐፍ አልተገኘም።";
      return;
    }

    data.books.forEach(book => {
      const row = document.createElement("div");

      row.className =
        "flex items-center justify-between border-b border-gray-100 pb-3 gap-3";

      // BOOK IMAGE CONTAINER
      const imageBox = document.createElement("div");

      imageBox.className =
        "w-16 h-20 shrink-0 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center";

      // Fallback when image is unavailable
      const fallback = document.createElement("span");

      fallback.className =
        "text-[10px] text-gray-400 text-center p-1";

      fallback.textContent = "No image";

      imageBox.appendChild(fallback);

      const imageUrl = safeImageUrl(book.image_url);

      if (imageUrl) {
        const image = document.createElement("img");

        image.src = imageUrl;
        image.alt = `${book.title || "Book"} cover`;
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";

        image.className = "w-full h-full object-cover";

        image.onload = () => {
          fallback.classList.add("hidden");
        };

        image.onerror = () => {
          image.remove();
          fallback.classList.remove("hidden");
        };

        imageBox.appendChild(image);
      }

      // BOOK INFORMATION
      const info = document.createElement("div");

      info.className = "flex-1 min-w-0";

      const title = document.createElement("h4");

      title.className =
        "font-bold text-xs text-gray-900";

      title.textContent = book.title || "Untitled Book";

      const meta = document.createElement("p");

      meta.className = "text-[11px] text-gray-500";

      meta.textContent =
        `${book.author || "Unknown author"} — ${Number(book.price || 0).toFixed(2)} ETB`;

      const description = document.createElement("p");

      description.className =
        "text-[11px] text-gray-500 mt-1";

      description.textContent =
        book.description || "";

      info.append(title, meta);

      if (book.description) {
        info.appendChild(description);
      }

      // BUY BUTTON
      const button = document.createElement("button");

      button.type = "button";

      button.className =
        "bg-[#d9381e] hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shrink-0";

      button.textContent = "Buy";

      button.addEventListener("click", () => {
        addToCart(book);
      });

      row.append(imageBox, info, button);

      grid.appendChild(row);
    });

  } catch (error) {
    console.error("Books loading failed:", error);

    grid.textContent =
      "መጽሐፍትን መጫን አልተቻለም።";
  }
}

// ==========================================
// SHOPPING CART
// ==========================================

function addToCart(book) {
  const found = cart.find(
    item => Number(item.id) === Number(book.id)
  );

  if (found) {
    found.quantity = Math.min(20, found.quantity + 1);
  } else {
    cart.push({
      id: book.id,
      title: book.title,
      price: Number(book.price),
      quantity: 1
    });
  }

  updateCartUI();

  alert(`"${book.title}" ወደ ጋሪዎ ገብቷል!`);
}

function updateCartUI() {
  const badge = document.getElementById("cart-badge");
  const mobile = document.getElementById("cart-badge-mobile");
  const container = document.getElementById("cart-items");
  const totalEl = document.getElementById("cart-total");

  const count = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const total = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  if (badge) badge.textContent = count;

  if (mobile) mobile.textContent = count;

  if (totalEl) {
    totalEl.textContent = `${total.toFixed(2)} ETB`;
  }

  if (!container) return;

  container.replaceChildren();

  cart.forEach((item, index) => {
    const row = document.createElement("div");

    row.className =
      "flex justify-between items-center border-b pb-2 text-xs";

    const info = document.createElement("div");

    const name = document.createElement("p");

    name.className = "font-bold";

    name.textContent =
      `${item.title} × ${item.quantity}`;

    const price = document.createElement("p");

    price.textContent =
      `${(item.price * item.quantity).toFixed(2)} ETB`;

    info.append(name, price);

    const remove = document.createElement("button");

    remove.type = "button";
    remove.className = "text-red-500 hover:underline";
    remove.textContent = "Remove";

    remove.onclick = () => {
      cart.splice(index, 1);
      updateCartUI();
    };

    row.append(info, remove);

    container.appendChild(row);
  });
}

// ==========================================
// CHECKOUT
// ==========================================

async function openCheckout() {
  if (!cart.length) {
    alert("ጋሪዎ ባዶ ነው!");
    return;
  }

  try {
    // Correct consolidated authentication endpoint
    const me = await requestJSON("/api/auth?action=me");

    if (!me.user) {
      alert("Please log in before checkout.");

      toggleCart();
      openAuthModal("login");

      return;
    }

    const data = await requestJSON("/api/orders", {
      method: "POST",

      body: JSON.stringify({
        items: cart.map(item => ({
          id: item.id,
          quantity: item.quantity
        }))
      })
    });

    if (data.telegram_url) {
      window.open(
        data.telegram_url,
        "_blank",
        "noopener"
      );
    }

    cart = [];

    updateCartUI();

    toggleCart();

    alert(`Order #${data.order.id} created.`);

  } catch (error) {
    console.error("Checkout failed:", error);

    alert(error.message || "Could not complete checkout.");
  }
}

// ==========================================
// CART DRAWER
// ==========================================

function toggleCart() {
  document
    .getElementById("cart-drawer")
    ?.classList.toggle("translate-x-full");
}

// ==========================================
// LOAD PUBLIC CONTENT
// ==========================================

async function loadPublicContent() {
  const results = await Promise.allSettled([
    requestJSON("/api/articles"),
    requestJSON("/api/events"),
    requestJSON("/api/settings"),
    requestJSON("/api/membership")
  ]);

  const articlesResult = results[0];
  const eventsResult = results[1];
  const settingsResult = results[2];

  // ARTICLES
  if (articlesResult.status === "fulfilled") {
    displayPublicArticles(articlesResult.value);
  } else {
    console.warn(
      "Articles could not be loaded:",
      articlesResult.reason
    );
  }

  // EVENTS
  if (eventsResult.status === "fulfilled") {
    displayPublicEvents(eventsResult.value);
  } else {
    console.warn(
      "Events could not be loaded:",
      eventsResult.reason
    );
  }

  // SETTINGS
  if (settingsResult.status === "fulfilled") {
    displayPublicSettings(settingsResult.value);
  } else {
    console.warn(
      "Settings could not be loaded:",
      settingsResult.reason
    );
  }

  // Membership data is fetched independently.
  if (results[3].status === "rejected") {
    console.warn(
      "Membership plans could not be loaded:",
      results[3].reason
    );
  }
}

// ==========================================
// DISPLAY PUBLIC ARTICLES
// ==========================================

function displayPublicArticles(data) {
  const articleRoot = document.getElementById("articles");

  if (!articleRoot || !Array.isArray(data.articles)) return;

  if (data.articles.length === 0) return;

  const existing = articleRoot.querySelectorAll(
    ":scope > article"
  );

  if (existing.length > 0) return;

  const cards = data.articles.map(article => {
    const imageUrl = safeImageUrl(article.image_url);

    return `
      <article class="space-y-4 bg-white p-8 rounded-2xl border border-gray-200 shadow-xs">

        ${imageUrl
          ? `
            <img
              src="${escapeAttr(imageUrl)}"
              alt="${escapeHtml(article.title)}"
              loading="lazy"
              class="w-full max-h-64 object-cover rounded-xl"
            >
          `
          : ""
        }

        <div class="text-xs text-[#d9381e] font-bold">
          ${escapeHtml(article.author)}
          ·
          ${escapeHtml(article.category)}
        </div>

        <h2 class="font-serif-custom text-3xl font-bold text-gray-900">
          ${escapeHtml(article.title)}
        </h2>

        <p class="text-gray-700 text-sm leading-relaxed">
          ${escapeHtml(article.excerpt || "")}
        </p>

        <details>
          <summary class="cursor-pointer text-[#d9381e] font-bold text-sm">
            Read article
          </summary>

          <div class="mt-4 text-sm leading-7 whitespace-pre-wrap">
            ${escapeHtml(article.content)}
          </div>
        </details>

      </article>
    `;
  }).join("");

  articleRoot.insertAdjacentHTML(
    "afterbegin",
    cards
  );
}

// ==========================================
// DISPLAY PUBLIC EVENTS
// ==========================================

function displayPublicEvents(data) {
  const eventSection = document.getElementById("events");

  if (!eventSection || !Array.isArray(data.events)) return;

  if (data.events.length === 0) {
    eventSection.innerHTML =
      '<p class="text-sm text-gray-500">ምንም የተመዘገበ Event የለም።</p>';

    return;
  }

  eventSection.innerHTML = data.events.map(event => {
    const imageUrl = safeImageUrl(event.image_url);

    return `
      <div class="bg-white p-5 rounded-xl border">

        ${imageUrl
          ? `
            <img
              src="${escapeAttr(imageUrl)}"
              alt="${escapeHtml(event.title)}"
              loading="lazy"
              class="w-full max-h-56 object-cover rounded-lg mb-3"
            >
          `
          : ""
        }

        <h3 class="font-bold">
          ${escapeHtml(event.title)}
        </h3>

        <p class="text-sm text-gray-600 mt-2">
          ${escapeHtml(event.description || "")}
        </p>

        ${event.location
          ? `
            <p class="text-xs text-gray-500 mt-2">
              ${escapeHtml(event.location)}
            </p>
          `
          : ""
        }

        ${event.event_date
          ? `
            <p class="text-xs text-gray-500 mt-1">
              ${escapeHtml(new Date(event.event_date).toLocaleString())}
            </p>
          `
          : ""
        }

      </div>
    `;
  }).join("");
}

// ==========================================
// DISPLAY PUBLIC SETTINGS
// ==========================================

function displayPublicSettings(data) {
  if (!data.success || !data.settings) return;

  const settings = data.settings;

  if (settings.site_title) {
    document.title = String(settings.site_title);
  }

  const siteTitle = document.getElementById("site-title");

  if (siteTitle && settings.site_title) {
    siteTitle.textContent = settings.site_title;
  }

  const heroTitle = document.getElementById("hero-title");

  if (heroTitle && settings.hero_title) {
    heroTitle.textContent = settings.hero_title;
  }
}

// ==========================================
// HTML ESCAPING
// ==========================================

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}
