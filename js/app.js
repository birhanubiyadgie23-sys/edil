
(() => {
  "use strict";

  let authMode = "login";
  let authSubmitting = false;
  let logoutSubmitting = false;

  const $ = (id) => document.getElementById(id);

  function showAuthMessage(message, type = "error") {
    const element = $("auth-message");

    if (!element) {
      alert(message);
      return;
    }

    element.textContent = message;
    element.classList.remove(
      "hidden",
      "text-red-500",
      "text-green-500"
    );

    element.classList.add(
      type === "success" ? "text-green-500" : "text-red-500"
    );
  }

  function clearAuthMessage() {
    const element = $("auth-message");

    if (element) {
      element.textContent = "";
      element.classList.add("hidden");
      element.classList.remove("text-red-500", "text-green-500");
    }
  }

  async function readResponse(response) {
    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("The server returned an invalid response.");
    }

    if (!response.ok || data.success !== true) {
      throw new Error(
        data.message || `Request failed (${response.status}).`
      );
    }

    return data;
  }

  // ==========================================
  // OPEN AUTH MODAL
  // ==========================================

  function openAuthModal(mode = "login") {
    authMode = mode === "register" ? "register" : "login";

    const modal = $("auth-modal");
    const title = $("auth-title");
    const nameField = $("name-field");
    const nameInput = $("auth-name");
    const passwordInput = $("auth-password");
    const button = $("auth-btn");

    clearAuthMessage();
    modal?.classList.remove("hidden");

    if (authMode === "register") {
      if (title) title.textContent = "Create an Account";

      nameField?.classList.remove("hidden");

      if (nameInput) {
        nameInput.required = true;
      }

      if (passwordInput) {
        passwordInput.autocomplete = "new-password";
      }

      if (button) button.textContent = "Sign Up";
    } else {
      if (title) title.textContent = "Log In to Your Account";

      nameField?.classList.add("hidden");

      if (nameInput) {
        nameInput.required = false;
      }

      if (passwordInput) {
        passwordInput.autocomplete = "current-password";
      }

      if (button) button.textContent = "Log In";
    }
  }

  // ==========================================
  // CLOSE AUTH MODAL
  // ==========================================

  function closeAuthModal() {
    $("auth-modal")?.classList.add("hidden");
    clearAuthMessage();

    const form = $("auth-form");

    if (form) {
      form.reset();
    }
  }

  // ==========================================
  // LOGIN / REGISTER
  // ==========================================

  async function handleAuthSubmit(event) {
    event.preventDefault();

    if (authSubmitting) return;

    const email = $("auth-email")?.value.trim() || "";
    const password = $("auth-password")?.value || "";
    const name = $("auth-name")?.value.trim() || "";
    const button = $("auth-btn");

    if (!email || !password) {
      showAuthMessage("Email and password are required.");
      return;
    }

    if (authMode === "register" && !name) {
      showAuthMessage("Please enter your name.");
      return;
    }

    if (authMode === "register" && name.length > 100) {
      showAuthMessage("Name must not exceed 100 characters.");
      return;
    }

    if (email.length > 254) {
      showAuthMessage("Email address is too long.");
      return;
    }

    if (authMode === "register" && password.length < 10) {
      showAuthMessage("Password must contain at least 10 characters.");
      return;
    }

    authSubmitting = true;

    const originalText = button?.textContent || "Submit";

    if (button) {
      button.disabled = true;
      button.textContent = "Please wait...";
    }

    clearAuthMessage();

    try {
      const action =
        authMode === "register" ? "register" : "login";

      const response = await fetch(`/api/auth?action=${action}`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          name,
          email,
          password
        })
      });

      const data = await readResponse(response);

      if (!data.user) {
        throw new Error("User information was not returned by the server.");
      }

      const successMessage =
        action === "register"
          ? "Account created successfully!"
          : "Logged in successfully!";

      closeAuthModal();
      await checkUserSession();

      alert(successMessage);

    } catch (error) {
      console.error("Authentication error:", error);

      showAuthMessage(
        error.message || "Authentication failed."
      );
    } finally {
      authSubmitting = false;

      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }

  // ==========================================
  // CHECK CURRENT USER SESSION
  // ==========================================

  async function checkUserSession() {
    try {
      const response = await fetch("/api/auth?action=me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      const data = await readResponse(response);
      const user = data.user || null;

      const authArea = $("user-auth-area");
      const profileArea = $("user-profile-area");
      const username = $("logged-username");

      if (user) {
        authArea?.classList.add("hidden");
        profileArea?.classList.remove("hidden");

        if (username) {
          username.textContent =
            user.name || user.email || "User";
        }
      } else {
        authArea?.classList.remove("hidden");
        profileArea?.classList.add("hidden");

        if (username) {
          username.textContent = "";
        }
      }

      return user;

    } catch (error) {
      console.error("Session check failed:", error);
      return null;
    }
  }

  // ==========================================
  // LOGOUT
  // ==========================================

  async function logoutUser() {
    if (logoutSubmitting) return;

    logoutSubmitting = true;

    try {
      const response = await fetch("/api/auth?action=logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      await readResponse(response);
      await checkUserSession();

      alert("Logged out successfully!");

    } catch (error) {
      console.error("Logout error:", error);
      alert(error.message || "Logout failed.");
    } finally {
      logoutSubmitting = false;
    }
  }

  // ==========================================
  // EXPOSE FUNCTIONS TO HTML
  // ==========================================

  window.openAuthModal = openAuthModal;
  window.closeAuthModal = closeAuthModal;
  window.handleAuthSubmit = handleAuthSubmit;
  window.checkUserSession = checkUserSession;
  window.logoutUser = logoutUser;

  // ==========================================
  // INITIALIZE
  // ==========================================

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      checkUserSession,
      { once: true }
    );
  } else {
    checkUserSession();
  }
})();
