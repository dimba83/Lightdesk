/**
 * CLIENT GALLERY SCRIPT
 * Handles the main gallery interface, user login, filtering, 
 * batch actions, and the full-screen image editor with scribbling.
 */

// ==========================================================================
// 1. BROWSER PROTECTION & CONFIGURATION
// ==========================================================================

// Disable Right-Click to discourage saving images directly
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});

// Disable common "Save" or "View Source" shortcuts
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'u' || e.key === 'p')) {
        e.preventDefault();
    }
});

// Suppress Fabric.js caching warnings
fabric.Object.prototype.objectCaching = false; 


// ==========================================================================
// 2. GLOBAL VARIABLES & STATE
// ==========================================================================

// Editor State
let currentImageId = null;
let canvas = new fabric.Canvas('c');
let currentImgScale = 1;

// Canvas zoom & pan
canvas.on('mouse:wheel', function(opt) {
    let zoom = canvas.getZoom() * Math.pow(0.999, opt.e.deltaY);
    zoom = Math.min(8, Math.max(0.3, zoom));
    canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
    opt.e.preventDefault();
    opt.e.stopPropagation();
});

let _panning = false, _lastPanX = 0, _lastPanY = 0;
canvas.on('mouse:down:before', function(opt) {
    if (!canvas.isDrawingMode) { _panning = true; _lastPanX = opt.e.clientX; _lastPanY = opt.e.clientY; }
});
canvas.on('mouse:move', function(opt) {
    if (!_panning || canvas.isDrawingMode) return;
    canvas.relativePan({ x: opt.e.clientX - _lastPanX, y: opt.e.clientY - _lastPanY });
    _lastPanX = opt.e.clientX; _lastPanY = opt.e.clientY;
});
canvas.on('mouse:up', function() { _panning = false; });

// Data Management
let imagesData = [];        // Full dataset
let visibleImages = [];     // Currently filtered dataset
let selectedImageIds = new Set(); 

// User Session
let subUserName = sessionStorage.getItem('fw_subuser') || null;

// Navigation State
let lastSelectedIndex = -1; // Anchor for keyboard navigation

// Active Filters
let filterRatingValue = 0; // 0 = off
let activeColorFilters = new Set();

const BORDER_COLORS = {
    red: '#c96a67', yellow: '#e0c855',
    green: '#72a872', blue: '#5b9bc4'
};


// ==========================================================================
// TRANSLATION & LANGUAGE LOGIC
// ==========================================================================
const langData = {
    en: {
        title: "CLIENT SELECTION",
        user_label: "User:",
        view_all: "View: All Users",
        flag_only: "Show 🚩 flagged only",
        sort_by: "Sort by:",
        sort_file: "File Name",
        sort_rating: "Total Stars (High)",
        sort_sel: "Selected First",
        help_btn: "Help ?",
        rate_review: "RATE & REVIEW",
        scribblers: "Scribblers",
        assign_label: "Assign Label:",
        btn_flag: "🚩 Select (YES) (F)",
        your_comment: "Your Comment",
        save_note: "💾 Save Note",
        all_comments: "ALL COMMENTS",
        tools: "TOOLS",
        tool_draw: "Draw",
        tool_move: "Move",
        tool_clear: "Clear",
        shortcuts: "Keyboard Shortcuts",
        close_btn: "Close",
        // Dynamic strings
        stars_highest: "Stars (Highest)",
        selected: "🚩 SELECTED",
        not_selected: "Not Selected",
        upload_complete: "✔ Upload Complete!",
        saved: "Saved successfully!",
        counter_label: "selected",
        submit_btn: "Submit Selection",
        submitted_label: "✓ Submitted"
    },
    de: {
        title: "BILD AUSWAHL",
        user_label: "Benutzer:",
        view_all: "Ansicht: Alle Nutzer",
        flag_only: "Nur 🚩 markierte",
        sort_by: "Sortieren:",
        sort_file: "Dateiname",
        sort_rating: "Sterne (Hoch)",
        sort_sel: "Ausgewählte zuerst",
        help_btn: "Hilfe ?",
        rate_review: "BEWERTEN & PRÜFEN",
        scribblers: "Zeichner",
        assign_label: "Label zuweisen:",
        btn_flag: "🚩 Auswählen (JA) (F)",
        your_comment: "Dein Kommentar",
        save_note: "💾 Speichern",
        all_comments: "ALLE KOMMENTARE",
        tools: "WERKZEUGE",
        tool_draw: "Malen",
        tool_move: "Bewegen",
        tool_clear: "Löschen",
        shortcuts: "Tastaturkürzel",
        close_btn: "Schließen",
        // Dynamic strings
        stars_highest: "Sterne (Max)",
        selected: "🚩 AUSGEWÄHLT",
        not_selected: "Nicht ausgewählt",
        upload_complete: "✔ Upload fertig!",
        saved: "Erfolgreich gespeichert!",
        counter_label: "ausgewählt",
        submit_btn: "Auswahl einreichen",
        submitted_label: "✓ Eingereicht"
    }
};

let currentLang = localStorage.getItem('fw_lang') || 'en';

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('fw_lang', lang);
    
    // 1. Update Buttons
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`lang-${lang}`).classList.add('active');

    // 2. Update Static Text
    document.querySelectorAll('[data-lang-key]').forEach(el => {
        const key = el.dataset.langKey;
        if (langData[lang][key]) {
            // Handle Inputs/Placeholders separately
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = langData[lang][key];
            } else {
                el.innerText = langData[lang][key];
            }
        }
    });

    // 3. Update Help Modal visibility
    document.getElementById('help-en').style.display = (lang === 'en') ? 'block' : 'none';
    document.getElementById('help-de').style.display = (lang === 'de') ? 'block' : 'none';

    // 4. Update Dynamic UI (if editor is open)
    if (currentImageId) {
        // Trigger a fake stats update to refresh text
        const img = imagesData.find(i => i.id == currentImageId);
        if (img) {
            updateStatsUI({ 
                total_stars: img.total_stars, 
                yes_count: img.yes_count 
            });
        }
    }
}


// ==========================================================================
// THEME
// ==========================================================================
function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('fw_theme', next);
    // Also update body directly so styles.css body{background:#000} can't interfere
    document.body.style.setProperty('background', next === 'light' ? '#efefef' : '', 'important');
    document.body.style.setProperty('color',      next === 'light' ? '#111'    : '', 'important');
    updateThemeToggle(next);
}

function updateThemeToggle(theme) {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀' : '🌙';
}

// ==========================================================================
// MISC UTILITIES
// ==========================================================================
function confirmLogout() { return confirm('Log out?'); }

function startSessionPing() {
    setInterval(function() {
        const fd = new FormData(); fd.append('action', 'ping');
        fetch('api_selection.php', { method: 'POST', body: fd })
            .then(r => { if (r.status === 403) { showToast('Session expired — redirecting...', '#d9534f'); setTimeout(() => location.href = 'login.php', 2000); } })
            .catch(() => {});
    }, 5 * 60 * 1000);
}

// ==========================================================================
// FILTER PERSISTENCE
// ==========================================================================
function saveFilterState() {
    try {
        localStorage.setItem('fw_client_filters', JSON.stringify({
            sort:         document.getElementById('sort-select')?.value,
            filterYes:    document.getElementById('filter-yes')?.checked,
            ratingOp:     document.getElementById('rating-operator')?.value,
            ratingVal:    filterRatingValue,
            colorFilters: [...activeColorFilters]
        }));
    } catch(e) {}
}

