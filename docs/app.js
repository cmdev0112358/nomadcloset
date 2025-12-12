import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

// --- Configuration ---
let CURRENT_USER_ID = null;
let CURRENT_SESSION_ID = "";
let ACTIVE_PLACE_ID = "all";
let allPlacesCache = [];
let allCategoriesCache = [];
let selectedItems = [];
let currentSearchQuery = "";
let allPackingListsCache = [];
let currentMode = "inventory";

// --- Supabase Client ---
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- UI Elements (for header) ---
const userEmailDisplay = document.getElementById("user-email-display");

// --- NEW: Auth Functions (Page Protection) ---

/**
 * Checks for an existing user session.
 * If NOT found, redirects to login.html.
 * If found, initializes the app.
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
    // NO user logged in
    // Redirect to the login page
    window.location.href = "login.html";
  } else {
    // User is logged in
    // Start the app!
    initializeApp(session.user);
  }
}

/**
 * Toggles the UI between 'inventory' and 'shopping' modes.
 */

function setAppMode(mode) {
  currentMode = mode;

  // Get all the UI panels
  const inventorySidebar = document.getElementById("inventory-sidebar-content");
  const shoppingSidebar = document.getElementById("shopping-sidebar-content");
  const inventoryContent = document.getElementById("inventory-content");
  const shoppingContent = document.getElementById("shopping-content");

  const inventoryBtn = document.getElementById("mode-btn-inventory");
  const shoppingBtn = document.getElementById("mode-btn-shopping");

  if (mode === "shopping") {
    // ---- Show Shopping UI ----
    inventorySidebar.classList.add("hidden");
    inventoryContent.classList.add("hidden");
    shoppingSidebar.classList.remove("hidden");
    shoppingContent.classList.remove("hidden");

    inventoryBtn.classList.remove("active");
    shoppingBtn.classList.add("active");

    // --- Populate the place dropdown ---
    const placeSelect = document.getElementById("shopping-place-select");
    placeSelect.innerHTML = ""; // Clear old
    // We re-use the cache from our inventory!
    allPlacesCache.forEach((place) => {
      placeSelect.innerHTML += `<option value="${place.id}">${place.name}</option>`;
    });

    // --- Run the code to build the shopping page ---
    renderShoppingList();
  } else {
    // ---- Show Inventory UI (Default) ----
    inventorySidebar.classList.remove("hidden");
    inventoryContent.classList.remove("hidden");
    shoppingSidebar.classList.add("hidden");
    shoppingContent.classList.add("hidden");

    inventoryBtn.classList.add("active");
    shoppingBtn.classList.remove("active");
  }
}

/**
 * Handles the user Log Out button.
 */
async function handleLogout() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) console.error("Error logging out:", error);

  // After logging out, redirect to the login page
  window.location.href = "login.html";
}

/**
 * Initializes the main application UI for a logged-in user.
 */
async function initializeApp(user) {
  document.body.style.visibility = "visible";
  console.log("User logged in:", user.email);
  CURRENT_USER_ID = user.id;
  CURRENT_SESSION_ID = `sess_${Date.now()}`;

  // Show user email
  userEmailDisplay.innerText = user.email;

  // Fetch all categories into the cache
  await getCategories();

  // Ensure default packing list exist
  await getPackingLists();

  // Setup main app UI
  setupModals();

  // --- Main App Listeners ---
  document.getElementById("logout-btn").addEventListener("click", handleLogout);

  // Listeners for Mobile Burger Menu
  const mobileMenu = document.getElementById("mobile-menu");

  // Open Button
  document.getElementById("burger-menu-btn").addEventListener("click", () => {
    mobileMenu.classList.remove("mobile-menu-hidden");
  });

  // Close Button
  document
    .getElementById("mobile-menu-close-btn")
    .addEventListener("click", () => {
      mobileMenu.classList.add("mobile-menu-hidden");
    });

  document
    .getElementById("mobile-export-csv-btn")
    .addEventListener("click", (e) => {
      e.preventDefault();
      mobileMenu.classList.add("mobile-menu-hidden");
      exportActionsToCSV();
    });
  document
    .getElementById("mobile-logout-btn")
    .addEventListener("click", (e) => {
      e.preventDefault();
      handleLogout();
    });

  // Listener for the User Menu
  document.getElementById("user-menu-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("user-menu");
    const isAlreadyOpen = menu.classList.contains("show");
    closeAllActionMenus(); // close item menus
    if (!isAlreadyOpen) {
      menu.classList.add("show");
    }
  });

  document.getElementById("export-csv-btn").addEventListener("click", (e) => {
    e.preventDefault();
    exportActionsToCSV();
  });

  // --- Filter/Search Listeners ---
  const searchInput = document.getElementById("search-input");
  const clearSearchBtn = document.getElementById("clear-search-btn");
  
  searchInput.addEventListener("input", (e) => {
    currentSearchQuery = e.target.value;
    if (currentSearchQuery.length > 0)
      clearSearchBtn.classList.remove("hidden");
    else clearSearchBtn.classList.add("hidden");
    renderItems();
  });
  
  clearSearchBtn.addEventListener("click", (e) => {
    currentSearchQuery = "";
    searchInput.value = "";
    clearSearchBtn.classList.add("hidden");
    renderItems();
  });

  // --- Bulk Action Listeners ---
  document
    .getElementById("select-all-checkbox")
    .addEventListener("click", handleSelectAll);
  document.getElementById("bulk-action-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("bulk-action-menu");
    const isAlreadyOpen = menu.classList.contains("show");
    closeAllActionMenus();
    if (!isAlreadyOpen) menu.classList.add("show");
  });
  document.getElementById("bulk-menu-move").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleBulkMove();
    closeAllActionMenus();
  });
  document.getElementById("bulk-menu-delete").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleBulkDelete();
    closeAllActionMenus();
  });

  // --- Global Click Listener (for menus/modals) ---
  window.addEventListener("click", function (event) {
    if (!event.target.matches(".action-btn")) {
      closeAllActionMenus();
    }
    if (event.target.classList.contains("modal")) {
      event.target.style.display = "none";
    }
  });

  // Listeners for Mode Switcher
  document
    .getElementById("mode-btn-inventory")
    .addEventListener("click", () => setAppMode("inventory"));
  document
    .getElementById("mode-btn-shopping")
    .addEventListener("click", () => setAppMode("shopping"));

  // Listen to the "Shopping for" dropdown
  document
    .getElementById("shopping-place-select")
    .addEventListener("change", renderShoppingList);

  // --- RENDER THE APP ---
  await renderPlaces();
  await renderItems();
}

