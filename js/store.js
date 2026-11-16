
"use strict";

// ==========================================
// GLOBAL STATE
// ==========================================

let cart = [];
let storeBooks = new Map();
let checkoutInProgress = false;

let publicSettings = {};


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
            `Invalid API response (${response.status}).`
        );
    }

    if (
        !response.ok ||
        !data ||
        typeof data !== "object" ||
        data.success === false
    ) {
        throw new Error(
            data?.message ||
            `Request failed (${response.status}).`
        );
    }

    return data;
}


// ==========================================
// URL VALIDATION
// ==========================================

function safeImageUrl(value) {

    if (
        typeof value !== "string" ||
        !value.trim()
    ) {
        return "";
    }

    try {

        const url = new URL(
            value.trim(),
            window.location.origin
        );

        if (
            !["http:", "https:"].includes(url.protocol) ||
            !url.hostname ||
            url.username ||
            url.password
        ) {
            return "";
        }

        return url.href;

    } catch {
        return "";
    }
}


function safeLinkUrl(value) {

    if (
        typeof value !== "string" ||
        !value.trim()
    ) {
        return "";
    }

    const input = value.trim();

    // Internal page anchors.
    if (input.startsWith("#")) {
        return input;
    }

    // Relative paths. Reject protocol-relative URLs.
    if (
        input.startsWith("/") &&
        !input.startsWith("//")
    ) {
        return input;
    }

    if (
        input.startsWith("./") ||
        input.startsWith("../")
    ) {
        return input;
    }

    try {

        const url = new URL(input);

        if (
            !["https:", "http:", "mailto:", "tel:"].includes(
                url.protocol
            )
        ) {
            return "";
        }

        if (
            ["http:", "https:"].includes(url.protocol) &&
            (
                !url.hostname ||
                url.username ||
                url.password
            )
        ) {
            return "";
        }

        return url.href;

    } catch {
        return "";
    }
}


// ==========================================
// GENERAL HELPERS
// ==========================================

function getBookStock(book) {

    const stock = Number(book?.stock);

    if (
        !Number.isSafeInteger(stock) ||
        stock < 0
    ) {
        return 0;
    }

    return stock;
}


function getBookPrice(book) {

    const price = Number(book?.price);

    if (
        !Number.isFinite(price) ||
        price < 0 ||
        Math.abs(price * 100 - Math.round(price * 100)) > 0.0000001
    ) {
        return null;
    }

    return price;
}


function setText(element, value) {

    if (element) {
        element.textContent = String(value ?? "");
    }
}


function setCartDrawerOpen(open) {

    const drawer = document.getElementById("cart-drawer");

    if (!drawer) return;

    if (open) {
        drawer.classList.remove("translate-x-full");
    } else {
        drawer.classList.add("translate-x-full");
    }
}


function updateBrandTitle(element, title, footer = false) {

    if (!element) return;

    element.replaceChildren();

    if (title === "DevStackReads") {

        const first = document.createTextNode("DevStack");

        const second = document.createElement("span");

        second.textContent = "Reads";

        if (footer) {
            second.className = "text-red-500";
        } else {
            second.style.color = "#e4472e";
        }

        element.append(first, second);

        return;
    }

    element.textContent = title;
}


// ==========================================
// INITIAL LOAD
// ==========================================

function initializeStore() {

    fetchStoreBooks();

    loadPublicContent();

    updateCartUI();
}

if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        initializeStore,
        { once: true }
    );

} else {

    initializeStore();
}


// ==========================================
// LOAD BOOKS
// ==========================================