function restoreFilterState() {
    try {
        const s = JSON.parse(localStorage.getItem('fw_client_filters') || '{}');
        if (s.sort) { const el = document.getElementById('sort-select'); if (el) el.value = s.sort; }
        if (s.filterYes) { const el = document.getElementById('filter-yes'); if (el) el.checked = true; }
        if (s.ratingOp) { const el = document.getElementById('rating-operator'); if (el) el.value = s.ratingOp; }
        if (s.ratingVal > 0) setFilterRating(s.ratingVal);
        if (Array.isArray(s.colorFilters)) s.colorFilters.forEach(c => toggleColorFilter(c));
    } catch(e) {}
}

// ==========================================================================
// SELECT ALL / DESELECT ALL
// ==========================================================================
window.selectAllVisible   = function() { batchFlagVisible(1); };
window.deselectAllVisible = function() { batchFlagVisible(0); };

function batchFlagVisible(flag) {
    const ids = visibleImages.map(i => i.id);
    if (!ids.length) { showToast('No photos to act on.', '#aaa'); return; }
    const fd = new FormData();
    fd.append('action',       'batch_flag');
    fd.append('sub_user_name', subUserName);
    fd.append('flag',          flag);
    fd.append('image_ids',     JSON.stringify(ids));
    fetch('api_selection.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') {
                ids.forEach(id => { const img = imagesData.find(i => i.id == id); if (img) img.my_selection = flag; });
                applyFilters();
                showToast(flag ? `✓ ${ids.length} photos selected` : `✕ Selection cleared`, flag ? '#5cb85c' : '#aaa');
            }
        });
}

// ==========================================================================
// 3. INITIALIZATION & EVENT LISTENERS
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    const initialTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    updateThemeToggle(initialTheme);
	setLanguage(currentLang); // Initialize Language
    // A. Session Check
    if(!subUserName) { 
        loadSubUserOptions(); 
    } else { 
        document.getElementById('login-modal').style.display = 'none'; 
        initGallery(); 
    }
    
    // B. Search Listener
    const searchInput = document.getElementById('client-search');
    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }

    // Grid size slider
    const gridSlider = document.getElementById('grid-size-slider');
    if (gridSlider) {
        const saved = localStorage.getItem('fw_grid_size');
        if (saved) { gridSlider.value = saved; document.documentElement.style.setProperty('--grid-min', saved + 'px'); }
        gridSlider.addEventListener('input', function() {
            document.documentElement.style.setProperty('--grid-min', this.value + 'px');
            localStorage.setItem('fw_grid_size', this.value);
        });
    }

    // Submit button: init from PHP-injected state
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn && submitBtn.dataset.submitted === '1') {
        updateSubmitButton(true, submitBtn.dataset.submittedAt);
    }

    // C. Login Input Listener
    const loginInput = document.getElementById('new-subuser-name');
    if(loginInput) {
        loginInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') setSubUser();
        });
    }

    // D. Star Rating Widget (Editor)
    document.querySelectorAll('.rating-stars span').forEach(star => {
        star.addEventListener('click', (e) => { 
            const val = parseInt(e.target.dataset.val);
            setRatingUI(val); 
            updateImageInteraction({ rating: val }); // Send ONLY rating
        });
    });
    
    // E. Flag Button (Editor)
    const flagBtn = document.getElementById('flag-btn');
    if (flagBtn) {
        flagBtn.addEventListener('click', function() {
            const isActive = this.classList.toggle('active');
            updateImageInteraction({ flag: isActive ? 1 : 0 }); // Send ONLY flag
        });
    }

    // F. Sort Dropdown
    const sortSel = document.getElementById('sort-select');
    if (sortSel) {
        sortSel.addEventListener('change', function() { saveFilterState(); loadImages(); });
    }

    // Save filter state on any filter interaction
    document.getElementById('filter-yes')?.addEventListener('change', saveFilterState);
    document.getElementById('rating-operator')?.addEventListener('change', saveFilterState);

    // G. Canvas Event: Attach owner to new paths
    canvas.on('path:created', function(e) { 
        e.path.set({ owner: subUserName }); 
        addNameTag(e.path); 
    });

  // ======================================================================
    // 3.1 MAIN KEYBOARD CONTROLLER
    // ======================================================================
    document.addEventListener('keydown', (e) => {
        // Ignore if typing in text fields
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

        const modal = document.getElementById('editor-modal');
        const isModalActive = modal.classList.contains('active');
        
        // Map keys to colors
        const colorMap = { '6': 'red', '7': 'yellow', '8': 'green', '9': 'blue' };

        // --- CONTEXT A: EDITOR OPEN ---
        if (isModalActive) {
            // Navigation
            if (e.key === "ArrowRight") changeImage(1);
            if (e.key === "ArrowLeft") changeImage(-1);
            if (e.key === "Enter") { 
                e.preventDefault(); 
                closeEditor(); 
            }
            
            // Rating (0-5)
            if(e.key >= '0' && e.key <= '5') {
                const val = parseInt(e.key);
                setRatingUI(val);
                updateImageInteraction({ rating: val });
            }
            
            // Color Labels (6-9) - FIX: Targets current image & toggles correctly
            if (colorMap[e.key]) {
                const color = colorMap[e.key];
                // Use setColor to handle the toggle logic + API call
                setColor(currentImageId, color); 
                
                // Immediately update the border to match new state
                const img = imagesData.find(i => i.id == currentImageId);
                if (img) updateCanvasBorder(img.color_label);
            }
            
            // Clear Colors
            if(e.key === 'Backspace') { 
                e.preventDefault(); 
                setColor(currentImageId, null); // Clear all
                updateCanvasBorder(null); 
            }
            
			// Flag Shortcut (F) in Editor ---
            if(e.key.toLowerCase() === 'f') {
                e.preventDefault();
                const btn = document.getElementById('flag-btn');
                if (btn) btn.click(); // Simulate a click to reuse the existing logic
            }
			
            return; 
        }

        // --- CONTEXT B: GRID NAVIGATION ---
        if (!isModalActive && visibleImages.length > 0) {
            const cols = getGridColumnCount();
            if (lastSelectedIndex === -1) lastSelectedIndex = 0;

            let newIndex = lastSelectedIndex;
            let didMove = false;

            // Directional Keys
            if (e.key === 'ArrowRight') { newIndex++; didMove = true; }
            if (e.key === 'ArrowLeft')  { newIndex--; didMove = true; }
            if (e.key === 'ArrowDown')  { newIndex += cols; didMove = true; }
            if (e.key === 'ArrowUp')    { newIndex -= cols; didMove = true; }

            if (didMove) {
                e.preventDefault();
                if (newIndex < 0) newIndex = 0;
                if (newIndex >= visibleImages.length) newIndex = visibleImages.length - 1;
                
                const targetId = visibleImages[newIndex].id;
                selectedImageIds.clear();
                selectedImageIds.add(targetId);
                lastSelectedIndex = newIndex;
                
                updateSelectionVisuals();
                scrollToCard(targetId);
            }

            // Open Editor
            if (e.key === 'Enter') {
                e.preventDefault();
                if (lastSelectedIndex !== -1 && visibleImages[lastSelectedIndex]) {
                    openEditor(visibleImages[lastSelectedIndex].id);
                }
            }

            // --- BATCH SHORTCUTS ---
            
            // Rating 0-5
            if(e.key >= '0' && e.key <= '5') {
                if (selectedImageIds.size > 0) applyBatchRating(parseInt(e.key));
            }

            // Colors 6-9 (Grid Batch)
            if (colorMap[e.key]) {
                applyBatchColor(colorMap[e.key]);
            }
            
            if(e.key === 'Backspace') { e.preventDefault(); applyBatchColor(null); }

            // Flag F
            if(e.key.toLowerCase() === 'f') {
                if (selectedImageIds.size > 0) applyBatchFlag();
            }
        }
    });
});

