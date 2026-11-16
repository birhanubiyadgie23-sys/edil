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

    card.className =
      "space-y-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm";

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
    category.textContent =
      `${article.author || ""} · ${article.category || ""}`;

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
      image.className =
        "w-full max-h-56 object-cover rounded-lg mb-3";

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

    card.className =
      "bg-white p-6 rounded-2xl border border-gray-200 shadow-sm";

    const title = document.createElement("h3");
    title.className = "text-xl font-bold";
    title.textContent = plan.name || "Membership";

    const description = document.createElement("p");
    description.className = "text-sm text-gray-600 mt-2";
    description.textContent = plan.description || "";

    const price = document.createElement("p");
    price.className = "text-2xl font-bold text-[#d9381e] mt-4";
    price.textContent =
      `${Number(plan.price || 0).toFixed(2)} ETB`;

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
  if (!data || !data.success || !data.settings) return;

  const settings = data.settings;

  // WEBSITE IDENTITY
  if (settings.site_title) {
    document.title = String(settings.site_title);

    const siteTitle =
      document.getElementById("site-title") ||
      document.querySelector("header .logo-text");

    if (siteTitle) {
      siteTitle.textContent = settings.site_title;
    }
  }

  if (settings.site_tagline) {
    const tagline =
      document.getElementById("site-tagline");

    if (tagline) {
      tagline.textContent = settings.site_tagline;
    }
  }

  // LOGO
  if (settings.logo_url) {
    const logoUrl = safeImageUrl(settings.logo_url);

    const logo = document.getElementById("site-logo");

    if (logo && logoUrl) {
      logo.src = logoUrl;
      logo.alt = settings.site_title || "Website logo";
    }
  }

  // FAVICON
  if (settings.favicon_url) {
    const faviconUrl = safeImageUrl(settings.favicon_url);

    if (faviconUrl) {
      let favicon = document.querySelector("link[rel~='icon']");

      if (!favicon) {
        favicon = document.createElement("link");
        favicon.rel = "icon";
        document.head.appendChild(favicon);
      }

      favicon.href = faviconUrl;
    }
  }

  // HERO
  const heroTitle =
    document.getElementById("hero-title") ||
    document.querySelector(".hero-title");

  if (heroTitle && settings.hero_title) {
    heroTitle.textContent = settings.hero_title;
  }

  const heroSubtitle =
    document.getElementById("hero-subtitle");

  if (heroSubtitle && settings.hero_subtitle) {
    heroSubtitle.textContent = settings.hero_subtitle;
  }

  // HERO BUTTONS
  const primaryButton =
    document.getElementById("hero-primary-button");

  if (primaryButton) {
    if (settings.hero_primary_button_text) {
      primaryButton.textContent =
        settings.hero_primary_button_text;
    }

    if (settings.hero_primary_button_url) {
      primaryButton.href =
        safeImageUrl(settings.hero_primary_button_url) ||
        settings.hero_primary_button_url;
    }
  }

  const secondaryButton =
    document.getElementById("hero-secondary-button");

  if (secondaryButton) {
    if (settings.hero_secondary_button_text) {
      secondaryButton.textContent =
        settings.hero_secondary_button_text;
    }

    if (settings.hero_secondary_button_url) {
      secondaryButton.href =
        settings.hero_secondary_button_url;
    }
  }

  // COLORS
  const colorSettings = {
    "--primary-color": settings.primary_color,
    "--secondary-color": settings.secondary_color,
    "--accent-color": settings.accent_color,
    "--site-background": settings.background_color,
    "--site-text": settings.text_color
  };

  Object.entries(colorSettings).forEach(([key, value]) => {
    if (value) {
      document.documentElement.style.setProperty(key, value);
    }
  });

  // SEO
  const seo = settings.seo_settings || {};

  if (seo.meta_title) {
    document.title = seo.meta_title;
  }

  if (seo.meta_description) {
    let description =
      document.querySelector('meta[name="description"]');

    if (!description) {
      description = document.createElement("meta");
      description.name = "description";
      document.head.appendChild(description);
    }

    description.content = seo.meta_description;
  }

  // ANNOUNCEMENT BAR
  const announcement = settings.announcement_bar || {};

  if (announcement.enabled && announcement.message) {
    let bar = document.getElementById("site-announcement");

    if (!bar) {
      bar = document.createElement("div");
      bar.id = "site-announcement";
      bar.className =
        "bg-gray-900 text-white text-center text-sm p-3";

      document.body.prepend(bar);
    }

    bar.textContent = announcement.message;
    bar.hidden = false;
  }

  // MAINTENANCE MODE
  if (settings.maintenance_mode === true) {
    console.warn(
      "Maintenance mode is enabled in settings. Public maintenance-page integration is still required."
    );
  }

  // SOCIAL LINKS
  renderPublicSocialLinks(settings.social_links);

  // CONTACT METHODS
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
      try {
        const url = new URL(item.url);

        if (!["https:", "http:"].includes(url.protocol)) return;

        const link = document.createElement("a");

        link.href = url.href;
        link.textContent =
          item.name || item.platform || "Social media";

        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "text-sm hover:underline";

        root.appendChild(link);
      } catch {
        // Ignore invalid URLs.
      }
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