async function fetchStoreBooks() {

    const grid = document.getElementById("product-grid");

    if (grid) {
        grid.textContent = "መጽሐፍት በመጫን ላይ...";
    }

    try {

        const data = await requestJSON("/api/books");

        if (!Array.isArray(data.books)) {
            throw new Error("Invalid books response.");
        }

        storeBooks = new Map();

        data.books.forEach(book => {

            storeBooks.set(
                String(book.id),
                book
            );

        });

        // Refresh available stock for existing cart items.
        cart.forEach(item => {

            const latest = storeBooks.get(String(item.id));

            item.stock = latest
                ? getBookStock(latest)
                : 0;

        });

        updateCartUI();

        if (!grid) return;

        grid.replaceChildren();

        if (!data.books.length) {

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

                    const icon = document.createElement("i");

                    icon.className = "fa-solid fa-book";

                    imageBox.appendChild(icon);
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

            category.className =
                "text-[10px] font-black text-red-600 mb-2";

            category.textContent = "BOOK";


            const title = document.createElement("h3");

            title.className = "font-extrabold text-sm";

            title.textContent =
                book.title || "Untitled Book";


            const author = document.createElement("p");

            author.className =
                "text-xs text-gray-500 mt-2";

            author.textContent =
                book.author || "Unknown author";


            const description = document.createElement("p");

            description.className =
                "text-xs text-gray-500 mt-2";

            description.textContent =
                book.description || "";


            const price = document.createElement("p");

            price.className =
                "font-black text-sm text-red-600 mt-3";

            const bookPrice = getBookPrice(book);

            price.textContent =
                bookPrice === null
                    ? "Price unavailable"
                    : `${bookPrice.toFixed(2)} ETB`;


            const stock = getBookStock(book);

            const stockInfo = document.createElement("p");

            stockInfo.className =
                "text-xs mt-2 " +
                (stock > 0 ? "text-green-700" : "text-red-600");

            stockInfo.textContent =
                stock > 0
                    ? `Available: ${stock}`
                    : "Out of stock";


            const button = document.createElement("button");

            button.type = "button";

            button.className = "btn-primary w-full mt-4";

            button.textContent =
                stock > 0
                    ? "Add to Cart"
                    : "Out of Stock";

            button.disabled =
                stock <= 0 ||
                bookPrice === null;

            button.addEventListener("click", () => {
                addToCart(book);
            });


            info.append(
                category,
                title,
                author
            );

            if (book.description) {
                info.appendChild(description);
            }

            info.append(
                price,
                stockInfo,
                button
            );

            card.append(
                imageBox,
                info
            );

            grid.appendChild(card);
        });

    } catch (error) {

        console.error("Books loading failed:", error);

        if (grid) {
            grid.textContent =
                "መጽሐፍትን መጫን አልተቻለም።";
        }
    }
}


// ==========================================
// SHOPPING CART
// ==========================================

function addToCart(book) {

    if (!book || book.id == null) {
        return;
    }

    const price = getBookPrice(book);

    if (price === null) {

        alert("የመጽሐፉ ዋጋ ትክክል አይደለም።");

        return;
    }

    const stock = getBookStock(book);

    if (stock <= 0) {

        alert("ይህ መጽሐፍ አሁን ከStock ውጭ ነው።");

        return;
    }

    const id = String(book.id);

    const found = cart.find(
        item => String(item.id) === id
    );

    if (found) {

        if (
            found.quantity >= 20 ||
            found.quantity >= stock
        ) {

            alert(
                `የሚገኘው Stock ${stock} ብቻ ነው።`
            );

            return;
        }

        found.quantity += 1;

        found.stock = stock;

    } else {

        cart.push({
            id: book.id,
            title: book.title || "Untitled Book",
            price,
            stock,
            quantity: 1
        });
    }

    updateCartUI();

    alert(
        `"${book.title || "Book"}" ወደ ጋሪዎ ገብቷል!`
    );
}