// --- Database & App Functions ---

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

async function initDefaultPlaces() {
  // 1. Check for places
  const { data: placesData, error: placesError } = await supabaseClient
    .from("places")
    .select("id")
    .eq("user_id", CURRENT_USER_ID)
    .limit(1);

  if (placesError) console.error("Error checking for places:", placesError);

  if (placesData && placesData.length === 0) {
    console.log("No places found, creating defaults...");
    const defaultPlaces = [
      { name: "Casa Uni", user_id: CURRENT_USER_ID },
      { name: "Casa Genitori", user_id: CURRENT_USER_ID },
      { name: "Valigia", user_id: CURRENT_USER_ID },
    ];
    await supabaseClient.from("places").insert(defaultPlaces);
    logAction("create_place", { metadata: { created_defaults: true } });
  }

  // 2. Check for categories
  const { data: categoriesData, error: categoriesError } = await supabaseClient
    .from("categories")
    .select("id")
    .eq("user_id", CURRENT_USER_ID)
    .limit(1);

  if (categoriesError)
    console.error("Error checking for categories:", categoriesError);

  if (categoriesData && categoriesData.length === 0) {
    console.log("No categories found, creating defaults...");
    const defaultCategories = [
      { name: "Uncategorized", user_id: CURRENT_USER_ID },
      { name: "Tech", user_id: CURRENT_USER_ID },
      { name: "Clothing", user_id: CURRENT_USER_ID },
      { name: "Toiletries", user_id: CURRENT_USER_ID },
      { name: "Documents", user_id: CURRENT_USER_ID },
      { name: "Books", user_id: CURRENT_USER_ID },
      { name: "Hobby", user_id: CURRENT_USER_ID },
      { name: "Other", user_id: CURRENT_USER_ID },
    ];
    await supabaseClient.from("categories").insert(defaultCategories);
  }
}

async function getPlaces() {
  const { data, error } = await supabaseClient
    .from("places")
    // Select all columns, including our new 'is_luggage' flag
    .select("*")
    .eq("user_id", CURRENT_USER_ID)
    .order("name"); // Sort by name

  if (error) {
    console.error("Error fetching places:", error);
    return [];
  }
  allPlacesCache = data;
  return data || [];
}

async function getPackingLists() {
  const { data, error } = await supabaseClient
    .from("packing_lists")
    .select("*")
    .eq("user_id", CURRENT_USER_ID)
    .order("name");
  if (error) {
    console.error("Error fetching packing lists:", error);
    return [];
  }
  allPackingListsCache = data;
  return data || [];
}

async function getItems() {
    const { data, error } = await supabaseClient
        .from('items')
        .select('*, places(name), categories(name)')
        .eq('user_id', CURRENT_USER_ID);

    if (error) {
        console.error('Error fetching items:', error);
        return [];
    }
    return data || [];
}

function getPlaceName(placeId, allPlaces) {
  if (!placeId) return "N/A";
  const place = allPlaces.find((p) => p.id === placeId);
  return place ? place.name : "Unknown";
}

async function logAction(action_type, data = {}) {
  const newAction = {
    user_id: CURRENT_USER_ID,
    session_id: CURRENT_SESSION_ID,
    action_type: action_type,
    item_id: data.item_id || null,
    item_name: data.item_name || null,
    from_place_id: data.from_place_id || null,
    to_place_id: data.to_place_id || null,
    metadata: data.metadata || null,
    created_at: new Date().toISOString(),
  };

  if (action_type === "create_item") {
    newAction.to_place_id = data.place_id;
  }
  if (action_type === "create_place") {
    newAction.item_name = data.place_name;
  }

  const { error } = await supabaseClient.from("actions").insert(newAction);
  if (error) console.error("Error logging action:", error);
  else console.log("Action Logged:", newAction);
}

// --- renderPlaces FUNCTION ---
async function renderPlaces() {
  // 1. RENDER PLACES (No change here)
  const places = await getPlaces();
  allPlacesCache = places;
  const placesUl = document.getElementById("places-list");
  placesUl.innerHTML = "";
  placesUl.innerHTML += `<li data-id="all" data-type="place" class="${
    ACTIVE_PLACE_ID === "all" ? "active" : ""
  }"><span class="place-name">All Items</span></li>`;
  placesUl.innerHTML += `<li data-id="null" data-type="place" class="${
    ACTIVE_PLACE_ID === "null" ? "active" : ""
  }"><span class="place-name">Unassigned</span></li>`;

  places.forEach((place) => {
    const isLuggage = place.is_luggage === true;
    placesUl.innerHTML += `
            <li data-id="${place.id}" data-type="place" class="${
      ACTIVE_PLACE_ID === place.id ? "active" : ""
    }">
                <span class="place-name">${isLuggage ? "🧳 " : ""}${
      place.name
    }</span>
                <div class="action-menu-wrapper">
                    <button class="action-btn" data-place-id="${
                      place.id
                    }">⋮</button>
                    <div class="action-menu" id="menu-place-${place.id}">
                        ${
                          !isLuggage
                            ? `<a href="#" class="menu-set-luggage" data-id="${place.id}">Set as Luggage</a>`
                            : ""
                        }
                        <a href="#" class="menu-rename-place" data-id="${
                          place.id
                        }" data-name="${place.name}">Rename</a>
                        <a href="#" class="menu-delete-place delete" data-id="${
                          place.id
                        }" data-name="${place.name}">Delete</a>
                    </div>
                </div>
            </li>
        `;
  });

  // 2. RENDER PACKING LISTS
  const packingLists = await getPackingLists();
  const listsUl = document.getElementById("packing-lists-list");
  listsUl.innerHTML = ""; // Clear list

  packingLists.forEach((list) => {
    // Use a "list-" prefix to avoid ID conflicts with places
    const listId = `list-${list.id}`;
    listsUl.innerHTML += `
            <li data-id="${listId}" data-type="list" class="${
      ACTIVE_PLACE_ID === listId ? "active" : ""
    }">
                ${list.name}
            </li>
        `;
  });

  // 3. COMBINED LISTENERS
  // Listen for clicks on *both* lists
  document.querySelectorAll(".sidebar li[data-id]").forEach((li) => {
    li.addEventListener("click", (e) => {
      if (e.target.closest(".action-menu-wrapper")) return;

      ACTIVE_PLACE_ID = li.getAttribute("data-id");

      // Clear filters
      currentSearchQuery = "";
      document.getElementById("search-input").value = "";

      renderPlaces(); // Re-renders both lists to show "active" state
      renderItems(); // Render the correct view (inventory or checklist)
    });
  });

  // 4. Place-specific menu listeners (no change)
  placesUl.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleActionMenu(`place-${e.target.getAttribute("data-place-id")}`);
    });
  });
  placesUl.querySelectorAll(".menu-set-luggage").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleSetAsLuggage(e.target.dataset.id);
      closeAllActionMenus();
    });
  });
  placesUl.querySelectorAll(".menu-rename-place").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleRenamePlace(e.target.dataset.id, e.target.dataset.name);
      closeAllActionMenus();
    });
  });
  placesUl.querySelectorAll(".menu-delete-place").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleDeletePlace(e.target.dataset.id, e.target.dataset.name);
      closeAllActionMenus();
    });
  });

  updatePlaceDropdowns(places);
}

