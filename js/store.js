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
      ...(options.body ? { "Content-Type": "application/json" } : {})
    }
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(`Invalid API response from ${url} (${response.status}).`);
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${response.status}).`);
  }

  return data;
}

// ==========================================
// URL VALIDATION
// ==========================================

function safeImageUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(String(value).trim(), window.location.origin);

    if (!["http:", "https:"].includes(url.protocol)) return "";

    return url.href;
  } catch {
    return "";
  }
}

function safeLinkUrl(value) {
  if (!value) return "";

  const input = String(value).trim();

  if (
    input.startsWith("#") ||
    input.startsWith("/") ||
    input.startsWith("./") ||
    input.startsWith("../")
  ) {
    return input;
  }

  try {
    const url = new URL(input);

    if (!["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

// ==========================================
// INITIAL LOAD
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  fetchStoreBooks();
  loadPublicContent();
  updateCartUI();
});

// ==========================================
// LOAD BOOKS
// ==========================================

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
      const card = document.createElement("article");
      card.className = "product-card";

      const imageBox = document.createElement("div");
      imageBox.className = "product-cover";

      const imageUrl = safeImageUrl(book.image_url);

      if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = `${book.title || "Book"} cover`;
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        image.className = "w-full h-full object-cover";

        image.onerror = () => {
          image.remove();
          imageBox.innerHTML = '<i class="fa-solid fa-book"></i>';
        };

        imageBox.appendChild(image);
      } else {
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-book";
        imageBox.appendChild(icon);
      }

      const info = document.createElement("div");
      info.className = "p-5";

      const category = document.createElement("div");
      category.className = "text-[10px] font-black text-red-600 mb-2";
      category.textContent = book.category || "DEVELOPMENT";

      const title = document.createElement("h3");
      title.className = "font-extrabold text-sm";
      title.textContent = book.title || "Untitled Book";

      const author = document.createElement("p");
      author.className = "text-xs text-gray-500 mt-2";
      author.textContent = book.author || "Unknown author";

      const description = document.createElement("p");
      description.className = "text-xs text-gray-500 mt-2";
      description.textContent = book.description || "";

      const price = document.createElement("p");
      price.className = "font-black text-sm text-red-600 mt-3";
      price.textContent = `${Number(book.price || 0).toFixed(2)} ETB`;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn-primary w-full mt-4";
      button.textContent = "Add to Cart";
      button.addEventListener("click", () => addToCart(book));

      info.append(category, title, author);

      if (book.description) info.appendChild(description);

      info.append(price, button);
      card.append(imageBox, info);
      grid.appendChild(card);
    });

  } catch (error) {
    console.error("Books loading failed:", error);
    grid.textContent = "መጽሐፍትን መጫን አልተቻለም።";
  }
}

// ==========================================
// SHOPPING CART
// ==========================================

function addToCart(book) {
  if (!book || book.id == null) return;

  const price = Number(book.price);

  if (!Number.isFinite(price) || price < 0) {
    alert("የመጽሐፉ ዋጋ ትክክል አይደለም።");
    return;
  }

  const found = cart.find(
    item => Number(item.id) === Number(book.id)
  );

  if (found) {
    found.quantity = Math.min(20, found.quantity + 1);
  } else {
    cart.push({
      id: book.id,
      title: book.title || "Untitled Book",
      price,
      quantity: 1
    });
  }

  updateCartUI();
  alert(`"${book.title || "Book"}" ወደ ጋሪዎ ገብቷል!`);
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

  if (!cart.length) {
    const empty = document.createElement("p");
    empty.className = "text-sm text-gray-400 text-center py-10";
    empty.textContent = "Your cart is empty.";
    container.appendChild(empty);
    return;
  }

  cart.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "flex justify-between items-center border-b pb-3 mb-3 text-xs gap-3";

    const info = document.createElement("div");

    const name = document.createElement("p");
    name.className = "font-bold";
    name.textContent = `${item.title} × ${item.quantity}`;

    const price = document.createElement("p");
    price.className = "text-gray-500 mt-1";
    price.textContent = `${(item.price * item.quantity).toFixed(2)} ETB`;

    info.append(name, price);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-red-500 hover:underline";
    remove.textContent = "Remove";

    remove.addEventListener("click", () => {
      cart.splice(index, 1);
      updateCartUI();
    });

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
      const telegramUrl = safeLinkUrl(data.telegram_url);

      if (telegramUrl) {
        window.open(telegramUrl, "_blank", "noopener,noreferrer");
      }
    }

    cart = [];
    updateCartUI();
    toggleCart();

    if (data.order?.id) {
      alert(`Order #${data.order.id} created.`);
    } else {
      alert("Order created successfully.");
    }

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

  if (results[0].status === "fulfilled") {
    displayPublicArticles(results[0].value);
  } else {
    console.warn("Articles loading failed:", results[0].reason);
  }

  if (results[1].status === "fulfilled") {
    displayPublicEvents(results[1].value);
  } else {
    console.warn("Events loading failed:", results[1].reason);
  }

  if (results[2].status === "fulfilled") {
    displayPublicSettings(results[2].value);
  } else {
    console.warn("Settings loading failed:", results[2].reason);
  }

  if (results[3].status === "fulfilled") {
    displayPublicMembership(results[3].value);
  } else {
    console.warn("Membership loading failed:", results[3].reason);
  }
}