// ==========================================
// CART UI
// ==========================================

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


    if (badge) {
        badge.textContent = count;
    }

    if (mobile) {
        mobile.textContent = count;
    }

    if (totalEl) {
        totalEl.textContent =
            `${total.toFixed(2)} ETB`;
    }

    if (!container) return;


    container.replaceChildren();


    if (!cart.length) {

        const empty = document.createElement("p");

        empty.className =
            "text-sm text-gray-400 text-center py-10";

        empty.textContent = "Your cart is empty.";

        container.appendChild(empty);

        return;
    }


    cart.forEach((item, index) => {

        const row = document.createElement("div");

        row.className =
            "flex justify-between items-center border-b pb-3 mb-3 text-xs gap-3";


        const info = document.createElement("div");

        info.className = "min-w-0";


        const name = document.createElement("p");

        name.className = "font-bold";

        name.textContent =
            `${item.title} × ${item.quantity}`;


        const price = document.createElement("p");

        price.className = "text-gray-500 mt-1";

        price.textContent =
            `${(item.price * item.quantity).toFixed(2)} ETB`;


        const stockInfo = document.createElement("p");

        stockInfo.className =
            "text-[10px] mt-1 " +
            (
                item.quantity > item.stock
                    ? "text-red-600"
                    : "text-gray-500"
            );

        stockInfo.textContent =
            item.quantity > item.stock
                ? `Only ${item.stock} available. Update quantity.`
                : `Available stock: ${item.stock}`;


        const controls = document.createElement("div");

        controls.className =
            "flex items-center gap-2 mt-2";


        const decrease = document.createElement("button");

        decrease.type = "button";

        decrease.textContent = "−";

        decrease.className =
            "border rounded px-2 py-1";

        decrease.setAttribute(
            "aria-label",
            "Decrease quantity"
        );

        decrease.addEventListener("click", () => {

            if (item.quantity <= 1) {

                cart.splice(index, 1);

            } else {

                item.quantity -= 1;
            }

            updateCartUI();
        });


        const quantity = document.createElement("span");

        quantity.textContent = item.quantity;


        const increase = document.createElement("button");

        increase.type = "button";

        increase.textContent = "+";

        increase.className =
            "border rounded px-2 py-1";

        increase.setAttribute(
            "aria-label",
            "Increase quantity"
        );

        increase.disabled =
            item.quantity >= 20 ||
            item.quantity >= item.stock;

        increase.addEventListener("click", () => {

            if (
                item.quantity >= 20 ||
                item.quantity >= item.stock
            ) {
                alert(
                    `የሚገኘው Stock ${item.stock} ብቻ ነው።`
                );

                return;
            }

            item.quantity += 1;

            updateCartUI();
        });


        controls.append(
            decrease,
            quantity,
            increase
        );


        info.append(
            name,
            price,
            stockInfo,
            controls
        );


        const remove = document.createElement("button");

        remove.type = "button";

        remove.className =
            "text-red-500 hover:underline shrink-0";

        remove.textContent = "Remove";

        remove.addEventListener("click", () => {

            cart.splice(index, 1);

            updateCartUI();
        });


        row.append(
            info,
            remove
        );

        container.appendChild(row);
    });
}


// ==========================================
// CART DRAWER
// ==========================================

function toggleCart() {

    const drawer = document.getElementById("cart-drawer");

    if (!drawer) return;

    drawer.classList.toggle("translate-x-full");
}


// ==========================================
// CHECKOUT
// ==========================================

async function openCheckout() {

    if (checkoutInProgress) {
        return;
    }

    if (!cart.length) {

        alert("ጋሪዎ ባዶ ነው!");

        return;
    }

    checkoutInProgress = true;


    /*
     * Open a temporary tab immediately during the user's click.
     * This avoids most browser popup-blocking problems after
     * the asynchronous authentication and order requests.
     */

    let telegramWindow = null;

    try {

        telegramWindow = window.open("about:blank", "_blank");

        if (telegramWindow) {
            telegramWindow.opener = null;
        }

    } catch {
        telegramWindow = null;
    }


    try {

        // Recheck current public stock before checkout.
        await fetchStoreBooks();

        const invalidItem = cart.find(
            item =>
                item.stock <= 0 ||
                item.quantity > item.stock
        );

        if (invalidItem) {

            throw new Error(
                `Stock for "${invalidItem.title}" has changed. Please update your cart.`
            );
        }


        // Verify current login session.
        const me = await requestJSON(
            "/api/auth?action=me"
        );

        if (!me.user) {

            if (
                telegramWindow &&
                !telegramWindow.closed
            ) {
                telegramWindow.close();
            }

            setCartDrawerOpen(false);

            if (typeof window.openAuthModal === "function") {
                window.openAuthModal("login");
            } else {
                alert("Please log in before checkout.");
            }

            return;
        }


        // Create the order.
        const data = await requestJSON(
            "/api/orders",
            {
                method: "POST",

                body: JSON.stringify({
                    items: cart.map(item => ({
                        id: item.id,
                        quantity: item.quantity
                    }))
                })
            }
        );


        // The server is authoritative for prices and stock.
        const order = data.order || {};

        const orderId = order.id;

        const orderStatus = order.status || "pending";


        // Validate the Telegram URL returned by the server.
        const telegramUrl = safeLinkUrl(
            data.telegram_url
        );


        // Clear cart only after the server confirms order creation.
        cart = [];

        updateCartUI();


        let telegramOpened = false;

        if (
            telegramWindow &&
            !telegramWindow.closed &&
            telegramUrl
        ) {

            try {

                telegramWindow.location.replace(telegramUrl);

                telegramOpened = true;

            } catch (error) {

                console.warn(
                    "Could not open Telegram window:",
                    error
                );
            }
        }


        if (!telegramOpened) {

            if (
                telegramWindow &&
                !telegramWindow.closed
            ) {
                telegramWindow.close();
            }

            // Show a clickable Telegram link if popup was blocked.
            const container =
                document.getElementById("cart-items");

            if (container) {

                container.replaceChildren();

                const message = document.createElement("p");

                message.className =
                    "text-sm text-green-700 font-bold mb-3";

                message.textContent =
                    `Order #${orderId} created successfully.`;

                const link = document.createElement("a");

                link.href = telegramUrl || "#";

                link.textContent =
                    "Continue to Telegram";

                link.target = "_blank";

                link.rel = "noopener noreferrer";

                link.className =
                    "text-sm text-blue-600 underline";

                if (!telegramUrl) {
                    link.hidden = true;
                }

                container.append(
                    message,
                    link
                );

                setCartDrawerOpen(true);
            }
        } else {

            setCartDrawerOpen(false);
        }


        alert(
            `Order #${orderId} created successfully.\n` +
            `Status: ${orderStatus}\n\n` +
            `Payment is NOT confirmed yet.`
        );

    } catch (error) {

        console.error(
            "Checkout failed:",
            error
        );

        if (
            telegramWindow &&
            !telegramWindow.closed
        ) {
            telegramWindow.close();
        }

        alert(
            error.message ||
            "Could not complete checkout."
        );

    } finally {

        checkoutInProgress = false;
    }
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

        displayPublicArticles(
            results[0].value
        );

    } else {

        console.warn(
            "Articles loading failed:",
            results[0].reason
        );
    }


    if (results[1].status === "fulfilled") {

        displayPublicEvents(
            results[1].value
        );

    } else {

        console.warn(
            "Events loading failed:",
            results[1].reason
        );
    }


    if (results[2].status === "fulfilled") {

        displayPublicSettings(
            results[2].value
        );

    } else {

        console.warn(
            "Settings loading failed:",
            results[2].reason
        );
    }


    if (results[3].status === "fulfilled") {

        displayPublicMembership(
            results[3].value
        );

    } else {

        console.warn(
            "Membership loading failed:",
            results[3].reason
        );
    }
}