// --- renderItems FUNCTION ---

async function renderItems() {
    const ul = document.getElementById('items-list');
    const itemsHeader = document.getElementById('items-header');
    const filterBar = document.getElementById('filter-bar');
    ul.innerHTML = ''; // Clear list

  // Check if we are in "Packing List Mode"
  if (ACTIVE_PLACE_ID.startsWith("list-")) {
    // ---- RENDER CHECKLIST MODE ----

    // 1. Hide the normal headers and filters
    itemsHeader.classList.add("hidden");
    filterBar.classList.add("hidden");

    // 2. Get the template
    const listId = ACTIVE_PLACE_ID.replace("list-", "");
    const template = allPackingListsCache.find((l) => l.id === listId);
    if (!template) {
      ul.innerHTML = "<li>Packing list not found.</li>";
      return;
    }

    // 3. Get *all* current inventory items to cross-reference
    const allItems = await getItems();

    // 4. Get the flagged luggage place
    const luggagePlace = allPlacesCache.find((p) => p.is_luggage === true);
    if (!luggagePlace) {
      ul.innerHTML = "<li>Error: No 🧳 Luggage place set.</li>";
      return;
    }

    ul.innerHTML = `<h3>Packing for: ${template.name}</h3>`;
    let itemsToMove = []; // Array to hold missing items

    // 5. Loop through the TEMPLATE items
    template.items.forEach((templateItem) => {
      // Find a matching item in our inventory
      let foundItem = allItems.find((item) => item.id === templateItem.id);

      let statusHTML = "";
      if (foundItem) {
        // We found it!
        if (foundItem.place_id === luggagePlace.id) {
          // Case 1: Already Packed
          statusHTML = `<li class="item-selected">
                        <input type="checkbox" checked disabled> 
                        <span style="text-decoration: line-through;">${foundItem.name} (x${templateItem.quantity})</span>
                        <span class="item-category">Already in ${luggagePlace.name}</span>
                    </li>`;
        } else {
          // Case 2: Found (Needs Packing)
          const place = allPlacesCache.find((p) => p.id === foundItem.place_id);
          const placeName = place ? place.name : "Unassigned";
          itemsToMove.push(foundItem.id); // Add to our "to-move" list
          statusHTML = `<li>
                        <input type="checkbox" class="checklist-item-checkbox" data-id="${foundItem.id}">
                        <strong>${foundItem.name} (x${templateItem.quantity})</strong>
                        <span class="item-category">Found in: ${placeName}</span>
                    </li>`;
        }
      } else {
        // Case 3: Missing (Item was deleted or renamed)
        // We use the "fallback name" from the template
        statusHTML = `<li style="opacity: 0.5;">
                    <input type="checkbox" disabled>
                    <strong>${templateItem.name} (x${templateItem.quantity})</strong>
                    <span class="item-category" style="color: red;">⚠️ Not found in inventory</span>
                </li>`;
      }
      ul.innerHTML += statusHTML;
    });

    // 6. Add the "Bulk Move" button
    if (itemsToMove.length > 0) {
      ul.innerHTML += `<hr><button id="pack-missing-btn">Move ${itemsToMove.length} items to ${luggagePlace.name}</button>`;

      // Add listener for the new button
      document
        .getElementById("pack-missing-btn")
        .addEventListener("click", async () => {
          // Get all checked items
          const checkedItemIds = [];
          ul.querySelectorAll(".checklist-item-checkbox:checked").forEach(
            (cb) => {
              checkedItemIds.push(cb.dataset.id);
            }
          );

          if (checkedItemIds.length === 0) {
            alert("Please check the items you want to pack.");
            return;
          }

          // Use our existing bulk-move logic!
          selectedItems = checkedItemIds; // Set the global array
          // Manually call the save function
          await handleSaveBulkMove(luggagePlace.id);

          // Refresh the checklist
          renderItems();
        });
    }
  } else {
    // ---- RENDER NORMAL INVENTORY MODE ----
        
        itemsHeader.classList.remove('hidden');
        filterBar.classList.remove('hidden');

        // 1. Get items (They come sorted by Category from getItems because of our global var)
        const items = await getItems();
        
        // 2. Filter by Place
        let placeFilteredItems;
        if (ACTIVE_PLACE_ID === 'all') placeFilteredItems = items;
        else if (ACTIVE_PLACE_ID === 'null') placeFilteredItems = items.filter((item) => item.place_id === null);
        else placeFilteredItems = items.filter((item) => item.place_id === ACTIVE_PLACE_ID);

        // 3. Filter by Search
        let filteredItems = currentSearchQuery === "" 
            ? placeFilteredItems 
            : placeFilteredItems.filter((item) => item.name.toLowerCase().includes(currentSearchQuery.toLowerCase()));

        // This ensures all items of the same category are grouped together, preventing the "Duplicate Header" bug.
        filteredItems.sort((a, b) => {
            const catA = a.categories ? a.categories.name : 'Uncategorized';
            const catB = b.categories ? b.categories.name : 'Uncategorized';
            
            // Primary Sort: Category Name (A-Z)
            if (catA !== catB) {
                return catA.localeCompare(catB);
            }
            
            // Secondary Sort: Item Name (A-Z)
            return a.name.localeCompare(b.name);
        });    


        // 4. Update header
        updateBulkActionUI(filteredItems.length);

        if (filteredItems.length === 0) {
            ul.innerHTML = '<li>No items found in this place.</li>';
            return;
        }

        // --- GROUPING LOGIC ---
        // Since we removed the dropdown, we ALWAYS group.
        let lastCategoryName = null;

        filteredItems.forEach((item) => {
            const placeName = item.places ? item.places.name : getPlaceName(item.place_id, allPlacesCache);
            const isSelected = selectedItems.includes(item.id);
            const categoryName = item.categories ? item.categories.name : 'Uncategorized';

            // Insert Header if Category Changes
            if (categoryName !== lastCategoryName) {
                ul.innerHTML += `<li class="group-header">${categoryName}</li>`;
                lastCategoryName = categoryName;
            }

            ul.innerHTML += `
                <li data-id="${item.id}" class="${isSelected ? 'item-selected' : ''}">
                    <div class="item-info">
                        <input type="checkbox" class="item-checkbox" data-id="${item.id}" ${isSelected ? 'checked' : ''}>
                        <div> 
                            <strong>${item.name} ${item.quantity > 1 ? `(x${item.quantity})` : ''}</strong> (${placeName})
                        </div>
                    </div>
                    <div class="action-menu-wrapper">
                        <button class="action-btn" data-item-id="${item.id}">⋮</button>
                        <div class="action-menu" id="menu-${item.id}">
                            <a href="#" class="menu-modify" data-id="${item.id}" data-name="${item.name}" data-quantity="${item.quantity}" data-category-id="${item.category_id}">Modify</a>
                            <a href="#" class="menu-move" data-id="${item.id}" data-name="${item.name}" data-from-id="${item.place_id}">Move</a>
                            <a href="#" class="menu-delete delete" data-id="${item.id}" data-name="${item.name}">Delete</a>
                        </div>
                    </div>
                </li>
            `;
        });

    // 5. listeners
    ul.querySelectorAll(".action-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const itemId = e.target.getAttribute("data-item-id");
        toggleActionMenu(itemId);
      });
    });
    ul.querySelectorAll(".menu-modify").forEach((link) => {
      link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModifyModal( 
      e.target.dataset.id,
      e.target.dataset.name,
      e.target.dataset.quantity,
      e.target.dataset.categoryId
      );
      closeAllActionMenus();
      });
    });
    ul.querySelectorAll(".menu-move").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openMoveModal(
          e.target.dataset.id,
          e.target.dataset.name,
          e.target.dataset.fromId
        );
        closeAllActionMenus();
      });
    });
    ul.querySelectorAll(".menu-delete").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const { id, name } = e.target.dataset;
        if (confirm(`Are you sure you want to delete "${name}"?`)) {
          handleDeleteItem(id, name);
        }
        closeAllActionMenus();
      });
    });
    ul.querySelectorAll(".item-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("click", (e) => {
        e.stopPropagation();
        const itemId = e.target.getAttribute("data-id");
        handleItemSelection(itemId, filteredItems.length);
      });
    });
    ul.querySelectorAll('li:not(.group-header)').forEach(li => { // Exclude headers from clicks
            li.addEventListener('click', (e) => {
                if (e.target.matches('button') || e.target.matches('a') || e.target.matches('.item-checkbox') || e.target.closest('.action-menu-wrapper')) return;
                handleItemSelection(li.getAttribute('data-id'), filteredItems.length);
            });
        });
  }
}