// ==========================================
// DISPLAY PUBLIC ARTICLES
// ==========================================

function displayPublicArticles(data) {
  const root = document.getElementById("articles-grid");

  if (!root || !Array.isArray(data.articles)) return;

  root.replaceChildren();

  if (!data.articles.length) {
    root.textContent = "ምንም ጽሑፍ አልተገኘም።";
    return;
  }

  data.articles.forEach(article => {
    const card = document.createElement("article");
    card.className = "space-y-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm";

    const imageUrl = safeImageUrl(article.image_url);

    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = `${article.title || "Article"} image`;
      image.loading = "lazy";
      image.className = "w-full max-h-64 object-cover rounded-xl";
      card.appendChild(image);
    }

    const category = document.createElement("p");
    category.className = "text-xs text-[#d9381e] font-bold";
    category.textContent = `${article.author || ""} · ${article.category || ""}`;

    const title = document.createElement("h2");
    title.className = "font-serif-custom text-2xl font-bold text-gray-900";
    title.textContent = article.title || "Untitled Article";

    const excerpt = document.createElement("p");
    excerpt.className = "text-gray-700 text-sm leading-relaxed";
    excerpt.textContent = article.excerpt || "";

    const details = document.createElement("details");

    const summary = document.createElement("summary");
    summary.className = "cursor-pointer text-[#d9381e] font-bold text-sm";
    summary.textContent = "Read article";

    const content = document.createElement("div");
    content.className = "mt-4 text-sm leading-7 whitespace-pre-wrap";
    content.textContent = article.content || "";

    details.append(summary, content);
    card.append(category, title, excerpt, details);
    root.appendChild(card);
  });
}

// ==========================================
// DISPLAY PUBLIC EVENTS
// ==========================================

function displayPublicEvents(data) {
  const root = document.getElementById("events-grid");

  if (!root || !Array.isArray(data.events)) return;

  root.replaceChildren();

  if (!data.events.length) {
    root.textContent = "ምንም የተመዘገበ Event የለም።";
    return;
  }

  data.events.forEach(event => {
    const card = document.createElement("article");
    card.className = "bg-white p-5 rounded-xl border shadow-sm";

    const imageUrl = safeImageUrl(event.image_url);

    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = `${event.title || "Event"} image`;
      image.loading = "lazy";
      image.className = "w-full max-h-56 object-cover rounded-lg mb-3";
      card.appendChild(image);
    }

    const title = document.createElement("h3");
    title.className = "font-bold text-gray-900";
    title.textContent = event.title || "Untitled Event";

    const description = document.createElement("p");
    description.className = "text-sm text-gray-600 mt-2";
    description.textContent = event.description || "";

    card.append(title, description);

    if (event.location) {
      const location = document.createElement("p");
      location.className = "text-xs text-gray-500 mt-2";
      location.textContent = event.location;
      card.appendChild(location);
    }

    if (event.event_date) {
      const date = document.createElement("p");
      date.className = "text-xs text-gray-500 mt-1";

      const parsedDate = new Date(event.event_date);

      date.textContent = Number.isNaN(parsedDate.getTime())
        ? String(event.event_date)
        : parsedDate.toLocaleString();

      card.appendChild(date);
    }

    root.appendChild(card);
  });
}