// ==========================================
// DISPLAY PUBLIC ARTICLES
// ==========================================

function displayPublicArticles(data) {

    const root = document.getElementById("articles-grid");

    if (
        !root ||
        !Array.isArray(data.articles)
    ) {
        return;
    }

    root.replaceChildren();

    if (!data.articles.length) {

        root.textContent =
            "ምንም ጽሑፍ አልተገኘም።";

        return;
    }


    data.articles.forEach(article => {

        const card = document.createElement("article");

        card.className =
            "space-y-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm";


        const imageUrl = safeImageUrl(
            article.image_url
        );

        if (imageUrl) {

            const image = document.createElement("img");

            image.src = imageUrl;

            image.alt =
                `${article.title || "Article"} image`;

            image.loading = "lazy";

            image.className =
                "w-full max-h-64 object-cover rounded-xl";

            card.appendChild(image);
        }


        const category = document.createElement("p");

        category.className =
            "text-xs text-[#d9381e] font-bold";

        category.textContent =
            `${article.author || ""} · ${article.category || ""}`;


        const title = document.createElement("h2");

        title.className =
            "font-serif-custom text-2xl font-bold text-gray-900";

        title.textContent =
            article.title || "Untitled Article";


        const excerpt = document.createElement("p");

        excerpt.className =
            "text-gray-700 text-sm leading-relaxed";

        excerpt.textContent =
            article.excerpt || "";


        const details = document.createElement("details");

        const summary = document.createElement("summary");

        summary.className =
            "cursor-pointer text-[#d9381e] font-bold text-sm";

        summary.textContent = "Read article";


        const content = document.createElement("div");

        content.className =
            "mt-4 text-sm leading-7 whitespace-pre-wrap";

        content.textContent =
            article.content || "";


        details.append(
            summary,
            content
        );

        card.append(
            category,
            title,
            excerpt,
            details
        );

        root.appendChild(card);
    });
}


// ==========================================
// DISPLAY PUBLIC EVENTS
// ==========================================