//
// =========================
// SHOPPING LIST FUNCTIONS
// =========================
//

/**
 * Main render function for the Shopping List mode.
 * Fetches and displays boards for the selected place.
 */
async function renderShoppingList() {
  const placeId = document.getElementById("shopping-place-select").value;
  const shoppingContent = document.getElementById("shopping-content");
  shoppingContent.innerHTML = ""; // Clear old content

  if (!placeId) {
    shoppingContent.innerHTML =
      '<p>Please create a "Place" in your inventory first.</p>';
    return;
  }

  // 1. Fetch the boards (e.g., "Food", "Freezer") for this place
  const { data: lists, error } = await supabaseClient
    .from("shopping_lists")
    .select(
      `
            *,
            shopping_items ( id, name, is_taken )
        `
    ) // Fetch boards AND their nested items!
    .eq("user_id", CURRENT_USER_ID)
    .eq("place_id", placeId)
    .order("name");

  if (error) {
    console.error("Error fetching shopping lists:", error);
    shoppingContent.innerHTML = "<p>Error loading shopping lists.</p>";
    return;
  }

  lists.sort((a, b) => a.name.localeCompare(b.name));

  // 2. Render the "Boards" UI (Google Keep style)
  lists.forEach((list) => {
    const board = document.createElement("div");
    board.className = "shopping-board";
    board.dataset.listId = list.id;

    // Create the item list HTML
    let itemsHTML = "";
    // Sort: First by "Taken" (bottom), Then by Name (A-Z)
    list.shopping_items.sort((a, b) => {
        if (a.is_taken === b.is_taken) {
            // If status is the same, sort alphabetically
            return a.name.localeCompare(b.name);
        }
        // Otherwise, put taken items at the bottom
        return a.is_taken - b.is_taken;
    });

    list.shopping_items.forEach((item) => {
      itemsHTML += `
                <li class="${item.is_taken ? "taken" : ""}">
                    <input type="checkbox" class="shopping-item-checkbox" data-item-id="${
                      item.id
                    }" ${item.is_taken ? "checked" : ""}>
                    <span>${item.name}</span>
                    <button class="delete-item-btn" data-item-id="${
                      item.id
                    }">&times;</button>
                </li>
            `;
    });

    // Create the full board HTML
    board.innerHTML = `
            <div class="shopping-board-header">
                <h3>${list.name}</h3>
                <div class="action-menu-wrapper">
                    <button class="action-btn" data-list-id="${list.id}">⋮</button>
                    <div class="action-menu" id="menu-shop-list-${list.id}">
                        <a href="#" class="menu-rename-list" data-id="${list.id}" data-name="${list.name}">Rename</a>
                        <a href="#" class="menu-delete-list delete" data-id="${list.id}" data-name="${list.name}">Delete</a>
                    </div>
                </div>
            </div>
            <ul class="shopping-item-list">${itemsHTML}</ul>
            <form class="add-item-form">
                <input type="text" placeholder="Add item...">
                <button type="submit">+</button>
            </form>
        `;
    shoppingContent.appendChild(board);
  });

  // 3. Add the "Add New Board" button (This fixes the bug!)
  const addBoardBtn = document.createElement("button");
  addBoardBtn.id = "add-shopping-board-btn";
  addBoardBtn.className = "add-btn"; // Use .add-btn for the SVG styles
  addBoardBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24px" height="24px">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </svg>
    `;
  addBoardBtn.title = "Add New Board";
  addBoardBtn.onclick = handleAddShoppingBoard; // This now works!
  shoppingContent.appendChild(addBoardBtn);

  // 4. Add listeners for all the new board content
  addShoppingListeners();
}

async function handleAddShoppingBoard() {
  const boardName = prompt(
    'Enter a name for your new board (e.g., "Food", "Freezer"):'
  );
  if (!boardName || boardName.trim() === "") return;

  const placeId = document.getElementById("shopping-place-select").value;

  const { error } = await supabaseClient.from("shopping_lists").insert({
    name: boardName.trim(),
    user_id: CURRENT_USER_ID,
    place_id: placeId,
  });

  if (error) {
    if (error.code === "23505")
      alert("A board with this name already exists for this place.");
    else alert("Error adding board: " + error.message);
    return;
  }

  // Success! Re-render the shopping list view
  await renderShoppingList();
}

/**
 * Adds all event listeners for the rendered shopping boards.
 */
function addShoppingListeners() {
  const shoppingContent = document.getElementById("shopping-content");

  // 1. Board "..." menu toggles
  shoppingContent.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleActionMenu(`shop-list-${e.target.dataset.listId}`);
    });
  });
  // 2. Rename board
  shoppingContent.querySelectorAll(".menu-rename-list").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleRenameShoppingBoard(e.target.dataset.id, e.target.dataset.name);
      closeAllActionMenus();
    });
  });
  // 3. Delete board
  shoppingContent.querySelectorAll(".menu-delete-list").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleDeleteShoppingBoard(e.target.dataset.id, e.target.dataset.name);
      closeAllActionMenus();
    });
  });
  // 4. Add item form
  shoppingContent.querySelectorAll(".add-item-form").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const listId = form.closest(".shopping-board").dataset.listId;
      const input = form.querySelector("input");
      handleAddShoppingItem(listId, input);
    });
  });
  // 5. Checkbox toggle
    shoppingContent.querySelectorAll('.shopping-item-checkbox').forEach(cb => {
        cb.addEventListener('click', e => {
            // Pass 'e.target' (the checkbox itself) to the function
            handleToggleShoppingItem(e.target.dataset.itemId, e.target.checked, e.target);
        });
  });
  // 6. Delete item "X" button
  shoppingContent.querySelectorAll(".delete-item-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      handleDeleteShoppingItem(e.target.dataset.itemId);
    });
  });
}

/**
 * Renames a shopping list (board).
 */
async function handleRenameShoppingBoard(listId, oldName) {
  const newName = prompt(`Rename board "${oldName}" to:`, oldName);
  if (!newName || newName.trim() === "" || newName === oldName) return;

  const { error } = await supabaseClient
    .from("shopping_lists")
    .update({ name: newName.trim() })
    .eq("id", listId);

  if (error) alert("Error renaming board: " + error.message);
  else await renderShoppingList();
}

/**
 * Deletes a shopping list (board) and all its items.
 */
async function handleDeleteShoppingBoard(listId, name) {
  if (
    !confirm(
      `Are you sure you want to delete the "${name}" board?\nAll items on this list will be permanently deleted.`
    )
  )
    return;

  // Supabase is set to ON DELETE CASCADE, so this will
  // automatically delete all 'shopping_items' on this list.
  const { error } = await supabaseClient
    .from("shopping_lists")
    .delete()
    .eq("id", listId);

  if (error) alert("Error deleting board: " + error.message);
  else await renderShoppingList();
}

/**
 * Adds a new item (e.g., "Socks") to a board.
 */
async function handleAddShoppingItem(listId, inputElement) {
  const name = inputElement.value.trim();
  if (!name) return;

  const { error } = await supabaseClient.from("shopping_items").insert({
    name: name,
    list_id: listId,
    user_id: CURRENT_USER_ID,
  });

  if (error) alert("Error adding item: " + error.message);
  else {
    inputElement.value = ""; // Clear input
    await renderShoppingList(); // Full re-render
  }
}

/**
 * Toggles the "is_taken" checkbox instantly (Optimistic UI).
 * It updates the style immediately and saves to DB in the background.
 * It does NOT re-sort or re-render, keeping the list stable for fast clicking.
 */
async function handleToggleShoppingItem(itemId, isTaken, checkboxElement) {
    // 1. Visual Update (Instant)
    // Find the <li> parent of this checkbox
    const li = checkboxElement.closest('li');
    if (isTaken) {
        li.classList.add('taken');
    } else {
        li.classList.remove('taken');
    }

    // 2. Database Update (Background)
    // We do NOT await this, so the user can keep clicking other things
    const { error } = await supabaseClient
        .from('shopping_items')
        .update({ is_taken: isTaken })
        .eq('id', itemId);
    
    if (error) {
        // If save fails, alert the user and revert the check
        alert('Error saving item: ' + error.message);
        checkboxElement.checked = !isTaken; // Undo check
        if (!isTaken) li.classList.add('taken'); else li.classList.remove('taken'); // Undo style
    }
    
    // We do NOT call renderShoppingList() here. 
    // The items will re-sort only when you refresh or re-open the page.
}

/**
 * Deletes a single shopping item from a board.
 */
async function handleDeleteShoppingItem(itemId) {
  if (!confirm("Delete this item?")) return;

  const { error } = await supabaseClient
    .from("shopping_items")
    .delete()
    .eq("id", itemId);

  if (error) alert("Error deleting item: " + error.message);
  else await renderShoppingList();
}

function updatePlaceDropdowns(places) {
  if (!places) places = allPlacesCache;
  const selects = [
    document.getElementById("new-item-place"),
    document.getElementById("move-item-place"),
  ];

  selects.forEach((select) => {
    select.innerHTML = "";
    places.forEach((place) => {
      select.innerHTML += `<option value="${place.id}">${place.name}</option>`;
    });
  });
}

function populateCategoryDropdown() {
  const select = document.getElementById("new-item-category");
  select.innerHTML = "";

  allCategoriesCache.forEach((category) => {
    select.innerHTML += `<option value="${category.id}">${category.name}</option>`;
  });
}

// --- Modal Handling ---
function setupModals() {
  // Add/Item/Place modals
  const addPlaceModal = document.getElementById("add-place-modal");
  document.getElementById("add-place-btn").onclick = () => {
    addPlaceModal.style.display = "block";
    document.getElementById("new-place-name").focus();
  };
  document.getElementById("save-place-btn").onclick = handleAddPlace;

  const addItemModal = document.getElementById("add-item-modal");
  document.getElementById("add-item-btn").onclick = () => {
    populateCategoryDropdown();

    // THIS IS THE NEW LOGIC
    const placeDropdown = document.getElementById("new-item-place");

    if (ACTIVE_PLACE_ID === "all" || ACTIVE_PLACE_ID === "null") {
      // If we're in "All Items" or "Unassigned", just select the first real place
      placeDropdown.selectedIndex = 0;
    } else {
      // If we are in a specific place, find it and select it!
      placeDropdown.value = ACTIVE_PLACE_ID;
    }

    addItemModal.style.display = "block";
    document.getElementById("new-item-name").focus();
  };

  document.getElementById("save-item-btn").onclick = async () => {
    const name = document.getElementById("new-item-name").value;
    const quantity =
      parseInt(document.getElementById("new-item-quantity").value) || 1;
    const category_id = document.getElementById("new-item-category").value;
    const place_id = document.getElementById("new-item-place").value;
    if (!name || !place_id) return alert("Name and place are required.");

    const newItem = {
      name: name,
      quantity: quantity,
      category_id: category_id,
      place_id: place_id,
      user_id: CURRENT_USER_ID,
    };
    const { data, error } = await supabaseClient
      .from("items")
      .insert(newItem)
      .select();

    if (error) {
      alert("Error creating item: " + error.message);
      return;
    }

    logAction("create_item", {
      item_id: data[0].id,
      item_name: data[0].name,
      place_id: data[0].place_id,
    });

    document.getElementById("new-item-name").value = "";
    addItemModal.style.display = "none";
    renderItems();
  };

  // Rename/Move modals
  document.getElementById("save-move-btn").onclick = async () => {
    const itemId = document.getElementById("move-item-id").value;
    const toPlaceId = document.getElementById("move-item-place").value;

    const { data: itemData, error: findError } = await supabaseClient
      .from("items")
      .select("name, place_id")
      .eq("id", itemId)
      .single();

    if (findError) return alert("Item not found.");

    const fromPlaceId = itemData.place_id;
    if (fromPlaceId === toPlaceId) {
      document.getElementById("move-item-modal").style.display = "none";
      return;
    }

    const { error } = await supabaseClient
      .from("items")
      .update({ place_id: toPlaceId })
      .eq("id", itemId);

    if (error) {
      alert("Error moving item: " + error.message);
      return;
    }

    logAction("move_item", {
      item_id: itemId,
      item_name: itemData.name,
      from_place_id: fromPlaceId,
      to_place_id: toPlaceId,
    });

    document.getElementById("move-item-modal").style.display = "none";
    renderItems();
  };

  // Use new button ID
  document.getElementById('save-modify-btn').onclick = async () => {
        const itemId = document.getElementById('modify-item-id').value;
        const newName = document.getElementById('modify-item-name-new').value;
        const newQuantity = parseInt(document.getElementById('modify-item-quantity').value) || 1;
        // Get the category ID
        const newCategoryId = document.getElementById('modify-item-category').value;

        if (!newName) { alert('Please enter a new name.'); return; }
        
        // Pass the category to the handler
        await handleModifyItem(itemId, newName, newQuantity, newCategoryId);
        
        document.getElementById('modify-item-modal').style.display = 'none';
    };

  // Bulk Move modal
  document.getElementById("save-bulk-move-btn").onclick = () => {
    const toPlaceId = document.getElementById("bulk-move-place-select").value;
    handleSaveBulkMove(toPlaceId); // Pass the ID as an argument
  };

  // Generic close buttons
  document.querySelectorAll(".modal .close-btn").forEach((btn) => {
    btn.onclick = () => {
      btn.closest(".modal").style.display = "none";
    };
  });

  // Listener for the "Quick Add Category" button
  document
    .getElementById("add-category-quick-btn")
    .addEventListener("click", async () => {
      const newName = prompt("Enter a new category name:");
      if (!newName || newName.trim() === "") return;

      // 1. Add it to the database
      const { data, error } = await supabaseClient
        .from("categories")
        .insert({ name: newName.trim(), user_id: CURRENT_USER_ID })
        .select()
        .single(); // Get the new category back

      if (error) {
        if (error.code === "23505") {
          alert("A category with this name already exists.");
        } else {
          // THIS IS THE CORRECTED LINE:
          alert("Error adding category: " + error.message);
        }
        return;
      }

      // 2. Refresh our category cache
      await getCategories();

      // 3. Re-populate both dropdowns
      populateCategoryDropdown();

      // 4. Auto-select the one we just created!
      document.getElementById("new-item-category").value = data.id;
    });
}

// --- Action Menu Functions ---
function toggleActionMenu(itemId) {
  const menu = document.getElementById(`menu-${itemId}`);
  if (!menu) return;
  const isAlreadyOpen = menu.classList.contains("show");
  closeAllActionMenus();
  if (!isAlreadyOpen) menu.classList.add("show");
}

function closeAllActionMenus() {
  document.querySelectorAll(".action-menu.show").forEach((openMenu) => {
    openMenu.classList.remove("show");
  });
}

// --- Single Item Action Handlers ---
async function handleModifyItem(itemId, newName, newQuantity, newCategoryId) {
    console.log(`Modifying item ${itemId} to: ${newName} (x${newQuantity}), Cat: ${newCategoryId}`);
    
    const { error } = await supabaseClient
        .from('items')
        .update({ 
            name: newName, 
            quantity: newQuantity,
            category_id: newCategoryId //Update category
        }) 
        .eq('id', itemId);

    if (error) {
        console.error('Error modifying item:', error);
        alert('Error modifying item: ' + error.message);
        return;
    }
    logAction('modify_item', {
        item_id: itemId,
        item_name: newName,
        metadata: { "note": `Item updated` } 
    });
    await renderItems();
}

//
// =============================
// PLACE MANAGEMENT FUNCTIONS
// =============================
//
async function handleAddPlace() {
  const nameInput = document.getElementById("new-place-name");
  const name = nameInput.value.trim();
  if (!name) {
    alert("Please enter a place name.");
    return;
  }

  const { error } = await supabaseClient
    .from("places")
    .insert({ name: name, user_id: CURRENT_USER_ID });

  if (error) {
    if (error.code === "23505") alert("A place with this name already exists.");
    else alert("Error adding place: " + error.message);
    return;
  }
  nameInput.value = ""; // Clear the input
  document.getElementById("add-place-modal").style.display = "none"; // Close modal
  await renderPlaces(); // Refresh the list
}

async function handleRenamePlace(placeId, oldName) {
  const newName = prompt(`Rename place "${oldName}" to:`, oldName);
  if (!newName || newName.trim() === "" || newName === oldName) return;

  const { error } = await supabaseClient
    .from("places")
    .update({ name: newName.trim() })
    .eq("id", placeId);

  if (error) {
    alert("Error renaming place: " + error.message);
    return;
  }
  await renderPlaces(); // Refresh the list
}

async function handleDeletePlace(placeId, name) {
  if (
    !confirm(
      `Are you sure you want to delete the place "${name}"?\n\nAll items in this place will become "Unassigned".`
    )
  )
    return;

  const { error } = await supabaseClient
    .from("places")
    .delete()
    .eq("id", placeId);

  if (error) {
    alert("Error deleting place: " + error.message);
    return;
  }

  // If we deleted the place we are looking at, switch to "All Items"
  if (ACTIVE_PLACE_ID === placeId) {
    ACTIVE_PLACE_ID = "all";
  }

  await renderPlaces(); // Refresh the list
  await renderItems(); // Refresh items to show "Unassigned"
}

/**
 * Sets a place as the one and only "Luggage" place.
 * This runs two commands to ensure only one is ever flagged.
 */
async function handleSetAsLuggage(placeId) {
  console.log(`Setting place ${placeId} as new luggage...`);

  // 1. Set ALL places to false (this is the key)
  const { error: clearError } = await supabaseClient
    .from("places")
    .update({ is_luggage: false })
    .eq("user_id", CURRENT_USER_ID);

  if (clearError) {
    alert("Error clearing old luggage flag: " + clearError.message);
    return;
  }

  // 2. Set the NEW place to true
  const { error: setError } = await supabaseClient
    .from("places")
    .update({ is_luggage: true })
    .eq("id", placeId);

  if (setError) {
    alert("Error setting new luggage flag: " + setError.message);
    return;
  }

  // 3. Refresh the UI
  await renderPlaces();
}

async function handleDeleteItem(itemId, itemName) {
  console.log(`Deleting item ${itemId}: ${itemName}`);
  const { error } = await supabaseClient
    .from("items")
    .delete()
    .eq("id", itemId);

  if (error) {
    console.error("Error deleting item:", error);
    alert("Error deleting item: " + error.message);
    return;
  }
  logAction("delete_item", { item_id: itemId, item_name: itemName });
  await renderItems();
}

function openMoveModal(id, name, fromId) {
  const targetSelect = document.getElementById("move-item-place");
  const firstDifferentPlace = allPlacesCache.find((p) => p.id !== fromId);
  if (firstDifferentPlace) targetSelect.value = firstDifferentPlace.id;
  document.getElementById("move-item-name").innerText = name;
  document.getElementById("move-item-id").value = id;
  document.getElementById("move-item-modal").style.display = "block";
}

function openModifyModal(id, currentName, currentQuantity, currentCategoryId) {
    document.getElementById('modify-item-id').value = id;
    document.getElementById('modify-item-name-old').innerText = currentName;
    document.getElementById('modify-item-name-new').value = currentName;
    document.getElementById('modify-item-quantity').value = currentQuantity || 1; 
    
    // Populate the category dropdown
    const select = document.getElementById('modify-item-category');
    select.innerHTML = ''; 
    allCategoriesCache.forEach(category => {
        select.innerHTML += `<option value="${category.id}">${category.name}</option>`;
    });

    // Pre-select the current category
    if (currentCategoryId) {
        select.value = currentCategoryId;
    }

    document.getElementById('modify-item-modal').style.display = 'block';
    document.getElementById('modify-item-name-new').focus();
}

// --- Bulk Action Handlers ---
function handleItemSelection(itemId, totalItemsCount) {
    // Update the Data (Add or Remove form array)
    if (selectedItems.includes(itemId)) {
        selectedItems = selectedItems.filter(id => id !== itemId);
    } else {
        selectedItems.push(itemId);
    }

    // Update the UI Visually (Optimistic)
    // Find the specific row (li) and checkbox to update styles
    const li = document.querySelector(`li[data-id="${itemId}"]`);
    const checkbox = document.querySelector(`.item-checkbox[data-id="${itemId}"]`);
    
    if (li && checkbox) {
        if (selectedItems.includes(itemId)) {
            li.classList.add('item-selected');
            checkbox.checked = true;
        } else {
            li.classList.remove('item-selected');
            checkbox.checked = false;
        }
    }

    // Update the Header (Bulk Action Bar) ONLY
      updateBulkActionUI(totalItemsCount);
}

// --- updateBulkActionUI ---
function updateBulkActionUI(totalVisibleItems) {
    const bulkHeader = document.getElementById('items-header');
    const actionLabel = document.getElementById('bulk-action-label');
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    
    // Get BOTH buttons
    const bulkBtn = document.getElementById('bulk-action-btn');
    const addBtn = document.getElementById('add-item-btn'); 

    // Safety check
    if (!actionLabel || !bulkBtn || !addBtn) return;

    if (selectedItems.length > 0) {
        // --- BULK MODE ACTIVE ---
        bulkHeader.classList.add('bulk-active');
        actionLabel.innerHTML = `<strong>${selectedItems.length}</strong> Selected`;
        
        // SWAP BUTTONS: Show dots, Hide plus
        bulkBtn.style.display = 'block'; 
        addBtn.style.display = 'none';   

        // Checkbox Logic
        if (totalVisibleItems > 0 && selectedItems.length >= totalVisibleItems) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }

    } else {
        // --- NORMAL MODE ---
        bulkHeader.classList.remove('bulk-active');
        actionLabel.innerHTML = 'Items';
        
        // SWAP BUTTONS: Hide dots, Show plus
        bulkBtn.style.display = 'none';
        addBtn.style.display = ''; // Removes inline style so CSS takes over (usually flex)

        // Reset Checkbox
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
}

function handleSelectAll(e) {
    const isChecked = e.target.checked;
    
    if (isChecked) {
        // Select ALL currently visible items
        const allVisibleCheckboxes = document.querySelectorAll('.item-checkbox');
        
        selectedItems = Array.from(allVisibleCheckboxes)
            .map(cb => cb.dataset.id)
            // FILTER OUT GARBAGE (The fix):
            .filter(id => id && id !== 'null' && id !== 'undefined');
            
    } else {
        selectedItems = [];
    }

    // Re-render to update the UI
    renderItems();
}

async function handleBulkMove() {
  if (selectedItems.length === 0) {
    alert("Please select items to move.");
    return;
  }
  const select = document.getElementById("bulk-move-place-select");
  select.innerHTML = "";
  allPlacesCache.forEach((place) => {
    select.innerHTML += `<option value="${place.id}">${place.name}</option>`;
  });
  document.getElementById(
    "bulk-move-count"
  ).innerText = `${selectedItems.length}`;
  document.getElementById("bulk-move-modal").style.display = "block";
}

//--- handleSaveBulkMove ---
async function handleSaveBulkMove(toPlaceId) {
    // 1. Convert string "null" (from Unassigned) to real null
    if (toPlaceId === 'null') toPlaceId = null;

    if (!toPlaceId && toPlaceId !== null) {
        alert("Could not find a place to move to.");
        return;
    }

    // 2. FILTER THE ITEMS (Crucial Fix)
    // This strips out the bad "null" ID that is causing your error
    const validItemIds = selectedItems.filter(id => id && id !== 'null' && id !== 'undefined');

    if (validItemIds.length === 0) {
        alert("No valid items selected.");
        return;
    }

    console.log(`Bulk moving ${validItemIds.length} items to ${toPlaceId}`);

    // 3. Update Database (Use validItemIds!)
    const { error } = await supabaseClient
        .from('items')
        .update({ place_id: toPlaceId }) 
        .in('id', validItemIds); // <--- MUST USE validItemIds

    if (error) {
        console.error('Error bulk moving items:', error);
        alert('Error moving items: ' + error.message);
        return;
    }

    // 4. Log Action
    logAction('bulk_move_items', {
        to_place_id: toPlaceId,
        metadata: { item_count: validItemIds.length, item_ids: validItemIds }
    });
    
    // 5. Cleanup
    document.getElementById('bulk-move-modal').style.display = 'none';
    selectedItems = [];
    renderItems();      
    updateBulkActionUI(0); 
}

async function handleBulkDelete() {
  if (
    !confirm(
      `Are you sure you want to delete ${selectedItems.length} items? This cannot be undone.`
    )
  ) {
    return;
  }
  console.log(`Deleting ${selectedItems.length} items...`);

  const { error } = await supabaseClient
    .from("items")
    .delete()
    .in("id", selectedItems);

  if (error) {
    console.error("Error bulk deleting items:", error);
    alert("Error deleting items: " + error.message);
    return;
  }
  logAction("bulk_delete_items", {
    metadata: { item_count: selectedItems.length, item_ids: selectedItems },
  });

  selectedItems = [];
  renderItems();
  updateBulkActionUI();
}

// --- Export Function ---
async function exportActionsToCSV() {
  // This is unchanged
  const { data: actions, error } = await supabaseClient
    .from("actions")
    .select("*")
    .eq("user_id", CURRENT_USER_ID);
  if (error) return alert("Error fetching actions: " + error.message);
  if (!actions || actions.length === 0) {
    alert("No actions to export.");
    return;
  }
  const headers = Object.keys(actions[0]);
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += headers.join(",") + "\n";
  actions.forEach((row) => {
    const values = headers.map((header) => {
      let val = row[header];
      if (header === "user_id") {
        val = `user_${val.substring(0, 8)}`;
      }
      if (typeof val === "string") {
        val = '"' + val.replace(/"/g, '""') + '"';
      } else if (val === null) {
        val = '""';
      }
      return val;
    });
    csvContent += values.join(",") + "\n";
  });
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "nomadcloset_actions_export.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  logAction("export_csv", { metadata: { rows: actions.length } });
}

// --- App Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  // 1. Check if the user is logged in
  // This is the most important step
  checkUserSession();
});
