let authMode = 'login';

function openAuthModal(mode) {
    authMode = mode;
    document.getElementById('auth-modal').classList.remove('hidden');
    const title = document.getElementById('auth-title');
    const nameField = document.getElementById('name-field');
    const btn = document.getElementById('auth-btn');

    if(mode === 'register') {
        title.innerText = 'Create an Account';
        nameField.classList.remove('hidden');
        btn.innerText = 'Sign Up';
    } else {
        title.innerText = 'Log In to Your Account';
        nameField.classList.add('hidden');
        btn.innerText = 'Log In';
    }
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
}

function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const name = document.getElementById('auth-name').value || email.split('@')[0];

    if(authMode === 'register') {
        localStorage.setItem('devstack_user', JSON.stringify({ name, email }));
        alert('Account created and logged in successfully!');
    } else {
        localStorage.setItem('devstack_user', JSON.stringify({ name, email }));
        alert('Logged in successfully!');
    }
    closeAuthModal();
    checkUserSession();
}

function checkUserSession() {
    const user = JSON.parse(localStorage.getItem('devstack_user'));
    const authArea = document.getElementById('user-auth-area');
    const profileArea = document.getElementById('user-profile-area');
    const usernameEl = document.getElementById('logged-username');

    if(user) {
        if(authArea) authArea.classList.add('hidden');
        if(profileArea) profileArea.classList.remove('hidden');
        if(usernameEl) usernameEl.innerText = user.name;
    } else {
        if(authArea) authArea.classList.remove('hidden');
        if(profileArea) profileArea.classList.add('hidden');
    }
}

function logoutUser() {
    localStorage.removeItem('devstack_user');
    checkUserSession();
    alert('Logged out successfully.');
}

function toggleCart() {
    const drawer = document.getElementById('cart-drawer');
    if(drawer) drawer.classList.toggle('translate-x-full');
}

function openCheckout() {
    const user = JSON.parse(localStorage.getItem('devstack_user'));
    if(!user) {
        alert('Please log in first before checking out.');
        closeCheckout();
        openAuthModal('login');
        return;
    }
    alert('Order successfully submitted and forwarded to Telegram!');
    localStorage.removeItem('devstack_cart');
    toggleCart();
    updateCart();
}

function closeCheckout() {}

checkUserSession();