function displayPublicEvents(data) {

    const root = document.getElementById("events-grid");

    if (
        !root ||
        !Array.isArray(data.events)
    ) {
        return;
    }

    root.replaceChildren();

    if (!data.events.length) {

        root.textContent =
            "ምንም የተመዘገበ Event የለም።";

        return;
    }


    data.events.forEach(event => {

        const card = document.createElement("article");

        card.className =
            "bg-white p-5 rounded-xl border shadow-sm";


        const imageUrl = safeImageUrl(
            event.image_url
        );

        if (imageUrl) {

            const image = document.createElement("img");

            image.src = imageUrl;

            image.alt =
                `${event.title || "Event"} image`;

            image.loading = "lazy";

            image.className =
                "w-full max-h-56 object-cover rounded-lg mb-3";

            card.appendChild(image);
        }


        const title = document.createElement("h3");

        title.className = "font-bold text-gray-900";

        title.textContent =
            event.title || "Untitled Event";


        const description = document.createElement("p");

        description.className =
            "text-sm text-gray-600 mt-2";

        description.textContent =
            event.description || "";


        card.append(
            title,
            description
        );


        if (event.location) {

            const location = document.createElement("p");

            location.className =
                "text-xs text-gray-500 mt-2";

            location.textContent =
                event.location;

            card.appendChild(location);
        }


        if (event.event_date) {

            const date = document.createElement("p");

            date.className =
                "text-xs text-gray-500 mt-1";

            const parsedDate = new Date(
                event.event_date
            );

            date.textContent =
                Number.isNaN(parsedDate.getTime())
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

    const root = document.getElementById(
        "membership-grid"
    );

    if (!root) return;


    // Membership API returns { success, memberships }.
    const plans = data.memberships;

    if (!Array.isArray(plans)) {

        console.warn(
            "Invalid membership response."
        );

        return;
    }

    root.replaceChildren();

    if (!plans.length) {

        root.textContent =
            "Membership plans are not available.";

        return;
    }


    plans.forEach(plan => {

        const card = document.createElement("article");

        card.className =
            "bg-white p-6 rounded-2xl border border-gray-200 shadow-sm";


        const title = document.createElement("h3");

        title.className = "text-xl font-bold";

        title.textContent =
            plan.name || "Membership";


        const description = document.createElement("p");

        description.className =
            "text-sm text-gray-600 mt-2";

        description.textContent =
            plan.description || "";


        const price = document.createElement("p");

        price.className =
            "text-2xl font-bold text-[#d9381e] mt-4";

        const planPrice = Number(plan.price);

        price.textContent =
            Number.isFinite(planPrice)
                ? `${planPrice.toFixed(2)} ETB`
                : "Price unavailable";


        const duration = document.createElement("p");

        duration.className =
            "text-xs text-gray-500 mt-2";

        duration.textContent =
            `${Number(plan.duration_days || 0)} days`;


        const features = document.createElement("ul");

        features.className =
            "mt-4 space-y-2 text-sm text-gray-600";


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

                if (typeof feature !== "string") {
                    return;
                }

                const item = document.createElement("li");

                item.textContent = `✓ ${feature}`;

                features.appendChild(item);
            });
        }


        card.append(
            title,
            description,
            price,
            duration,
            features
        );

        root.appendChild(card);
    });
}


// ==========================================
// DISPLAY PUBLIC SETTINGS
// ==========================================