// ==========================================================================
// 4. API & DATA MANAGEMENT
// ==========================================================================

// Initial load: Fetch existing sub-user names for login
function loadSubUserOptions() {
    const fd = new FormData(); fd.append('action', 'fetch_subusers');
    fetch('api_selection.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(names => {
            const container = document.getElementById('existing-names'); 
            container.innerHTML = '';
            if(Array.isArray(names) && names.length > 0) {
                names.forEach(name => {
                    const btn = document.createElement('button'); 
                    btn.className = 'name-btn'; 
                    btn.innerText = name;
                    btn.onclick = () => { 
                        document.getElementById('new-subuser-name').value = name; 
                        setSubUser(); 
                    };
                    container.appendChild(btn);
                });
            } else { 
                container.innerHTML = '<p style="color:#aaa; font-size:0.9rem;">No existing users found.</p>'; 
            }
        });
}

// Log in as a sub-user
window.setSubUser = function() {
    const input = document.getElementById('new-subuser-name');
    const name = input.value.trim();
    if(!name) return showToast("Please enter a name.", "#d9534f");
    
    subUserName = name;
    sessionStorage.setItem('fw_subuser', subUserName);
    
    // Log entry to DB
    const fd = new FormData();
    fd.append('action', 'log_subuser');
    fd.append('sub_user_name', subUserName);
    fetch('api_selection.php', { method: 'POST', body: fd });

    document.getElementById('login-modal').style.display = 'none';
    initGallery();
};

window.resetSubUser = function() { 
    sessionStorage.removeItem('fw_subuser'); 
    location.reload(); 
};

// Initialize UI after login
function initGallery() {
    const display = document.getElementById('display-subuser');
    if (display) display.innerText = subUserName;
    restoreFilterState();
    loadImages();
    loadClientSubUserFilter();
    startSessionPing();
}

// Fetch main image list
function loadImages() {
    const sortSel = document.getElementById('sort-select');
    const sort = sortSel ? sortSel.value : 'file_name';
    
    const fd = new FormData(); 
    fd.append('action', 'fetch_images'); 
    fd.append('sort', sort); 
    fd.append('sub_user_name', subUserName);
    
    // --- ADD THIS BLOCK ---
    const filterUserElem = document.getElementById('filter-user');
    // If the element exists and the value is NOT "all", send it to PHP
    if (filterUserElem && filterUserElem.value !== 'all') {
        fd.append('filter_user', filterUserElem.value);
    }
    // ----------------------
    
    fetch('api_selection.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(data => { 
            if (Array.isArray(data)) {
                imagesData = data; 
                applyFilters(); 
            }
        });
}

// Core function to save specific fields (Rating, Flag, Comment, Scribble)
function updateImageInteraction(payload, refreshGrid = true) {
    if (!currentImageId) {
        // If called from grid batch action, ID must be in payload
        if (!payload.id) return Promise.resolve();
    }

    const fd = new FormData();
    fd.append('action', 'save_data'); 
    fd.append('id', payload.id || currentImageId); 
    fd.append('sub_user_name', subUserName);

    for (const [key, value] of Object.entries(payload)) {
        if(key !== 'id') fd.append(key, value);
    }

    return fetch('api_selection.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(res => {
            if(res.status === 'success') {
                // Update Editor UI if open
                if ((payload.id || currentImageId) == currentImageId) {
                    updateStatsUI(res.new_stats); 
                    updateCommentsUI(res.new_comments); 
                }
                // Update only the affected card in-place (avoids full network reload)
                if (refreshGrid) {
                    const imgId = payload.id || currentImageId;
                    const imgIdx = imagesData.findIndex(i => i.id == imgId);
                    if (imgIdx !== -1) {
                        if (res.new_stats) {
                            imagesData[imgIdx].total_stars = res.new_stats.total_stars;
                            imagesData[imgIdx].yes_count   = res.new_stats.yes_count;
                        }
                        if (payload.rating !== undefined) imagesData[imgIdx].my_rating    = payload.rating;
                        if (payload.flag   !== undefined) imagesData[imgIdx].my_selection = payload.flag;
                    }
                    applyFilters();
                }
            }
        });
}

// Saves pending text comments and scribbles (used on navigation)
function savePendingChanges() {
    const commentInput = document.getElementById('img-comment');
    const comment = commentInput ? commentInput.value : '';
    const scribble = prepareScribbleData();
    
    return updateImageInteraction({ 
        comment: comment, 
        scribble: scribble || '' 
    }, true);
}


// ==========================================================================
// 5. FILTERING LOGIC
// ==========================================================================

window.applyFilters = function() {
    // 1. Get Inputs
    const termInput = document.getElementById('client-search');
    const term = termInput ? termInput.value.toLowerCase() : '';
    const showYesElement = document.getElementById('filter-yes');
    const showYes = showYesElement ? showYesElement.checked : false;
    const operatorElement = document.getElementById('rating-operator');
    const operator = operatorElement ? operatorElement.value : 'ge';

    // 2. Filter List
        visibleImages = imagesData.filter(img => {
		// A. Multi-Color Filter (Lightroom Style)
		if (activeColorFilters.size > 0) {
            const imgColors = img.color_label ? img.color_label.split(',') : [];
            const hasAny = Array.from(activeColorFilters).some(c => imgColors.includes(c));
            if (!hasAny) return false;
        }

        // B. Filename search
        if (term && !img.file_name.toLowerCase().includes(term)) return false;

        // C. "Show Selected"
        if (showYes && parseInt(img.yes_count) === 0) return false;

        // D. Star Rating
        if (filterRatingValue > 0) {
            const imgRating = parseInt(img.total_stars) || 0;
            if (operator === 'ge' && imgRating < filterRatingValue) return false;
            if (operator === 'le' && imgRating > filterRatingValue) return false;
            if (operator === 'eq' && imgRating !== filterRatingValue) return false;
        }

        return true;
    });

    // 3. Restore focus/index tracking
    let newIndex = -1;
    if (selectedImageIds.size > 0) {
        const activeId = [...selectedImageIds][0];
        newIndex = visibleImages.findIndex(img => img.id == activeId);
    }
    lastSelectedIndex = newIndex;
    
    renderGrid();
};

window.setFilterRating = function(val) {
    // Toggle logic: Click 3 again to turn it off
    if (filterRatingValue === val) val = 0;
    
    filterRatingValue = val;
    
    // Update UI (Gold stars)
    const stars = document.querySelectorAll('#filter-stars span');
    stars.forEach(s => {
        const starVal = parseInt(s.dataset.val);
        s.classList.toggle('active', starVal <= filterRatingValue);
    });
    
    // Show/Hide Reset 'X'
    const resetBtn = document.getElementById('filter-reset');
    if(resetBtn) resetBtn.style.display = (val > 0) ? 'inline' : 'none';

    saveFilterState();
    applyFilters();
};

