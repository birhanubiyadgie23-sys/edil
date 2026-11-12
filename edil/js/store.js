'use strict';

// Cart exists only in page memory. Products and completed orders live in Neon.
let cart = [];
let productsCache = [];

async function storeApi(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Store request failed.');
  return data;
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = String(value ?? '');
  return element.innerHTML;
}

function renderProducts(products) {
  const grid = document.getElementById('product-grid');
  const message = document.getElementById('store-message');
  if (!grid) return;
  productsCache = products;
  if (!products.length) {
    grid.innerHTML = '';
    if (message) message.textContent = 'No products are available yet.';
    return;
  }
  if (message) message.textContent = '';
  grid.innerHTML = products.map(product => `
    <article class="product-card space-y-3">
      <img class="product-image" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.title)}" loading="lazy"
           onerror="this.src='https://placehold.co/600x400?text=Product'">
      <div>
        <h3 class="font-bold text-sm">${escapeHtml(product.title)}</h3>
        <p class="text-xs text-gray-500 mt-1">${escapeHtml(product.category)}</p>
        <div class="flex justify-between items-center mt-3">
          <strong class="text-[#d9381e]">$${Number(product.price).toFixed(2)}</strong>
          <button class="bg-gray-900 text-white px-3 py-2 rounded-lg text-xs font-bold" onclick="addToCart(${Number(product.id)})">Add to Cart</button>
        </div>
      </div>
    </article>`).join('');
}

async function loadProducts() {
  const message = document.getElementById('store-message');
  try {
    const { products } = await storeApi('/api/products');
    renderProducts(products);
  } catch (error) {
    if (message) message.textContent = `Could not load products: ${error.message}`;
  }
}

function addToCart(productId) {
  const product = productsCache.find(item => Number(item.id) === Number(productId));
  if (!product) return;
  const existing = cart.find(item => Number(item.product_id) === Number(productId));
  if (existing) existing.quantity += 1;
  else cart.push({ product_id: Number(product.id), title: product.title, price: Number(product.price), image_url: product.image_url, quantity: 1 });
  updateCart();
}

function changeQuantity(productId, amount) {
  const item = cart.find(row => row.product_id === Number(productId));
  if (!item) return;
  item.quantity += Number(amount);
  cart = cart.filter(row => row.quantity > 0);
  updateCart();
}

function removeFromCart(productId) {
  cart = cart.filter(row => row.product_id !== Number(productId));
  updateCart();
}

function updateCart() {
  const container = document.getElementById('cart-items');
  const totalElement = document.getElementById('cart-total');
  const badge = document.getElementById('cart-badge');
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (badge) badge.textContent = count;
  if (totalElement) totalElement.textContent = `$${total.toFixed(2)}`;
  if (!container) return;
  if (!cart.length) {
    container.innerHTML = '<div class="empty-cart"><p class="font-semibold">Your cart is empty.</p><p class="text-xs mt-2">Add a product to get started.</p></div>';
    return;
  }
  container.innerHTML = cart.map(item => `
    <div class="border rounded-xl p-3 flex gap-3">
      <img src="${escapeHtml(item.image_url)}" alt="" class="w-16 h-16 object-cover rounded-lg">
      <div class="flex-1 min-w-0">
        <div class="flex justify-between gap-2"><strong class="text-sm">${escapeHtml(item.title)}</strong>
          <button onclick="removeFromCart(${item.product_id})" aria-label="Remove" class="text-red-600"><i class="fa-solid fa-trash"></i></button></div>
        <p class="text-xs text-[#d9381e]">$${item.price.toFixed(2)} each</p>
        <div class="flex justify-between items-center mt-2">
          <div class="border rounded-lg flex items-center"><button class="px-3 py-1" onclick="changeQuantity(${item.product_id},-1)">−</button><span class="text-xs">${item.quantity}</span><button class="px-3 py-1" onclick="changeQuantity(${item.product_id},1)">+</button></div>
          <strong class="text-sm">$${(item.price * item.quantity).toFixed(2)}</strong>
        </div>
      </div>
    </div>`).join('');
}

function toggleCart() {
  const drawer = document.getElementById('cart-drawer');
  if (drawer) drawer.classList.toggle('translate-x-full');
}

async function openCheckout() {
  const status = document.getElementById('checkout-message');
  if (!cart.length) {
    if (status) status.textContent = 'Your cart is empty.';
    return;
  }
  if (status) status.textContent = 'Submitting order...';
  try {
    const result = await storeApi('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ items: cart.map(item => ({ product_id: item.product_id, quantity: item.quantity })) })
    });
    cart = [];
    updateCart();
    if (status) status.textContent = `Order ${result.order.id} was saved successfully. Total: $${Number(result.order.total).toFixed(2)}.`;
    const drawer = document.getElementById('cart-drawer');
    if (drawer) drawer.classList.add('translate-x-full');
  } catch (error) {
    if (status) status.textContent = error.message;
    if (/sign in|log in|unauthorized/i.test(error.message) && typeof openAuthModal === 'function') openAuthModal('login');
  }
}

async function loadAdminOrders() {
  const container = document.getElementById('admin-orders-list');
  if (!container) return;
  try {
    const { orders } = await storeApi('/api/admin/orders');
    if (!orders.length) {
      container.textContent = 'No orders received yet.';
      return;
    }
    container.innerHTML = orders.map(order => `
      <article class="border rounded-xl p-3">
        <div class="flex justify-between gap-2"><strong>${escapeHtml(order.id)}</strong><strong class="text-[#d9381e]">$${Number(order.total).toFixed(2)}</strong></div>
        <p class="mt-2">Customer: ${escapeHtml(order.customer_name)} (${escapeHtml(order.email)})</p>
        <p class="text-xs text-gray-500 mt-1">${escapeHtml(new Date(order.created_at).toLocaleString())}</p>
        <p class="text-xs mt-1">Status: ${escapeHtml(order.status)}</p>
      </article>`).join('');
  } catch (error) { container.textContent = error.message; }
}

document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
  updateCart();
});