function displayPublicSettings(data) {

    if (
        !data ||
        typeof data !== "object"
    ) {
        return;
    }

    const settings =
        data.settings || data;

    if (
        !settings ||
        typeof settings !== "object"
    ) {
        return;
    }

    publicSettings = settings;


    // ======================================
    // WEBSITE IDENTITY
    // ======================================

    const siteTitle = String(
        settings.site_title || "DevStackReads"
    );

    const siteTagline = String(
        settings.site_tagline || "LEARN • BUILD • GROW"
    );

    document.title =
        `${siteTitle} — Learn. Build. Grow.`;


    updateBrandTitle(
        document.getElementById("site-title"),
        siteTitle
    );

    updateBrandTitle(
        document.getElementById("footer-site-title"),
        siteTitle,
        true
    );


    setText(
        document.getElementById("site-tagline"),
        siteTagline
    );


    // ======================================
    // LANGUAGE
    // ======================================

    if (
        typeof settings.default_language === "string" &&
        /^[a-z]{2}(-[A-Z]{2})?$/.test(
            settings.default_language
        )
    ) {
        document.documentElement.lang =
            settings.default_language;
    }


    // ======================================
    // META DESCRIPTION
    // ======================================

    if (settings.site_description) {

        let meta = document.querySelector(
            'meta[name="description"]'
        );

        if (!meta) {

            meta = document.createElement("meta");

            meta.name = "description";

            document.head.appendChild(meta);
        }

        meta.content =
            String(settings.site_description);
    }


    // ======================================
    // LOGO
    // ======================================

    if (settings.logo_url) {

        const logoUrl = safeImageUrl(
            settings.logo_url
        );

        const logo =
            document.getElementById("site-logo");

        if (logo && logoUrl) {

            logo.src = logoUrl;

            logo.alt = `${siteTitle} logo`;
        }
    }


    // ======================================
    // FAVICON
    // ======================================

    if (settings.favicon_url) {

        const faviconUrl = safeImageUrl(
            settings.favicon_url
        );

        if (faviconUrl) {

            let favicon = document.querySelector(
                'link[rel~="icon"]'
            );

            if (!favicon) {

                favicon = document.createElement("link");

                favicon.rel = "icon";

                document.head.appendChild(favicon);
            }

            favicon.href = faviconUrl;
        }
    }


    // ======================================
    // HERO CONTENT
    // Supports existing IDs and hero classes.
    // ======================================

    const heroTitle =
        document.getElementById("hero-title") ||
        document.querySelector(".hero-title");

    if (heroTitle && settings.hero_title) {

        heroTitle.textContent =
            String(settings.hero_title);
    }


    const heroSubtitle =
        document.getElementById("hero-subtitle") ||
        document.querySelector(".hero-subtitle");

    if (heroSubtitle && settings.hero_subtitle) {

        heroSubtitle.textContent =
            String(settings.hero_subtitle);
    }


    const heroContainer =
        heroTitle?.closest("section") ||
        heroTitle?.parentElement;


    const primaryButton =
        document.getElementById("hero-primary-button") ||
        heroContainer?.querySelector('a[href="#shop"]');

    if (primaryButton) {

        if (settings.hero_primary_button_text) {

            primaryButton.textContent =
                String(settings.hero_primary_button_text);
        }

        if (settings.hero_primary_button_url) {

            const url = safeLinkUrl(
                settings.hero_primary_button_url
            );

            if (url) {
                primaryButton.href = url;
            }
        }
    }


    const secondaryButton =
        document.getElementById("hero-secondary-button") ||
        heroContainer?.querySelector('a[href="#articles"]');

    if (secondaryButton) {

        if (settings.hero_secondary_button_text) {

            secondaryButton.textContent =
                String(settings.hero_secondary_button_text);
        }

        if (settings.hero_secondary_button_url) {

            const url = safeLinkUrl(
                settings.hero_secondary_button_url
            );

            if (url) {
                secondaryButton.href = url;
            }
        }
    }


    // ======================================
    // THEME COLORS
    // Match the CSS variables used by homepage.
    // ======================================

    const colorSettings = {

        "--primary": settings.primary_color,

        "--primary-color": settings.primary_color,

        "--dark": settings.secondary_color,

        "--secondary-color": settings.secondary_color,

        "--accent-color": settings.accent_color,

        "--surface": settings.background_color,

        "--site-background": settings.background_color,

        "--text-color": settings.text_color,

        "--site-text": settings.text_color
    };


    Object.entries(colorSettings).forEach(
        ([key, value]) => {

            if (
                typeof value === "string" &&
                window.CSS &&
                CSS.supports("color", value)
            ) {

                document.documentElement.style.setProperty(
                    key,
                    value
                );
            }
        }
    );


    // ======================================
    // THEME MODE
    // ======================================

    if (
        ["light", "dark", "system"].includes(
            settings.theme_mode
        )
    ) {

        document.documentElement.dataset.theme =
            settings.theme_mode;
    }


    // ======================================
    // SEO SETTINGS
    // ======================================

    const seo = settings.seo_settings || {};

    if (seo.meta_title) {

        document.title =
            String(seo.meta_title);
    }

    if (seo.meta_description) {

        let description = document.querySelector(
            'meta[name="description"]'
        );

        if (!description) {

            description = document.createElement("meta");

            description.name = "description";

            document.head.appendChild(description);
        }

        description.content =
            String(seo.meta_description);
    }


    if (seo.robots_index === false) {

        let robots = document.querySelector(
            'meta[name="robots"]'
        );

        if (!robots) {

            robots = document.createElement("meta");

            robots.name = "robots";

            document.head.appendChild(robots);
        }

        robots.content = "noindex, nofollow";
    }


    // ======================================
    // OPEN GRAPH IMAGE
    // ======================================

    if (seo.og_image_url) {

        const imageUrl = safeImageUrl(
            seo.og_image_url
        );

        if (imageUrl) {

            let ogImage = document.querySelector(
                'meta[property="og:image"]'
            );

            if (!ogImage) {

                ogImage = document.createElement("meta");

                ogImage.setAttribute(
                    "property",
                    "og:image"
                );

                document.head.appendChild(ogImage);
            }

            ogImage.content = imageUrl;
        }
    }


    // ======================================
    // ANNOUNCEMENT BAR
    // Settings API uses "text", not "message".
    // ======================================

    const announcement =
        settings.announcement_bar || {};

    let bar = document.getElementById(
        "site-announcement"
    );

    const announcementText = String(
        announcement.text ??
        announcement.message ??
        ""
    ).trim();


    if (
        announcement.enabled === true &&
        announcementText
    ) {

        if (!bar) {

            bar = document.createElement("div");

            bar.id = "site-announcement";

            bar.className =
                "text-center text-sm p-3";

            document.body.prepend(bar);
        }

        bar.replaceChildren();

        bar.hidden = false;

        bar.textContent = announcementText;


        const linkText = String(
            announcement.link_text || ""
        ).trim();

        const linkUrl = safeLinkUrl(
            announcement.link_url
        );

        if (linkText && linkUrl) {

            const link = document.createElement("a");

            link.href = linkUrl;

            link.textContent = ` ${linkText}`;

            link.className =
                "underline font-bold ml-2";

            if (
                linkUrl.startsWith("http://") ||
                linkUrl.startsWith("https://")
            ) {

                link.target = "_blank";

                link.rel = "noopener noreferrer";
            }

            bar.appendChild(link);
        }


        if (
            typeof announcement.background_color === "string" &&
            CSS.supports("color", announcement.background_color)
        ) {

            bar.style.backgroundColor =
                announcement.background_color;
        }

        if (
            typeof announcement.text_color === "string" &&
            CSS.supports("color", announcement.text_color)
        ) {

            bar.style.color =
                announcement.text_color;
        }

    } else if (bar) {

        bar.hidden = true;
    }


    // ======================================
    // HOMEPAGE SECTION VISIBILITY
    // ======================================

    if (Array.isArray(settings.homepage_sections)) {

        settings.homepage_sections.forEach(section => {

            if (
                !section ||
                typeof section.id !== "string"
            ) {
                return;
            }

            const element = document.getElementById(
                section.id
            );

            if (element) {
                element.hidden =
                    section.enabled === false;
            }
        });
    }


    // ======================================
    // SOCIAL LINKS
    // ======================================

    renderPublicSocialLinks(
        settings.social_links
    );


    // ======================================
    // CONTACT METHODS
    // ======================================

    renderPublicContactMethods(
        settings.contact_methods
    );


    // ======================================
    // DYNAMIC NAVIGATION
    // Render only when a dedicated container exists.
    // ======================================

    renderPublicNavigation(
        settings.navigation_items
    );


    // ======================================
    // FEATURES
    // ======================================

    renderPublicFeatures(
        settings.features
    );


    // ======================================
    // TOPICS
    // ======================================

    renderPublicTopics(
        settings.topics
    );


    // ======================================
    // MAINTENANCE MODE
    // ======================================

    if (settings.maintenance_mode === true) {

        console.warn(
            "Maintenance mode is enabled, but the public maintenance-page integration is not yet implemented."
        );
    }
}