window.toggleColorFilter = function(color) {
    if (color === 'all') {
        activeColorFilters.clear();
    } else {
        if (activeColorFilters.has(color)) {
            activeColorFilters.delete(color);
        } else {
            activeColorFilters.add(color);
        }
    }
    
    // Update UI squares
    document.querySelectorAll('.color-sq').forEach(sq => {
        const c = sq.dataset.color;
        sq.classList.toggle('active', activeColorFilters.has(c));
    });

    saveFilterState();
    applyFilters();
};


// ==========================================================================
// 6. GRID RENDERING & INTERACTION (OPTIMIZED NO-FLICKER)
// ==========================================================================

function renderGrid() {
    const grid = document.getElementById('grid-container');
    
    if (!visibleImages || visibleImages.length === 0) { 
        grid.innerHTML = '<p style="color:#666; padding:2rem;">No matching images found.</p>'; 
        return; 
    }

    // 1. Create a "Fragment" (Invisible holding area)
    const fragment = document.createDocumentFragment();

    visibleImages.forEach((img, index) => {
        const container = document.createElement('div');
        container.className = 'sel-item-container';
        
        const div = document.createElement('div');
        div.className = 'sel-item';
        div.id = `client-card-${img.id}`;
        div.dataset.id = img.id; 
        
        if (selectedImageIds.has(img.id)) {
            div.classList.add('selected');
        }

        // --- MOBILE DOUBLE-TAP DETECTION ---
        let lastTap = 0;
        div.addEventListener('touchend', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            if (tapLength < 300 && tapLength > 0) {
                e.preventDefault(); 
                openEditor(img.id);
            }
            lastTap = currentTime;
        });

        // --- DESKTOP CLICK & DOUBLE CLICK ---
        div.onclick = (e) => {
            if (e.target.closest('.color-picker-overlay') || e.target.closest('.select-handle')) return;
            if (e.detail > 1) return; 
            handleSelectionClick(img.id, index, e);
        };

        div.ondblclick = () => {
            openEditor(img.id);
        };

        // --- CARD CONTENT ---
        let badges = '';
        if (img.total_stars > 0) badges += `<div class="badge">★ ${img.total_stars}</div>`;
        
        // Updated Flag Logic (No Number)
        if (img.yes_count > 0) badges += `<div class="badge flagged">🚩</div>`;
        
        if (img.comment_count > 0) badges += `<div class="badge" style="background:#444; color:#fff;" title="Comments">💬 ${img.comment_count}</div>`;
        
        if (img.total_scribbles > 0 || (img.my_scribble && img.my_scribble.includes('"objects":[{'))) {
            badges += `<div class="badge scribbled" title="Retouch Notes">✎</div>`;
        }

        div.innerHTML = `
            <div class="color-picker-overlay">
                <div class="color-dot dot-red" onclick="setColor(${img.id}, 'red', event)" title="Red"></div>
                <div class="color-dot dot-yellow" onclick="setColor(${img.id}, 'yellow', event)" title="Yellow"></div>
                <div class="color-dot dot-green" onclick="setColor(${img.id}, 'green', event)" title="Green"></div>
                <div class="color-dot dot-blue" onclick="setColor(${img.id}, 'blue', event)" title="Blue"></div>
                <div class="color-dot dot-none" onclick="setColor(${img.id}, null, event)" title="Clear Color">×</div>
            </div>
            <img src="uploads/${img.username}/${img.file_name}" loading="lazy">
            <div class="status-badges">${badges}</div>
            <div class="select-handle"></div>
        `;
        
        // Multi-Color Strips
        const label = document.createElement('div');
        label.className = 'file-name-label';

        if (img.color_label) {
            const colors = img.color_label.split(',').filter(c => c.length > 0);
            colors.forEach((c, i) => {
                const strip = document.createElement('div');
                strip.className = `color-strip bg-${c}`;
                const width = 100 / colors.length;
                strip.style.width = width + '%';
                strip.style.left = (width * i) + '%';
                label.appendChild(strip);
            });
        }
        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-name-text';
        nameSpan.textContent = img.file_name;
        nameSpan.title = img.file_name;
        label.appendChild(nameSpan);
        
        div.appendChild(label);
        container.appendChild(div);
        
        // APPEND TO FRAGMENT (Not Grid yet)
        fragment.appendChild(container);
    }); 

    // 2. SWAP CONTENT IN ONE GO
    // This removes the old content and adds the new content in a single "paint" frame
    grid.innerHTML = '';
    grid.appendChild(fragment);

    updateSelectionCounter();
    updateGalleryCount();
}

function updateGalleryCount() {
    const el = document.getElementById('gallery-count');
    if (!el) return;
    const vis = visibleImages.length, total = imagesData.length;
    if (total === 0) { el.textContent = ''; return; }
    el.textContent = vis < total ? `${vis} of ${total} photos` : `${total} photos`;
}

function updateSelectionCounter() {
    const el = document.getElementById('selection-counter');
    if (!el) return;
    const count = imagesData.filter(img => parseInt(img.my_selection) === 1).length;
    const quota = parseInt(el.dataset.quota) || 0;
    const label = langData[currentLang].counter_label || 'selected';

    if (quota > 0) {
        el.innerHTML = `${count} / ${quota} <span data-lang-key="counter_label">${label}</span>`;
        el.classList.remove('has-selection', 'quota-met', 'quota-over');
        if (count === quota)      el.classList.add('quota-met');
        else if (count > quota)   el.classList.add('quota-over');
        else if (count > 0)       el.classList.add('has-selection');
    } else {
        el.innerHTML = `${count} <span data-lang-key="counter_label">${label}</span>`;
        el.classList.remove('quota-met', 'quota-over');
        el.classList.toggle('has-selection', count > 0);
    }
}

// Handles clicks on grid items (Single, Shift+Click, Ctrl+Click)
function handleSelectionClick(id, index, event) {
    if (event.shiftKey && lastSelectedIndex !== -1) {
        // Range Selection
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        
        if (!event.ctrlKey && !event.metaKey) selectedImageIds.clear();

        for (let i = start; i <= end; i++) {
            if(visibleImages[i]) selectedImageIds.add(visibleImages[i].id);
        }
    } else if (event.ctrlKey || event.metaKey) {
        // Toggle Selection
        if (selectedImageIds.has(id)) selectedImageIds.delete(id);
        else selectedImageIds.add(id);
        lastSelectedIndex = index;
    } else {
        // Single Selection
        selectedImageIds.clear();
        selectedImageIds.add(id);
        lastSelectedIndex = index;
    }
    updateSelectionVisuals();
}

