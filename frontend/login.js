import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Handles the user Sign Up form.
 */
async function handleSignUp(e) {
  e.preventDefault();
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;
  const authMessage = document.getElementById("auth-message");
  authMessage.innerText = "Signing up...";

  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: password,
  });

  if (error) {
    authMessage.innerText = "Error signing up: " + error.message;
    return;
  }

  // Check your Supabase settings.
  // If "Confirm email" is ON, show this message.
  if (!data.user) {
    authMessage.innerText =
      "Sign up successful! Please check your email to confirm.";
  } else {
    // If "Confirm email" is OFF, the user is logged in. Redirect them.
    authMessage.innerText = "Sign up successful! Logging you in...";
    window.location.href = "index.html"; // Redirect to the app
  }
}

/**
 * Handles the user Log In form.
 */
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const authMessage = document.getElementById("auth-message");
  authMessage.innerText = "Logging in...";

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    authMessage.innerText = "Error logging in: " + error.message;
    return;
  }

  // Login successful, redirect to the app
  authMessage.innerText = "";
  window.location.href = "index.html";
}

/**
 * Sets up listeners for the auth forms (login, signup, links).
 */
function setupAuthListeners() {
  document.getElementById("login-form").addEventListener("submit", handleLogin);
  document
    .getElementById("signup-form")
    .addEventListener("submit", handleSignUp);

  // Toggle between login and signup forms
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");

  document.getElementById("show-signup").addEventListener("click", (e) => {
    e.preventDefault();
    loginForm.classList.add("hidden");
    signupForm.classList.remove("hidden");
    document.getElementById("auth-message").innerText = "";
  });

  document.getElementById("show-login").addEventListener("click", (e) => {
    e.preventDefault();
    signupForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
    document.getElementById("auth-message").innerText = "";
  });
}

// --- App Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  // 1. Set up listeners for the Login/Signup forms
  setupAuthListeners();

  // 2. Check if user is ALREADY logged in
  supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      // If user is logged in, send them straight to the app
      window.location.href = "index.html";
    } else {
      // ADD THIS LINE to un-hide the login form
      document.body.style.visibility = "visible";
    }
  });
});