// ==========================================
// SOCIAL MEDIA LINKS
// ==========================================

function renderPublicSocialLinks(items) {

    if (!Array.isArray(items)) return;

    let root = document.getElementById(
        "dynamic-social-links"
    );

    if (!root) {

        const footer = document.querySelector("footer");

        if (!footer) return;

        root = document.createElement("div");

        root.id = "dynamic-social-links";

        root.className =
            "flex flex-wrap gap-4 mt-4";

        footer.appendChild(root);
    }

    root.replaceChildren();


    items
        .filter(item =>
            item &&
            item.enabled !== false &&
            item.url
        )
        .forEach(item => {

            const url = safeLinkUrl(item.url);

            if (!url) return;

            const link = document.createElement("a");

            link.href = url;

            link.className =
                "text-sm hover:underline";

            link.textContent =
                item.label ||
                item.platform ||
                "Social media";


            if (
                url.startsWith("https://") ||
                url.startsWith("http://")
            ) {

                link.target = "_blank";

                link.rel = "noopener noreferrer";
            }


            if (item.icon) {

                const icon = document.createElement("i");

                icon.className =
                    `${String(item.icon)} mr-2`;

                link.prepend(icon);
            }

            root.appendChild(link);
        });
}


// ==========================================
// CONTACT METHODS
// ==========================================