// Updates CSS classes for selected images in the grid
function updateSelectionVisuals() {
    const cards = document.querySelectorAll('.sel-item');
    cards.forEach(card => {
        const id = parseInt(card.dataset.id);
        if (selectedImageIds.has(id)) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
}

function scrollToCard(id) {
    const card = document.getElementById(`client-card-${id}`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}


// Updated setColor to trigger animation
window.setColor = function(id, color, event) {
    if (event) event.stopPropagation();
    
    if (!id) id = currentImageId;
    if (!id) return;

    const img = imagesData.find(i => i.id == id);
    if (img) {
        let currentColors = img.color_label ? img.color_label.split(',').filter(c => c.length > 0) : [];
        
        if (!color) {
            img.color_label = "";
        } else {
            const index = currentColors.indexOf(color);
            if (index > -1) {
                currentColors.splice(index, 1);
            } else {
                currentColors.push(color);
                // Trigger animation on the clicked element if event exists
                if (event && event.target) {
                    event.target.classList.add('pulse-effect');
                    setTimeout(() => event.target.classList.remove('pulse-effect'), 200);
                }
            }
            img.color_label = currentColors.join(',');
        }
    }
    
    renderGrid();

    if (document.getElementById('editor-modal').classList.contains('active') && id == currentImageId) {
        updateEditorAssignedLabels(); 
        if (img) updateCanvasBorder(img.color_label); 
    }

    const fd = new FormData();
    fd.append('action', 'set_color_label');
    fd.append('image_id', id);
    fd.append('color', color || ''); 

    fetch('api_selection.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(res => {
            if(res.status === 'success') {
                if(img) img.color_label = res.new_colors;
                renderGrid();
                if (id == currentImageId) {
                    updateEditorAssignedLabels();
                    updateCanvasBorder(res.new_colors);
                }
            }
        });
};


// ==========================================================================
// 7. ROBUST BATCH ACTIONS (STRICT QUEUE)
// ==========================================================================

// 1. The Queue Processor
async function runSafeBatch(label, dataBuilder) {
    const ids = Array.from(selectedImageIds);
    const total = ids.length;
    
    if (total === 0) return;

    // Show Progress Bar
    if (typeof showProgressToast === 'function') {
        showProgressToast(0, total, label);
    }

    // Helper: Send one request with Auto-Retry logic
    const sendWithRetry = async (id, attempt = 1) => {
        const fd = dataBuilder(id);
        
        try {
            const response = await fetch('api_selection.php', { method: 'POST', body: fd });

            // A. SERVER BUSY (503) -> PAUSE & RETRY
            if (response.status === 503 || response.status === 429) {
                if (attempt > 5) throw new Error("Server blocked connection (Max retries)");
                
                // Wait (Exponential Backoff: 2s, 4s, 8s...)
                const waitTime = Math.pow(2, attempt) * 1000;
                
                // Update Toast to warn user
                if (typeof showProgressToast === 'function') {
                    showProgressToast(completed, total, `⚠ Busy (Waiting ${waitTime/1000}s)...`);
                }

                await new Promise(r => setTimeout(r, waitTime));
                return await sendWithRetry(id, attempt + 1);
            }

            // B. HTTP ERRORS
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            // C. SUCCESS
            return true;

        } catch (err) {
            console.error(`Failed ID ${id}:`, err);
            return false; // Mark as failed but continue queue
        }
    };

    // 2. Process Loop (Strictly One-by-One)
    let completed = 0;
    
    for (const id of ids) {
        // Update Toast BEFORE starting (so user sees what's happening)
        if (typeof showProgressToast === 'function') {
            showProgressToast(completed, total, label);
        }

        // Wait for this request to finish before starting the next
        await sendWithRetry(id);
        
        // Increment & Update Toast
        completed++;
        if (typeof showProgressToast === 'function') {
            showProgressToast(completed, total, label);
        }
    }

    // 3. Finish
    if (typeof hideProgressToast === 'function') hideProgressToast();
    loadImages(); // Refresh Grid
}


// --- PUBLIC BATCH FUNCTIONS ---

function applyBatchRating(rating) {
    runSafeBatch(`Rating ${rating} Stars...`, (id) => {
        const fd = new FormData();
        fd.append('action', 'save_data');
        fd.append('id', id);
        fd.append('sub_user_name', subUserName);
        fd.append('rating', rating);
        return fd;
    });
}

function applyBatchFlag() {
    // Determine target state first
    let turnOn = false;
    selectedImageIds.forEach(id => {
        const img = imagesData.find(i => i.id == id);
        const mySel = (img && img.my_selection) ? parseInt(img.my_selection) : 0;
        if (mySel === 0) turnOn = true;
    });
    const targetFlag = turnOn ? 1 : 0;
    const label = turnOn ? "Flagging..." : "Unflagging...";

    runSafeBatch(label, (id) => {
        const fd = new FormData();
        fd.append('action', 'save_data');
        fd.append('id', id);
        fd.append('sub_user_name', subUserName);
        fd.append('flag', targetFlag);
        return fd;
    });
}

window.applyBatchColor = function(color) {
    const label = color ? `Coloring ${color}...` : "Clearing Colors...";
    
    // Optimistic Update for all selected images
    selectedImageIds.forEach(id => {
        const img = imagesData.find(i => i.id == id);
        if (img) {
             let currentColors = img.color_label ? img.color_label.split(',').filter(c => c) : [];
             if (!color) {
                 img.color_label = "";
             } else {
                 const index = currentColors.indexOf(color);
                 if (index > -1) currentColors.splice(index, 1);
                 else currentColors.push(color);
                 img.color_label = currentColors.join(',');
             }
        }
    });
    renderGrid(); 

    // Process the API calls in a queue
    runSafeBatch(label, (id) => {
        const fd = new FormData();
        fd.append('action', 'set_color_label');
        fd.append('image_id', id);
        fd.append('color', color || ''); // The PHP handles the toggle
        return fd;
    });
};



// ==========================================================================
// 8. EDITOR LOGIC
// ==========================================================================

function openEditor(id) {
    currentImageId = id;
	
    const idx = visibleImages.findIndex(i => i.id == id);
    if(idx === -1) return;
    
    updateNavArrows(idx);
	
    const imgObj = visibleImages[idx];
    document.getElementById('editor-modal').classList.add('active');
	document.body.style.overflow = 'hidden';
    document.getElementById('editor-filename-display').innerText = imgObj.file_name;

    const dlBtn = document.getElementById('download-btn');
    if (dlBtn) {
        dlBtn.href = `uploads/${imgObj.username}/${imgObj.file_name}`;
        dlBtn.download = imgObj.file_name;
    }
	
	updateEditorAssignedLabels();

    const filterContainer = document.getElementById('editor-active-filters');
    if (filterContainer) {
        // Check if there are any active filters in the global Set
        if (activeColorFilters.size > 0) {
            let html = '<label style="color:#aaa; font-size:0.8rem; text-transform:uppercase; display:block; margin-bottom:5px;">Active Filters:</label>';
            html += '<div style="display:flex; gap:5px;">';
            
            // Loop through active colors (e.g., "red", "yellow") and create squares
            activeColorFilters.forEach(color => {
                // Uses existing classes .sq-red, .sq-blue from client_style.css
                html += `<div class="color-sq sq-${color}" style="width:16px; height:16px; cursor:default; transform:none; border:1px solid #555;" title="Filter: ${color}"></div>`;
            });
            
            html += '</div>';
            filterContainer.innerHTML = html;
            filterContainer.style.display = 'block';
        } else {
            // Hide if no filters are active
            filterContainer.style.display = 'none';
        }
    }
	
	// ---------------------------------------------------------
    // NEW: SHOW CURRENT IMAGE'S ASSIGNED COLORS
    // ---------------------------------------------------------
    const colorsContainer = document.getElementById('editor-image-colors');
    if (colorsContainer) {
        // imgObj is defined at the top of openEditor: const imgObj = imagesData[idx];
        if (imgObj && imgObj.color_label) {
            const currentColors = imgObj.color_label.split(',').filter(c => c);
            
            if (currentColors.length > 0) {
                let html = '<label style="color:#aaa; font-size:0.8rem; text-transform:uppercase; display:block; margin-bottom:5px;">Assigned Labels:</label>';
                html += '<div style="display:flex; gap:5px;">';
                
                currentColors.forEach(color => {
                    // Reuse existing square styles
                    html += `<div class="color-sq sq-${color}" style="width:16px; height:16px; cursor:default; border:1px solid #555;" title="${color}"></div>`;
                });
                
                html += '</div>';
                colorsContainer.innerHTML = html;
                colorsContainer.style.display = 'block';
            } else {
                colorsContainer.style.display = 'none';
            }
        } else {
            colorsContainer.style.display = 'none';
        }
    }

	
    // Fetch Full Details
    const fd = new FormData();
    fd.append('action', 'fetch_image_details');
    fd.append('image_id', id);
    fd.append('sub_user_name', subUserName);

	const filterUserElem = document.getElementById('filter-user');
		// Falls ein Filter gewählt ist, senden wir diesen an die API
		if (filterUserElem && filterUserElem.value !== 'all') {
			fd.append('filter_user', filterUserElem.value);
		}
	
    fetch('api_selection.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(data => {
            if(currentImageId != id) return;
            
            updateStatsUI(data.liveStats);
            updateCommentsUI(data.liveComments);
            const myData = data.myData || {};
            
            // 1. Update UI State (My Rating/Comment)
            setRatingUI(myData.rating || 0);
            document.getElementById('img-comment').value = myData.comment || '';
            
            const flagBtn = document.getElementById('flag-btn');
            if(myData.is_selected == 1) flagBtn.classList.add('active'); 
            else flagBtn.classList.remove('active');

            // 2. Build Participant Legend
            const legendDiv = document.getElementById('active-users-legend');
            legendDiv.innerHTML = '';
            
            const uniqueUsers = new Set();
            if (data.interactions) {
                data.interactions.forEach(i => uniqueUsers.add(i.sub_user_name));
            }
            
            if (uniqueUsers.size === 0) {
                legendDiv.innerHTML = '<span style="color:#555; font-size:0.8rem; font-style:italic;">No activity yet.</span>';
            } else {
                uniqueUsers.forEach(name => {
                    const color = getColorForUser(name);
                    
                    // High Contrast Text Calculation
                    let textColor = '#fff';
                    let textShadow = '0 1px 2px rgba(0,0,0,0.4)';
                    const match = color.match(/hsl\((\d+)/);
                    if (match) {
                        const h = parseInt(match[1]);
                        // Yellow/Green range gets dark text
                        if (h > 30 && h < 200) {
                            textColor = '#000';
                            textShadow = 'none';
                        }
                    }

                    const badge = document.createElement('div');
                    badge.innerText = name;
                    badge.style.cssText = `
                        background: ${color}; 
                        color: ${textColor}; 
                        padding: 4px 10px; 
                        border-radius: 12px; 
                        font-size: 0.75rem; 
                        font-weight: bold; 
                        text-shadow: ${textShadow};
                        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    `;
                    legendDiv.appendChild(badge);
                });
            }
            
            // 3. Load Scribbles
            let allScribbles = [];
            if (data.interactions && data.interactions.length > 0) {
                data.interactions.forEach(row => {
                    if (row.scribble_data) {
                        allScribbles.push(row.scribble_data);
                    }
                });
            }
            
            loadCanvasImage(`uploads/${imgObj.username}/${imgObj.file_name}`, allScribbles, id);
        });
}

// Ensures the grid selection matches the editor image when closing
function syncGridToEditor() {
    if (!currentImageId) return;
    selectedImageIds.clear();
    selectedImageIds.add(currentImageId);
    const visibleIndex = visibleImages.findIndex(img => img.id == currentImageId);
    if (visibleIndex !== -1) lastSelectedIndex = visibleIndex;
    updateSelectionVisuals();
    scrollToCard(currentImageId);
}

function saveAndClose() {
    savePendingChanges().then(() => { 
        document.getElementById('editor-modal').classList.remove('active'); 
		document.body.style.overflow = '';
        syncGridToEditor(); 
    }); 
}

function closeEditor() { 
    savePendingChanges().then(() => {
        document.getElementById('editor-modal').classList.remove('active'); 
		document.body.style.overflow = '';
        syncGridToEditor();
    });
}

function changeImage(dir) {
    savePendingChanges().then(() => {
        // Find position within the FILTERED list
        const idx = visibleImages.findIndex(i => i.id == currentImageId);
        if(idx === -1) return;
        
        let newIdx = idx + dir;
        // Ensure we stay within the bounds of the filtered results
        if(newIdx < 0 || newIdx >= visibleImages.length) return;
        
        openEditor(visibleImages[newIdx].id);
    });
}

function updateNavArrows(idx) {
    const prevBtn = document.getElementById('nav-prev');
    const nextBtn = document.getElementById('nav-next');
    const counterDisplay = document.getElementById('editor-counter'); // New element
    
    // Hide arrows if at the start or end of the filtered list
    if(prevBtn) prevBtn.style.display = (idx <= 0) ? 'none' : 'block';
    if(nextBtn) nextBtn.style.display = (idx >= visibleImages.length - 1) ? 'none' : 'block';

    // Update the "X of Y" counter text
    if(counterDisplay) {
        counterDisplay.innerText = `${idx + 1} / ${visibleImages.length}`;
    }
}

function updateStatsUI(stats) { 
    if(stats) { 
        const globalStats = document.getElementById('global-stats');
        const txtStars = langData[currentLang].stars_highest; // NEU
        
        if(globalStats) globalStats.innerText = `${stats.total_stars} ${txtStars}`; 
        
        const globalYes = document.getElementById('global-yes');
        if(globalYes) {
            const txtYes = langData[currentLang].selected;
            const txtNo = langData[currentLang].not_selected;
            
            globalYes.innerHTML = stats.yes_count > 0 ? txtYes : txtNo;
            globalYes.style.color = stats.yes_count > 0 ? '#d9534f' : '#666';
        }
    } 
}

function updateCommentsUI(interactions) {
    const list = document.getElementById('other-comments-list'); 
    list.innerHTML = '';
    
    if(interactions && interactions.length > 0) {
        interactions.forEach(item => {
            // Generate Stars String
            let stars = '';
            if (item.rating > 0) {
                stars = `<span style="color:#ffd700; margin-left:5px;">${'★'.repeat(item.rating)}</span>`;
            }

            // Generate Flag String
            let flag = '';
            if (item.is_selected == 1) {
                flag = `<span style="color:#d9534f; margin-left:5px;">🚩</span>`;
            }

            // Generate Comment HTML (only if text exists)
            let commentHtml = '';
            if (item.comment) {
                commentHtml = `<div style="margin-top:2px; color:#ddd; font-weight:normal;">"${item.comment}"</div>`;
            }

            // Combine
            const div = document.createElement('div');
            div.className = 'comment-item';
            div.innerHTML = `
                <div class="comment-author">
                    ${item.sub_user_name} 
                    ${stars} 
                    ${flag}
                </div>
                ${commentHtml}
            `;
            list.appendChild(div);
        });
    } else {
        list.innerHTML = '<div style="padding:10px; color:#444; font-style:italic;">No ratings or comments yet.</div>';
    }
}

function deleteMyComment() { 
    if(confirm("Delete comment?")) { 
        document.getElementById('img-comment').value = ""; 
        updateImageInteraction({ comment: '' });
    }
}


// ==========================================================================
// 9. CANVAS & SCRIBBLING TOOLS
// ==========================================================================

function loadCanvasImage(url, scribbleJsonList, targetId) {
    canvas.clear(); 
    
    fabric.Image.fromURL(url, function(oImg) {
        if (currentImageId !== targetId) return;
        
        // Responsive Scaling
        const wrapper = document.getElementById('canvas-wrapper');
        const scale = Math.min((wrapper.clientWidth - 40) / oImg.width, (wrapper.clientHeight - 40) / oImg.height);
        currentImgScale = scale;
        
        oImg.scale(scale);
        canvas.setWidth(oImg.getScaledWidth());
        canvas.setHeight(oImg.getScaledHeight());
        canvas.setBackgroundImage(oImg, canvas.renderAll.bind(canvas));
		
        
		const currentImgObj = imagesData.find(i => i.id == targetId);
        if (currentImgObj) {
            updateCanvasBorder(currentImgObj.color_label);
        }

        // Load overlay objects
        if(scribbleJsonList && Array.isArray(scribbleJsonList)) {
            scribbleJsonList.forEach(jsonStr => {
                if(!jsonStr) return;
                
                let parsed;
                try { parsed = JSON.parse(jsonStr); } catch(e) { return; }
                
                if (parsed && parsed.objects) {
                    fabric.util.enlivenObjects(parsed.objects, function(enlivenedObjects) {
                        if (currentImageId !== targetId) return;
                        
                        enlivenedObjects.forEach(function(obj) {
                            if (obj.type === 'text') return; 
                            
                            // Rescale objects to current view
                            obj.scaleX *= scale; 
                            obj.scaleY *= scale; 
                            obj.left *= scale; 
                            obj.top *= scale;
                            obj.setCoords();

                            // Colorize & Tag based on owner
                            if (obj.owner) {
                                const userColor = getColorForUser(obj.owner);
                                obj.set({ stroke: userColor }); 
                                obj.set({ dirty: true });      
                                addNameTag(obj);
                            }
                            
                            // Lock others' drawings
                            if (obj.owner !== subUserName) {
                                obj.selectable = false;
                                obj.evented = false;
                            }

                            canvas.add(obj);
                        });
                        canvas.renderAll();
                    }, null, function(jsonObj, fabricObj) {
                        // Restore owner property
                        if (jsonObj.owner) {
                            fabricObj.owner = jsonObj.owner;
                        }
                    });
                }
            });
        }
        window.enableDraw(true); 
    });
}

function loadClientSubUserFilter() {
    const fd = new FormData();
    fd.append('action', 'fetch_subusers');
    // Kein target_user_id nötig, PHP nimmt automatisch den current user
    fetch('api_selection.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(names => {
            const dropdown = document.getElementById('filter-user');
            if (!dropdown) return;
            
            // Reset
            dropdown.innerHTML = '<option value="all">View: All Users</option>';
            
            names.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                // Markiere den eigenen User
                if(name === subUserName) {
                    opt.innerText = `My Selection (${name})`;
                    opt.style.fontWeight = 'bold';
                    opt.style.color = '#ffd700';
                } else {
                    opt.innerText = name;
                }
                dropdown.appendChild(opt);
            });
        });
}

