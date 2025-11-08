import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

// --- Configuration ---
let CURRENT_USER_ID = null;
let allCategoriesCache = [];

// --- Supabase Client ---
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Auth Functions ---

/**
 * Checks for an existing user session.
 * If NOT found, redirects to login.html.
 * If found, initializes the page.
 */
async function checkUserSession() {
  const {
    data: { session },
    error,
  } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Error getting session:", error);
    return;
  }

  if (!session) {
    // NO user logged in, redirect to login
    window.location.href = "login.html";
  } else {
    // User is logged in, start the app
    initializeApp(session.user);
  }
}

/**
 * Handles the user Log Out button.
 */
async function handleLogout() {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
}

/**
 * Initializes the settings page.
 */
async function initializeApp(user) {
  document.body.style.visibility = "visible"; // Un-hide page
  CURRENT_USER_ID = user.id;

  // Setup header
  document.getElementById("user-email-display").innerText = user.email;
  document.getElementById("logout-btn").addEventListener("click", handleLogout);

  // Setup navigation
  setupNavigation();

  // Load initial data
  await getCategories();

  // Populate the default (Categories) page
  await populateCategoryList();

  // Link the "Add" button
  document
    .getElementById("add-category-btn")
    .addEventListener("click", handleAddCategory);

  // Setup User Menu
  document.getElementById("user-menu-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("user-menu");
    menu.classList.toggle("show");
  });
  window.addEventListener("click", (e) => {
    if (!e.target.matches(".action-btn")) {
      document.getElementById("user-menu").classList.remove("show");
    }
  });
}

// --- Navigation ---
function setupNavigation() {
  const navItems = {
    "nav-profile": "profile-page",
    "nav-places": "places-page",
    "nav-categories": "categories-page",
  };

  const settingsNav = document.getElementById("settings-nav");
  const contentPages = document.querySelectorAll(".settings-page");

  settingsNav.addEventListener("click", (e) => {
    if (e.target.tagName !== "LI") return;

    const targetId = e.target.id;
    const pageId = navItems[targetId];

    // 1. Hide all pages
    contentPages.forEach((page) => page.classList.add("hidden"));

    // 2. De-activate all nav items
    settingsNav
      .querySelectorAll("li")
      .forEach((li) => li.classList.remove("active"));

    // 3. Show target page
    document.getElementById(pageId).classList.remove("hidden");

    // 4. Activate target nav item
    e.target.classList.add("active");
  });

  // Show the categories page by default
  document.getElementById("nav-categories").click();
}

//
// ==============================
// CATEGORY MANAGEMENT FUNCTIONS
// ==============================
//

async function getCategories() {
  const { data, error } = await supabaseClient
    .from("categories")
    .select("*")
    .eq("user_id", CURRENT_USER_ID)
    .order("name");
  if (error) {
    console.error("Error fetching categories:", error);
    return [];
  }
  allCategoriesCache = data;
  return data || [];
}

/**
 * Populates the category list in the settings page.
 */
async function populateCategoryList() {
  const list = document.getElementById("category-list");
  list.innerHTML = "<li>Loading...</li>";

  // Re-fetch to be 100% up-to-date
  await getCategories();
  list.innerHTML = "";

  if (allCategoriesCache.length === 0) {
    list.innerHTML = "<li>No categories found.</li>";
  }

  allCategoriesCache.forEach((category) => {
    const li = document.createElement("li");
    li.dataset.id = category.id;
    li.innerHTML = `
            <span>${category.name}</span>
            <div>
                <button class="rename-cat-btn">Rename</button>
                <button class="delete-cat-btn">X</button>
            </div>
        `;
    list.appendChild(li);

    // Add listeners
    li.querySelector(".rename-cat-btn").addEventListener("click", () =>
      handleRenameCategory(category.id, category.name)
    );
    li.querySelector(".delete-cat-btn").addEventListener("click", () =>
      handleDeleteCategory(category.id, category.name)
    );
  });
}

async function handleAddCategory() {
  const nameInput = document.getElementById("new-category-name");
  const name = nameInput.value.trim();
  if (!name) {
    alert("Please enter a category name.");
    return;
  }

  const { data, error } = await supabaseClient
    .from("categories")
    .insert({ name: name, user_id: CURRENT_USER_ID })
    .select();

  if (error) {
    if (error.code === "23505")
      alert("A category with this name already exists.");
    else alert("Error adding category: " + error.message);
    return;
  }
  nameInput.value = "";
  await populateCategoryList(); // Just refresh the list
}

async function handleRenameCategory(categoryId, oldName) {
  const newName = prompt(`Rename category "${oldName}" to:`, oldName);
  if (!newName || newName.trim() === "" || newName === oldName) return;

  const { error } = await supabaseClient
    .from("categories")
    .update({ name: newName.trim() })
    .eq("id", categoryId);

  if (error) {
    alert("Error renaming category: " + error.message);
    return;
  }
  await populateCategoryList(); // Refresh the list
}

async function handleDeleteCategory(categoryId, name) {
  if (
    !confirm(
      `Are you sure you want to delete the category "${name}"?\n\nThis will NOT delete your items, but they will become "Uncategorized".`
    )
  )
    return;

  const { error } = await supabaseClient
    .from("categories")
    .delete()
    .eq("id", categoryId);

  if (error) {
    alert("Error deleting category: " + error.message);
    return;
  }
  await populateCategoryList(); // Refresh the list
}

// --- App Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  checkUserSession();
});