function renderPublicContactMethods(items) {

    if (!Array.isArray(items)) return;

    let root = document.getElementById(
        "dynamic-contact-methods"
    );

    if (!root) {

        const footer = document.querySelector("footer");

        if (!footer) return;

        root = document.createElement("div");

        root.id = "dynamic-contact-methods";

        root.className =
            "flex flex-col gap-2 mt-4";

        footer.appendChild(root);
    }

    root.replaceChildren();


    items
        .filter(item =>
            item &&
            item.enabled !== false &&
            item.value
        )
        .forEach(item => {

            const line = document.createElement("p");

            line.className =
                "text-sm text-gray-500";


            const label = document.createElement("strong");

            label.textContent =
                item.label ||
                item.type ||
                "Contact";


            const rawUrl = item.url ||
                (
                    String(item.type).toLowerCase() === "email"
                        ? `mailto:${item.value}`
                        : String(item.type).toLowerCase() === "phone"
                            ? `tel:${item.value}`
                            : ""
                );


            const url = safeLinkUrl(rawUrl);

            const value = document.createElement(
                url ? "a" : "span"
            );

            value.textContent =
                `: ${item.value}`;

            if (url) {

                value.href = url;

                if (
                    url.startsWith("https://") ||
                    url.startsWith("http://")
                ) {

                    value.target = "_blank";

                    value.rel = "noopener noreferrer";
                }
            }

            line.append(label, value);

            root.appendChild(line);
        });
}


// ==========================================
// DYNAMIC NAVIGATION
// Requires #dynamic-navigation in homepage HTML.
// ==========================================

function renderPublicNavigation(items) {

    if (!Array.isArray(items)) return;

    const root = document.getElementById(
        "dynamic-navigation"
    );

    if (!root) return;

    root.replaceChildren();


    items
        .filter(item =>
            item &&
            item.enabled !== false &&
            item.label &&
            item.url
        )
        .forEach(item => {

            const url = safeLinkUrl(item.url);

            if (!url) return;

            const link = document.createElement("a");

            link.href = url;

            link.textContent = item.label;

            link.className =
                "text-sm font-semibold hover:underline";

            root.appendChild(link);
        });
}


// ==========================================
// DYNAMIC FEATURE CARDS
// Requires #features-grid in homepage HTML.
// ==========================================

function renderPublicFeatures(items) {

    if (!Array.isArray(items)) return;

    const root = document.getElementById(
        "features-grid"
    );

    if (!root) return;

    root.replaceChildren();


    items
        .filter(item =>
            item &&
            item.enabled !== false
        )
        .forEach(item => {

            const card = document.createElement("article");

            card.className =
                "bg-white p-5 rounded-xl border shadow-sm";


            const title = document.createElement("h3");

            title.className = "font-bold";

            title.textContent =
                item.title || "Feature";


            const description = document.createElement("p");

            description.className =
                "text-sm text-gray-600 mt-2";

            description.textContent =
                item.description || "";


            const icon = document.createElement("i");

            icon.className =
                `${item.icon || "fa-solid fa-star"} text-[#d9381e] text-xl mb-3`;


            card.append(
                icon,
                title,
                description
            );

            root.appendChild(card);
        });
}


// ==========================================
// DYNAMIC TOPICS
// Requires #topics-list in homepage HTML.
// ==========================================

function renderPublicTopics(items) {

    if (!Array.isArray(items)) return;

    const root = document.getElementById(
        "topics-list"
    );

    if (!root) return;

    root.replaceChildren();


    items
        .filter(item =>
            item &&
            item.enabled !== false &&
            item.name &&
            item.url
        )
        .forEach(item => {

            const url = safeLinkUrl(item.url);

            if (!url) return;

            const link = document.createElement("a");

            link.href = url;

            link.textContent = item.name;

            link.className =
                "inline-flex items-center rounded-full border px-3 py-2 text-xs font-semibold";

            root.appendChild(link);
        });
}