function addNameTag(obj) {
    const userColor = getColorForUser(obj.owner);
    
    let textColor = '#fff';
    const match = userColor.match(/hsl\((\d+)/);
    if (match) {
        const h = parseInt(match[1]);
        if (h > 30 && h < 200) textColor = '#000';
    }
    
    const text = new fabric.Text(obj.owner, {
        fontSize: 14, 
        fontFamily: 'Inter', 
        fill: textColor,               
        backgroundColor: userColor,    
        left: obj.left, 
        top: obj.top - 20, 
        selectable: false, 
        evented: false, 
        objectCaching: false,
        padding: 4                     
    });
    canvas.add(text);
}

function prepareScribbleData() {
    const objs = canvas.getObjects();
    const myObjects = objs.filter(obj => obj.type !== 'text' && obj.owner === subUserName);
    
    if (myObjects.length === 0) return ''; 

    const factor = 1 / currentImgScale;
    
    const serializedObjects = myObjects.map(obj => {
        // Save 'owner' property
        const data = obj.toObject(['owner']); 
        
        // Revert scale to 1.0 base
        data.scaleX *= factor; 
        data.scaleY *= factor; 
        data.left *= factor; 
        data.top *= factor;
        
        return data;
    });

    const json = {
        version: "5.3.1",
        objects: serializedObjects
    };
    
    return JSON.stringify(json); 
}

window.resetCanvasView = function() {
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
};

window.enableDraw = function(bool) {
    _panning = false;
    canvas.isDrawingMode = bool; 
    document.getElementById('btn-draw').classList.toggle('active', bool);
    document.getElementById('btn-move').classList.toggle('active', !bool);
    
    if (bool) {
        const userColor = getColorForUser(subUserName);
        canvas.freeDrawingBrush.width = 5; 
        canvas.freeDrawingBrush.color = userColor;
        document.querySelector('#btn-draw .scribble-icon').style.color = '#000';
    }
};

window.clearCanvas = function() { 
    const objects = canvas.getObjects();
    const myObjects = objects.filter(obj => obj.owner === subUserName);
    
    if (myObjects.length === 0) {
        alert("Nothing to clear (You can only delete your own scribbles).");
        return;
    }

    if(!confirm("Clear YOUR scribbles? (Other users' notes will remain)")) return;
    
    for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (obj.owner === subUserName) {
            canvas.remove(obj);
        }
    }
    
    canvas.renderAll(); 
    updateImageInteraction({ scribble: '' });
};


