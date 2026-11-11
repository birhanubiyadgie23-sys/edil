const defaultProducts = [
    { id: 1, title: 'DevStack Book Vol. 1 (Hardcover)', price: 49.00, category: 'Books', image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&auto=format&fit=crop' },
    { id: 2, title: 'Full-Stack Architecture Handbook', price: 29.00, category: 'Digital PDF', image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400&auto=format&fit=crop' },
    { id: 3, title: 'Tailwind & React UI Master Kit', price: 39.00, category: 'UI Kit', image: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=400&auto=format&fit=crop' }
];

let products = JSON.parse(localStorage.getItem('devstack_products')) || defaultProducts;
let cart = JSON.parse(localStorage.getItem('devstack_cart')) || [];

function renderProducts() {
    const container = document.getElementById('product-grid');
    if (!container) return;
    
    container.innerHTML = products.map(p => `
        <div class="border border-gray-200 rounded-xl overflow-hidden bg-gray-50 hover:bg-white transition flex flex-col justify-between">
            <div>
                <img src="${p.image}" alt="${p.title}" class="w-full h-32 object-cover">
                <div class="p-3">
                    <span class="text-[10px] font-bold text-[#d9381e] uppercase tracking-wider">${p.category}</span>
                    <h4 class="font-bold text-xs text-gray-900 mt-0.5 mb-1">${p.title}</h4>
                    <p class="text-sm font-extrabold text-gray-900">$${p.price.toFixed(2)}</p>
                </div>
            </div>
            <div class="p-3 pt-0">
                <button onclick="addToCart(${p.id})" class="w-full bg-gray-900 hover:bg-[#d9381e] text-white font-semibold py-2 rounded-lg transition text-xs flex items-center justify-center space-x-1.5">
                    <i class="fa-solid fa-plus text-[10px]"></i>
                    <span>Add to Cart</span>
                </button>
            </div>
        </div>
    `).join('');
}

function addToCart(id) {
    const product = products.find(p => p.id === id);
    const existing = cart.find(item => item.id === id);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({ ...product, qty: 1 });
    }
    updateCart();
    toggleCart();
}

function updateCart() {
    localStorage.setItem('devstack_cart', JSON.stringify(cart));
    const badge = document.getElementById('cart-badge');
    const itemsContainer = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');

    const totalCount = cart.reduce((sum, item) => sum + item.qty, 0);
    if(badge) badge.innerText = totalCount;

    if (!itemsContainer) return;

    if (cart.length === 0) {
        itemsContainer.innerHTML = `<p class="text-center text-gray-400 py-12 text-sm">Your cart is currently empty.</p>`;
        totalEl.innerText = '$0.00';
        return;
    }

    let total = 0;
    itemsContainer.innerHTML = cart.map(item => {
        total += item.price * item.qty;
        return `
            <div class="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-200">
                <div class="flex-1 pr-2">
                    <h5 class="font-bold text-xs text-gray-900">${item.title}</h5>
                    <p class="text-[11px] text-gray-500">$${item.price.toFixed(2)} x ${item.qty}</p>
                </div>
            </div>
        `;
    }).join('');

    totalEl.innerText = `$${total.toFixed(2)}`;
}

renderProducts();
updateCart();
