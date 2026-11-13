
let authMode = "login";

function openAuthModal(mode) {
  authMode = mode;

  document.getElementById("auth-modal")?.classList.remove("hidden");

  const title = document.getElementById("auth-title");
  const name = document.getElementById("name-field");
  const btn = document.getElementById("auth-btn");

  if (mode === "register") {
    title.textContent = "Create an Account";
    name.classList.remove("hidden");
    btn.textContent = "Sign Up";
  } else {
    title.textContent = "Log In to Your Account";
    name.classList.add("hidden");
    btn.textContent = "Log In";
  }
}

function closeAuthModal() {
  document.getElementById("auth-modal")?.classList.add("hidden");
}

async function handleAuthSubmit(e) {
  e.preventDefault();

  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const name = document.getElementById("auth-name").value.trim();

  try {
    const action = authMode === "register" ? "register" : "login";

    const response = await fetch(`/api/auth?action=${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({
        name,
        email,
        password
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Authentication failed.");
    }

    closeAuthModal();
    await checkUserSession();

    alert(
      authMode === "register"
        ? "Account created successfully!"
        : "Logged in successfully!"
    );

  } catch (err) {
    alert(err.message || "Authentication failed.");
  }
}

async function checkUserSession() {
  try {
    const response = await fetch("/api/auth?action=me", {
      method: "GET",
      credentials: "same-origin"
    });

    const data = await response.json();
    const user = data.user;

    const auth = document.getElementById("user-auth-area");
    const profile = document.getElementById("user-profile-area");
    const username = document.getElementById("logged-username");

    if (user) {
      auth?.classList.add("hidden");
      profile?.classList.remove("hidden");

      if (username) {
        username.textContent = user.name;
      }
    } else {
      auth?.classList.remove("hidden");
      profile?.classList.add("hidden");
    }

  } catch (error) {
    console.error("Session check failed:", error);
  }
}

async function logoutUser() {
  try {
    const response = await fetch("/api/auth?action=logout", {
      method: "POST",
      credentials: "same-origin"
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Logout failed.");
    }

    await checkUserSession();
    alert("Logged out successfully.");

  } catch (error) {
    alert(error.message || "Logout failed.");
  }
}

function toggleCart() {
  document
    .getElementById("cart-drawer")
    ?.classList.toggle("translate-x-full");
}

document.addEventListener("DOMContentLoaded", checkUserSession);