// ==========================================================================
// 10. UI HELPERS & UTILITIES
// ==========================================================================

window.showToast = function(message, colorCode = '#fff') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    
    const dot = `<span style="height:12px; width:12px; background:${colorCode}; border-radius:50%; display:inline-block; border:1px solid rgba(255,255,255,0.3);"></span>`;
    toast.innerHTML = `${dot} ${message}`;
    
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
};

// Generates a consistent, bright HSL color from a name string
function getColorForUser(name) {
    if (!name) return '#ff0000';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360); 
    return `hsl(${h}, 85%, 60%)`;
}

function getGridColumnCount() {
    const grid = document.getElementById('grid-container');
    const items = grid.getElementsByClassName('sel-item-container');
    if (items.length < 2) return 1;
    const firstTop = items[0].getBoundingClientRect().top;
    for (let i = 1; i < items.length; i++) {
        if (items[i].getBoundingClientRect().top > firstTop) return i;
    }
    return items.length;
}

function scrollToCard(id) {
    const card = document.getElementById(`client-card-${id}`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Helper to update Star Widget classes
window.setRatingUI = function(val) { 
    val = parseInt(val);
    document.querySelectorAll('.rating-stars span').forEach(s => s.classList.toggle('active', s.dataset.val <= val)); 
};

// Compatibility wrapper for "Save Note" button
window.saveCurrentState = function(shouldAlert, reload) {
    return savePendingChanges().then(() => { 
        if(shouldAlert) {
            // ALT: alert("Saved");  <-- Das erzeugt das nervige Popup
            // NEU: Nutzt die schöne Toast-Nachricht (Grün)
            showToast("Saved successfully!", "#5cb85c");
        }
    });
};

window.openHelp = function() { document.getElementById('help-modal').style.display = 'flex'; };
window.closeHelp = function() { document.getElementById('help-modal').style.display = 'none'; };


// Uses an absolute underlay to prevent layout shifts ("translated" look)
function updateCanvasBorder(colorString) {
    // 1. Target the FabricJS wrapper
    const wrapper = document.querySelector('.canvas-container');
    if (!wrapper) return;

    // 2. Critical Layout Fixes
    wrapper.style.overflow = 'visible';  // Allow border to stick out
    wrapper.style.position = 'relative'; // Ensure alignment context

    // 3. Clear old-style borders (Clean slate)
    wrapper.style.boxShadow = 'none'; 
    wrapper.style.border = 'none';
    wrapper.style.borderImage = 'none';

    // 4. Create or Get the Absolute Border Layer
    let borderLayer = wrapper.querySelector('.custom-border-layer');
    if (!borderLayer) {
        borderLayer = document.createElement('div');
        borderLayer.className = 'custom-border-layer';
        // Style: Position 10px OUTSIDE the image on all sides
        Object.assign(borderLayer.style, {
            position: 'absolute',
            top: '-10px', left: '-10px', right: '-10px', bottom: '-10px',
            borderRadius: '4px'
        });
        wrapper.insertBefore(borderLayer, wrapper.firstChild);
    }

    // 5. Process Colors
    const colors = colorString ? colorString.split(',').filter(c => c && BORDER_COLORS[c]) : [];

    if (colors.length === 0) {
        borderLayer.style.display = 'none';
        return;
    }

    // 6. Apply Border Style
    borderLayer.style.display = 'block';

    if (colors.length === 1) {
        // SINGLE COLOR: Solid block with Glow
        const c = BORDER_COLORS[colors[0]];
        borderLayer.style.background = c;
        borderLayer.style.boxShadow = `0 0 20px ${c}40`; // Soft glow
    } else {
        // MULTI-COLOR: Conic Gradient (Split colors evenly)
        const stops = [];
        const step = 100 / colors.length;
        
        colors.forEach((c, i) => {
            const hex = BORDER_COLORS[c];
            // Create sharp transitions between colors
            stops.push(`${hex} ${i * step}%`);
            stops.push(`${hex} ${(i + 1) * step}%`);
        });
        
        borderLayer.style.background = `conic-gradient(${stops.join(', ')})`;
        borderLayer.style.boxShadow = 'none'; // Clean look for multi-color
    }
}

// ==========================================================================
// 11. PASSWORD CHANGE MODAL
// ==========================================================================

function openPassModal() { 
    document.getElementById('pass-modal').style.display = 'flex'; 
}

function closePassModal() { 
    document.getElementById('pass-modal').style.display = 'none'; 
    document.getElementById('client-pass-form').reset(); 
}

// Handle Form Submission
const passForm = document.getElementById('client-pass-form');
if (passForm) {
    passForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const oldPass = document.getElementById('old-pass').value;
        const newPass = document.getElementById('new-pass').value;

        const fd = new FormData();
        fd.append('action', 'change_password');
        fd.append('old_password', oldPass);
        fd.append('new_password', newPass);

        fetch('api_selection.php', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(data => {
                if (data.status === 'success') {
                    showToast('Password updated.', '#5cb85c');
                    closePassModal();
                } else {
                    showToast('Incorrect current password.', '#d9534f');
                }
            })
            .catch(() => {
                showToast('Request failed.', '#d9534f');
            });
    });
}

// ==========================================================================
// 12. SUBMIT SELECTION
// ==========================================================================

window.submitSelection = function() {
    const btn = document.getElementById('submit-btn');
    if (!btn || btn.disabled) return;

    const count = imagesData.filter(img => parseInt(img.my_selection) === 1).length;
    if (count === 0) {
        showToast(currentLang === 'de' ? 'Bitte zuerst Bilder auswählen.' : 'Please flag at least one photo first.', '#d9534f');
        return;
    }

    const msg = currentLang === 'de'
        ? `Auswahl von ${count} Bild${count !== 1 ? 'ern' : ''} einreichen?`
        : `Submit your selection of ${count} photo${count !== 1 ? 's' : ''}?`;
    if (!confirm(msg)) return;

    btn.disabled = true;
    btn.textContent = '...';

    const fd = new FormData();
    fd.append('action', 'submit_selection');
    fetch('api_selection.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') {
                updateSubmitButton(true, data.submitted_at);
                showToast(currentLang === 'de' ? '✓ Auswahl eingereicht!' : '✓ Selection submitted!', '#5cb85c');
            } else {
                btn.disabled = false;
                btn.textContent = langData[currentLang].submit_btn;
            }
        })
        .catch(() => {
            btn.disabled = false;
            btn.textContent = langData[currentLang].submit_btn;
        });
};

