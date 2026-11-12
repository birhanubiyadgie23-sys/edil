let cart = [];

document.addEventListener("DOMContentLoaded", () => {
    fetchStoreBooks();
});

async function fetchStoreBooks() {
    try {
        const response = await fetch('/api/books');
        const data = await response.json();
        const grid = document.getElementById("product-grid");
        
        if (!grid) return;
        grid.innerHTML = "";

        if (data.success && data.books.length > 0) {
            data.books.forEach(book => {
                grid.innerHTML += `
                    <div class="flex items-center justify-between border-b border-gray-100 pb-3">
                        <div>
                            <h4 class="font-bold text-xs text-gray-900">${book.title}</h4>
                            <p class="text-[11px] text-gray-500">${book.author} — <span class="text-[#d9381e] font-bold">${book.price} ETB</span></p>
                        </div>
                        <button onclick="addToCart('${book.title}', ${book.price})" class="bg-[#d9381e] hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition">
                            Buy
                        </button>
                    </div>
                `;
            });
        } else {
            grid.innerHTML = `<p class="text-xs text-gray-400 text-center py-4">ምንም መጽሐፍ አልተገኘም።</p>`;
        }
    } catch (error) {
        console.error("Error fetching store books:", error);
    }
}

function addToCart(title, price) {
    cart.push({ title, price });
    updateCartUI();
    alert(`"${title}" ወደ ጋሪዎ ገብቷል!`);
}

function updateCartUI() {
    const badge = document.getElementById("cart-badge");
    const badgeMobile = document.getElementById("cart-badge-mobile");
    const container = document.getElementById("cart-items");
    const totalEl = document.getElementById("cart-total");

    if (badge) badge.textContent = cart.length;
    if (badgeMobile) badgeMobile.textContent = cart.length;

    if (container) {
        container.innerHTML = "";
        let total = 0;

        cart.forEach((item, index) => {
            total += Number(item.price);
            container.innerHTML += `
                <div class="flex justify-between items-center border-b pb-2 text-xs">
                    <div>
                        <p class="font-bold text-gray-900">${item.title}</p>
                        <p class="text-gray-500">${item.price} ETB</p>
                    </div>
                    <button onclick="removeFromCart(${index})" class="text-red-500 hover:underline">Remove</button>
                </div>
            `;
        });

        if (totalEl) totalEl.textContent = `${total.toFixed(2)} ETB`;
    }
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartUI();
}

function toggleCart() {
    const drawer = document.getElementById("cart-drawer");
    if (drawer) {
        drawer.classList.toggle("translate-x-full");
    }
}

function openCheckout() {
    if (cart.length === 0) {
        alert("ጋሪዎ ባዶ ነው!");
        return;
    }

    let message = "🛒 *새로운 የመጽሐፍ ትዕዛዝ (New Order)*\n\n";
    let total = 0;

    cart.forEach(item => {
        message += `- ${item.title}: ${item.price} ETB\n`;
        total += Number(item.price);
    });

    message += `\n*ጠቅላላ ዋጋ (Total): ${total.toFixed(2)} ETB*`;

    const telegramUsername = "Ychalal2"; 
    const url = `https://t.me/${telegramUsername}?text=${encodeURIComponent(message)}`;
    
    window.open(url, '_blank');
}
