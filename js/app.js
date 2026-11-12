'use strict';

let authMode = 'login';

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function openAuthModal(mode = 'login') {
  authMode = mode;
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.getElementById('auth-title').textContent = mode === 'register' ? 'Create an Account' : 'Log In';
  document.getElementById('auth-btn').textContent = mode === 'register' ? 'Sign Up' : 'Log In';
  document.getElementById('name-field').classList.toggle('hidden', mode !== 'register');
  document.getElementById('auth-password').setAttribute('autocomplete', mode === 'register' ? 'new-password' : 'current-password');
  document.getElementById('auth-error').textContent = '';
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function checkUserSession() {
  try {
    const { user } = await apiRequest('/api/auth/me');
    const authArea = document.getElementById('user-auth-area');
    const profileArea = document.getElementById('user-profile-area');
    const username = document.getElementById('logged-username');
    if (authArea) authArea.classList.add('hidden');
    if (profileArea) { profileArea.classList.remove('hidden'); profileArea.classList.add('flex'); }
    if (username) username.textContent = user.name;
    const adminLink = document.getElementById('admin-link');
    if (adminLink && user.role === 'admin') adminLink.classList.remove('hidden');

    const adminContent = document.getElementById('admin-content');
    if (adminContent) {
      if (user.role !== 'admin') {
        document.getElementById('admin-message').textContent = 'Administrator access is required. Please sign in with an admin account.';
        setTimeout(() => { window.location.href = 'index.html'; }, 1800);
        return;
      }
      adminContent.classList.remove('hidden');
      document.getElementById('admin-message').textContent = `Signed in as administrator: ${user.email}`;
      if (typeof loadAdminOrders === 'function') loadAdminOrders();
    }
  } catch {
    const adminContent = document.getElementById('admin-content');
    if (adminContent) {
      document.getElementById('admin-message').textContent = 'Please sign in with an administrator account.';
      setTimeout(() => { window.location.href = 'index.html'; }, 1800);
      return;
    }
    const authArea = document.getElementById('user-auth-area');
    const profileArea = document.getElementById('user-profile-area');
    if (authArea) authArea.classList.remove('hidden');
    if (profileArea) { profileArea.classList.add('hidden'); profileArea.classList.remove('flex'); }
  }
}

async function logoutUser() {
  try { await apiRequest('/api/auth/logout', { method: 'POST', body: '{}' }); }
  catch (error) { console.error(error); }
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', () => {
  checkUserSession();

  const authForm = document.getElementById('auth-form');
  if (authForm) {
    authForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById('auth-error');
      errorBox.textContent = '';
      const payload = {
        name: document.getElementById('auth-name').value.trim(),
        email: document.getElementById('auth-email').value.trim(),
        password: document.getElementById('auth-password').value
      };
      try {
        await apiRequest(authMode === 'register' ? '/api/auth/register' : '/api/auth/login', {
          method: 'POST', body: JSON.stringify(payload)
        });
        closeAuthModal();
        authForm.reset();
        await checkUserSession();
      } catch (error) { errorBox.textContent = error.message; }
    });
  }

  const productForm = document.getElementById('product-form');
  if (productForm) {
    productForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = document.getElementById('product-message');
      message.textContent = '';
      try {
        await apiRequest('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify({
            title: document.getElementById('p-title').value.trim(),
            price: Number(document.getElementById('p-price').value),
            category: document.getElementById('p-cat').value.trim(),
            image: document.getElementById('p-img').value.trim()
          })
        });
        productForm.reset();
        message.textContent = 'Product saved to Neon database.';
      } catch (error) { message.textContent = error.message; }
    });
  }
});