function updateSubmitButton(submitted, submittedAt) {
    const btn = document.getElementById('submit-btn');
    if (!btn) return;
    if (submitted) {
        let label = langData[currentLang].submitted_label || '✓ Submitted';
        if (submittedAt) {
            const d = new Date(submittedAt.replace(' ', 'T'));
            label += ' · ' + d.toLocaleDateString(currentLang === 'de' ? 'de-AT' : 'en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
        }
        btn.textContent = label;
        btn.disabled = true;
        btn.classList.add('submitted');
    }
}

// ==========================================================================
// 13. BATCH PROGRESS HELPERS
// ==========================================================================

function showProgressToast(done, total, label = "Processing") {
    const container = document.getElementById('toast-container');
    let toast = document.getElementById('batch-progress-toast');
    
    // Create the persistent toast if it doesn't exist
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'batch-progress-toast';
        toast.className = 'toast';
        toast.style.background = '#111';
        toast.style.border = '1px solid #ffd700'; // Gold border
        toast.style.boxShadow = '0 0 15px rgba(255, 215, 0, 0.2)';
        container.appendChild(toast);
    }
    
    // Update the text
    toast.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
            <div class="loader" style="border: 2px solid #333; border-top: 2px solid #ffd700; border-radius: 50%; width: 14px; height: 14px; animation: spin 1s linear infinite;"></div>
            <span style="color:#fff; font-weight:bold;">${label}</span>
            <span style="color:#ffd700; font-family:monospace;">${done} / ${total}</span>
        </div>
        <style>@keyframes spin {0% {transform: rotate(0deg);} 100% {transform: rotate(360deg);}}</style>
    `;
}

function hideProgressToast() {
    const toast = document.getElementById('batch-progress-toast');
    if (toast) {
        // Optional: Show "Done" briefly before removing
        toast.innerHTML = `<span style="color:#5cb85c; font-weight:bold;">✔ Done!</span>`;
        setTimeout(() => toast.remove(), 5000);
    }
}


function updateEditorAssignedLabels() {
    const imgObj = imagesData.find(i => i.id == currentImageId);
    if (!imgObj) return;

    const assignedColors = imgObj.color_label ? imgObj.color_label.split(',') : [];
    
    // Target selectors in the sidebar
    const selectors = document.querySelectorAll('#editor-label-selector .color-sq');

    selectors.forEach(sq => {
        const color = sq.dataset.color;
        if (assignedColors.includes(color)) {
            sq.classList.add('is-active');
        } else {
            sq.classList.remove('is-active');
        }
    });

    // Hide the redundant display container
    const oldContainer = document.getElementById('editor-image-colors');
    if (oldContainer) oldContainer.style.display = 'none';
}