// ==========================================
// DISPLAY PUBLIC MEMBERSHIP
// ==========================================

function displayPublicMembership(data) {
  const root = document.getElementById("membership-grid");
  if (!root) return;

  const plans =
    data.plans ||
    data.memberships ||
    data.membership_plans;

  if (!Array.isArray(plans)) return;

  root.replaceChildren();

  if (!plans.length) {
    root.textContent = "Membership plans are not available.";
    return;
  }

  plans.forEach(plan => {
    const card = document.createElement("article");
    card.className = "bg-white p-6 rounded-2xl border border-gray-200 shadow-sm";

    const title = document.createElement("h3");
    title.className = "text-xl font-bold";
    title.textContent = plan.name || "Membership";

    const description = document.createElement("p");
    description.className = "text-sm text-gray-600 mt-2";
    description.textContent = plan.description || "";

    const price = document.createElement("p");
    price.className = "text-2xl font-bold text-[#d9381e] mt-4";
    price.textContent = `${Number(plan.price || 0).toFixed(2)} ETB`;

    const features = document.createElement("ul");
    features.className = "mt-4 space-y-2 text-sm text-gray-600";

    let featureList = plan.features || [];

    if (typeof featureList === "string") {
      try {
        featureList = JSON.parse(featureList);
      } catch {
        featureList = [];
      }
    }

    if (Array.isArray(featureList)) {
      featureList.forEach(feature => {
        const item = document.createElement("li");
        item.textContent = `✓ ${String(feature)}`;
        features.appendChild(item);
      });
    }

    card.append(title, description, price, features);
    root.appendChild(card);
  });
}

// ==========================================
// DISPLAY PUBLIC SETTINGS
// ==========================================

