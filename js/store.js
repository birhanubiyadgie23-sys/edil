// store.js - DevStackReads Bookstore Catalog & Cart Logic

const products = [
    {
        id: 1,
        title: "Full-Stack Architecture",
        category: "Architecture & Backend",
        price: 49.99,
        image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=300&auto=format&fit=crop",
        description: "Comprehensive guide to designing scalable web architectures using modern full-stack patterns."
    },
    {
        id: 2,
        title: "React & Tailwind Master",
        category: "UI Kit & Frontend",
        price: 39.99,
        image: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=300&auto=format&fit=crop",
        description: "Build lightning-fast, beautiful user interfaces using React and Tailwind CSS."
    },
    {
        id: 3,
        title: "Advanced JavaScript Core",
        category: "JavaScript",
        price: 29.99,
        image: "https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?w=300&auto=format&fit=crop",
        description: "Master closures, asynchronous programming, prototypes, and modern ES6+ features."
    },
    {
        id: 4,
        title: "UI/UX Design Systems",
        category: "Design",
        price: 45.00,
        image: "https://images.unsplash.com/photo-1581291518633-83b4ebd1d83e?w=300&auto=format&fit=crop",
        description: "Create robust, accessible, and consistent design systems for enterprise applications."
    }
];

let cart = [];

function renderProducts() {
    const grid = document.getElementById('product-grid');
    if (!grid) return;

    grid.innerHTML = products.map(product => `
        <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4 transition hover:shadow-md">
            <div class="flex items-center space-x-3">
                <img src="${product.image}" alt="${product.title}" class="w-16 h-16 rounded-lg object-cover shadow-xs">
                <div>
                    <span class="text-[10px] font-bold text-[#d9381e] uppercase">${product.category}</span>
                    <h4 class="font-bold text-sm text-gray-900">${product.title}</h4>
                    <span class="text-xs font-semibold text-gray-600">$${product.price.toFixed(2)}</span>
                </div>
            </div>
            <button onclick="addToCart(${product.id})" class="bg-[#d9381e] hover:bg-red-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1.5">
                <i class="fa-solid fa-cart-plus"></i> Add
            </button>
        </div>
    `).join('');
}

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = cart.find(item => item.id === productId);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ ...product, quantity: 1 });
    }

    updateCartUI();
    toggleCart(); // Open cart drawer to show added item
}

function updateCartUI() {
    const cartBadge = document.getElementById('cart-badge');
    const cartBadgeMobile = document.getElementById('cart-badge-mobile');
    const cartItems = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');

    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    if (cartBadge) cartBadge.textContent = totalItems;
    if (cartBadgeMobile) cartBadgeMobile.textContent = totalItems;

    if (cartItems) {
        if (cart.length === 0) {
            cartItems.innerHTML = `<p class="text-xs text-gray-500 text-center py-8">Your cart is empty.</p>`;
        } else {
            cartItems.innerHTML = cart.map(item => `
                <div class="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div>
                        <h5 class="font-bold text-xs text-gray-900">${item.title}</h5>
                        <span class="text-xs text-gray-500">$${item.price.toFixed(2)} x ${item.quantity}</span>
                    </div>
                    <button onclick="removeFromCart(${item.id})" class="text-red-500 hover:text-red-700 text-xs font-bold">Remove</button>
                </div>
            `).join('');
        }
    }

    if (cartTotal) {
        cartTotal.textContent = `$${totalPrice.toFixed(2)}`;
    }
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    updateCartUI();
}

function toggleCart() {
    const drawer = document.getElementById('cart-drawer');
    if (drawer) {
        drawer.classList.toggle('translate-x-full');
    }
}

function openCheckout() {
    if (cart.length === 0) {
        alert('Your cart is empty!');
        return;
    }
    alert('Redirecting to Telegram secure checkout integration...');
}

// Initialize store on load
document.addEventListener('DOMContentLoaded', () => {
    renderProducts();
    updateCartUI();
});