function displayPublicSettings(data) {
  if (!data || typeof data !== "object") return;

  const settings = data.settings || data;

  if (!settings || typeof settings !== "object") return;

  // ==========================================
  // WEBSITE IDENTITY
  // ==========================================

  const siteTitle = String(settings.site_title || "DevStackReads");
  const siteTagline = String(settings.site_tagline || "LEARN • BUILD • GROW");

  document.title = `${siteTitle} — Learn. Build. Grow.`;

  const headerTitle = document.getElementById("site-title");
  if (headerTitle) headerTitle.textContent = siteTitle;

  const footerTitle = document.getElementById("footer-site-title");
  if (footerTitle) footerTitle.textContent = siteTitle;

  const tagline = document.getElementById("site-tagline");
  if (tagline) tagline.textContent = siteTagline;

  // ==========================================
  // META DESCRIPTION
  // ==========================================

  if (settings.site_description) {
    let meta = document.querySelector('meta[name="description"]');

    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }

    meta.content = String(settings.site_description);
  }

  // ==========================================
  // LOGO
  // ==========================================

  if (settings.logo_url) {
    const logoUrl = safeImageUrl(settings.logo_url);
    const logo = document.getElementById("site-logo");

    if (logo && logoUrl) {
      logo.src = logoUrl;
      logo.alt = `${siteTitle} logo`;
    }
  }

  // ==========================================
  // FAVICON
  // ==========================================

  if (settings.favicon_url) {
    const faviconUrl = safeImageUrl(settings.favicon_url);

    if (faviconUrl) {
      let favicon = document.querySelector('link[rel~="icon"]');

      if (!favicon) {
        favicon = document.createElement("link");
        favicon.rel = "icon";
        document.head.appendChild(favicon);
      }

      favicon.href = faviconUrl;
    }
  }

  // ==========================================
  // HERO CONTENT
  // ==========================================

  const heroTitle = document.getElementById("hero-title");

  if (heroTitle && settings.hero_title) {
    heroTitle.textContent = String(settings.hero_title);
  }

  const heroSubtitle = document.getElementById("hero-subtitle");

  if (heroSubtitle && settings.hero_subtitle) {
    heroSubtitle.textContent = String(settings.hero_subtitle);
  }

  const primaryButton = document.getElementById("hero-primary-button");

  if (primaryButton) {
    if (settings.hero_primary_button_text) {
      primaryButton.textContent = String(settings.hero_primary_button_text);
    }

    if (settings.hero_primary_button_url) {
      const url = safeLinkUrl(settings.hero_primary_button_url);
      if (url) primaryButton.href = url;
    }
  }

  const secondaryButton = document.getElementById("hero-secondary-button");

  if (secondaryButton) {
    if (settings.hero_secondary_button_text) {
      secondaryButton.textContent = String(settings.hero_secondary_button_text);
    }

    if (settings.hero_secondary_button_url) {
      const url = safeLinkUrl(settings.hero_secondary_button_url);
      if (url) secondaryButton.href = url;
    }
  }

  // ==========================================
  // THEME COLORS
  // ==========================================

  const colorSettings = {
    "--primary": settings.primary_color,
    "--primary-color": settings.primary_color,
    "--secondary-color": settings.secondary_color,
    "--accent-color": settings.accent_color,
    "--site-background": settings.background_color,
    "--site-text": settings.text_color
  };

  Object.entries(colorSettings).forEach(([key, value]) => {
    if (typeof value === "string" && value.trim()) {
      document.documentElement.style.setProperty(key, value.trim());
    }
  });

  // ==========================================
  // SEO SETTINGS
  // ==========================================

  const seo = settings.seo_settings || {};

  if (seo.meta_title) {
    document.title = String(seo.meta_title);
  }

  if (seo.meta_description) {
    let description = document.querySelector('meta[name="description"]');

    if (!description) {
      description = document.createElement("meta");
      description.name = "description";
      document.head.appendChild(description);
    }

    description.content = String(seo.meta_description);
  }

  // ==========================================
  // ANNOUNCEMENT BAR
  // ==========================================

  const announcement = settings.announcement_bar || {};
  let bar = document.getElementById("site-announcement");

  if (announcement.enabled && announcement.message) {
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "site-announcement";
      bar.className = "bg-gray-900 text-white text-center text-sm p-3";
      document.body.prepend(bar);
    }

    bar.textContent = String(announcement.message);
    bar.hidden = false;
  } else if (bar) {
    bar.hidden = true;
  }

  // ==========================================
  // MAINTENANCE MODE
  // ==========================================

  if (settings.maintenance_mode === true) {
    console.warn(
      "Maintenance mode is enabled. A public maintenance-page integration is still required."
    );
  }

  // ==========================================
  // SOCIAL LINKS
  // ==========================================

  renderPublicSocialLinks(settings.social_links);

  // ==========================================
  // CONTACT METHODS
  // ==========================================

  renderPublicContactMethods(settings.contact_methods);
}

// ==========================================
// SOCIAL MEDIA LINKS
// ==========================================

function renderPublicSocialLinks(items) {
  if (!Array.isArray(items)) return;

  let root = document.getElementById("dynamic-social-links");

  if (!root) {
    const footer = document.querySelector("footer");
    if (!footer) return;

    root = document.createElement("div");
    root.id = "dynamic-social-links";
    root.className = "flex flex-wrap gap-4 mt-4";
    footer.appendChild(root);
  }

  root.replaceChildren();

  items
    .filter(item => item && item.visible !== false && item.url)
    .forEach(item => {
      const url = safeLinkUrl(item.url);
      if (!url) return;

      const link = document.createElement("a");
      link.href = url;
      link.textContent = item.name || item.platform || "Social media";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "text-sm hover:underline";

      root.appendChild(link);
    });
}

// ==========================================
// CONTACT METHODS
// ==========================================

function renderPublicContactMethods(items) {
  if (!Array.isArray(items)) return;

  let root = document.getElementById("dynamic-contact-methods");

  if (!root) {
    const footer = document.querySelector("footer");
    if (!footer) return;

    root = document.createElement("div");
    root.id = "dynamic-contact-methods";
    root.className = "flex flex-col gap-2 mt-4";
    footer.appendChild(root);
  }

  root.replaceChildren();

  items
    .filter(item => item && item.visible !== false && item.value)
    .forEach(item => {
      const line = document.createElement("p");
      line.className = "text-sm text-gray-500";

      const label = document.createElement("strong");
      label.textContent = item.label || item.type || "Contact";

      const value = document.createElement("span");
      value.textContent = `: ${item.value}`;

      line.append(label, value);
      root.appendChild(line);
    });
}

// ==========================================
// HTML ESCAPING HELPERS
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
