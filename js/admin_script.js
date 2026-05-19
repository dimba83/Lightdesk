/**
 * ADMIN DASHBOARD SCRIPT
 * Handles gallery management, filtering, user administration, and the image editor.
 */

// ==========================================================================
// THEME
// ==========================================================================
function applyThemeToBody(theme) {
    if (theme === 'light') {
        document.body.style.setProperty('background', '#efefef', 'important');
        document.body.style.setProperty('color', '#111', 'important');
    } else {
        document.body.style.removeProperty('background');
        document.body.style.removeProperty('color');
    }
}

function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('fw_theme', next);
    applyThemeToBody(next);
    updateThemeToggle(next);
}

function updateThemeToggle(theme) {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀' : '🌙';
}

function confirmLogout() { return confirm('Log out?'); }

// ==========================================================================
// 0. TOAST NOTIFICATIONS
// ==========================================================================
function showToast(message, color) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    if (color) toast.style.borderColor = color;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ==========================================================================
// 1. GLOBAL VARIABLES & STATE
// ==========================================================================
let currentImages = [];       // Full dataset fetched from server
let visibleImages = [];       // Subset currently displayed after filtering
let selectedImageIds = new Set(); // IDs of currently selected images
let lastSelectedIndex = -1;   // Anchor for keyboard navigation/range selection

// Filter States
let filterRatingValue = 0;    // 0 = off, 1-5 = active star filter
let adminActiveColorFilters = new Set();

// Editor & Canvas
let canvas = new fabric.Canvas('c');
let currentImageId = null;    // ID of image currently open in Editor

const BORDER_COLORS = {
    red: '#c96a67', yellow: '#e0c855',
    green: '#72a872', blue: '#5b9bc4'
};


// ==========================================================================
// 2. INITIALIZATION & SETUP
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const initialTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    applyThemeToBody(initialTheme);
    updateThemeToggle(initialTheme);

    // Search Input Listener
    const searchInput = document.getElementById('admin-search');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            applyFilters();
        });
    }

    // Grid size slider
    const gridSlider = document.getElementById('admin-grid-slider');
    if (gridSlider) {
        const saved = localStorage.getItem('fw_admin_grid_size');
        if (saved) { gridSlider.value = saved; document.documentElement.style.setProperty('--admin-grid-min', saved + 'px'); }
        gridSlider.addEventListener('input', function() {
            document.documentElement.style.setProperty('--admin-grid-min', this.value + 'px');
            localStorage.setItem('fw_admin_grid_size', this.value);
        });
    }

    // Drag & Drop Setup
    setupDragAndDrop();
});

// ==========================================================================
// 3. KEYBOARD NAVIGATION & SHORTCUTS
// ==========================================================================
document.addEventListener('keydown', (e) => {
    // Ignore shortcuts if typing in an input field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const modal = document.getElementById('editor-modal');
    const isEditorOpen = modal.style.display === 'flex';

    // A. Editor Navigation (Modal is Open)
    if (isEditorOpen) {
        if (e.key === "ArrowRight") changeImage(1);
        if (e.key === "ArrowLeft") changeImage(-1);
        if (e.key === "Enter") { 
                e.preventDefault(); // Prevents clicking buttons unintentionally
                closeEditor(); 
            }}

    // B. Grid Navigation (Modal is Closed)
    if (!isEditorOpen && visibleImages.length > 0) {
        
        // Delete Shortcut
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if(selectedImageIds.size > 0) deleteSelectedImages();
            return;
        }

        // Calculate Grid Layout for Up/Down Navigation
        const grid = document.getElementById('admin-gallery-container');
        const cardWidth = 180 + 24; // approx card width + gap
        const cols = Math.floor(grid.clientWidth / cardWidth) || 1;

        let newIndex = lastSelectedIndex;
        let didMove = false;

        if (e.key === 'ArrowRight') { newIndex++; didMove = true; }
        if (e.key === 'ArrowLeft')  { newIndex--; didMove = true; }
        if (e.key === 'ArrowDown')  { newIndex += cols; didMove = true; }
        if (e.key === 'ArrowUp')    { newIndex -= cols; didMove = true; }

        if (didMove) {
            e.preventDefault();
            // Bounds Check
            if (newIndex < 0) newIndex = 0;
            if (newIndex >= visibleImages.length) newIndex = visibleImages.length - 1;

            const targetImg = visibleImages[newIndex];

            // Range Selection (Shift + Arrow)
            if (e.shiftKey) {
                let anchor = (lastSelectedIndex === -1) ? 0 : lastSelectedIndex;
                
                // Establish anchor if starting a new range
                if (typeof window.selectionAnchor === 'undefined' || !e.shiftKey) {
                    window.selectionAnchor = (lastSelectedIndex === -1) ? 0 : lastSelectedIndex;
                }
                
                const start = Math.min(window.selectionAnchor, newIndex);
                const end = Math.max(window.selectionAnchor, newIndex);
                
                selectedImageIds.clear();
                for(let i=start; i<=end; i++) {
                    selectedImageIds.add(visibleImages[i].id);
                }
                
            } else {
                // Single Selection
                window.selectionAnchor = newIndex;
                selectedImageIds.clear();
                selectedImageIds.add(targetImg.id);
            }

            lastSelectedIndex = newIndex;
            updateSelectionVisuals();
            scrollToCard(targetImg.id);
        }

        // Enter to Open Editor
        if (e.key === 'Enter') {
            e.preventDefault();
            if (lastSelectedIndex !== -1 && visibleImages[lastSelectedIndex]) {
                openEditor(visibleImages[lastSelectedIndex].id);
            }
        }
    }
});

// ==========================================================================
// 4. FILTERING LOGIC
// ==========================================================================

// Sets the global rating filter variable and updates UI
window.setFilterRating = function(val) {
    // Toggle logic: Click active star again to turn it off
    if (filterRatingValue === val) val = 0;
    
    filterRatingValue = val;
    
    // Update UI (Gold stars)
    const stars = document.querySelectorAll('#filter-stars span');
    stars.forEach(s => {
        const starVal = parseInt(s.dataset.val);
        s.classList.toggle('active', starVal <= filterRatingValue);
    });
    
    // Show/Hide the Red X reset button
    const resetBtn = document.getElementById('filter-reset');
    if(resetBtn) resetBtn.style.display = (val > 0) ? 'inline' : 'none';
    
    // Trigger Filter
    applyFilters();
};

window.adminToggleColorFilter = function(color) {
    if (color === 'all') {
        adminActiveColorFilters.clear();
    } else {
        if (adminActiveColorFilters.has(color)) {
            adminActiveColorFilters.delete(color);
        } else {
            adminActiveColorFilters.add(color);
        }
    }
    
    // Update UI squares
    document.querySelectorAll('#admin-color-filters .color-sq').forEach(sq => {
        sq.classList.toggle('active', adminActiveColorFilters.has(sq.dataset.color));
    });
    
    applyFilters();
};

// Resets all filters (Search, Stars, Colors, Dropdowns) to default
// Resets all filters (Search, Stars, Colors, Dropdowns) to default
window.resetAllAdminFilters = function() {
    // 1. Clear search
    const searchInput = document.getElementById('admin-search');
    if (searchInput) searchInput.value = '';
    
    // NEW: Uncheck Flag Filter
    const flagBox = document.getElementById('admin-filter-flagged');
    if(flagBox) flagBox.checked = false;

    // 2. Clear Stars
    const ratingOp = document.getElementById('rating-operator');
    if (ratingOp) ratingOp.value = 'ge';
    setFilterRating(0); 

    // 3. Clear Dropdowns
    const userFilter = document.getElementById('filter-user');
    if (userFilter) userFilter.value = 'all';
    
    const statusFilter = document.getElementById('filter-status');
    if (statusFilter) statusFilter.value = 'all';

    // 4. Hide sub-user delete button
    toggleSubUserDelete();

    // 5. Clear Colors & Reload
    adminToggleColorFilter('all');
    reloadGallery();
};

// Main Filter Function: Combines Search, Flag, Rating, and Color logic
window.applyFilters = function() {
    const term = document.getElementById('admin-search').value.toLowerCase();
    const container = document.getElementById('admin-gallery-container');
    const operator = document.getElementById('rating-operator').value; 
    const ratingValue = filterRatingValue;
    
    // NEW: Get Checkbox State
    const showFlaggedOnly = document.getElementById('admin-filter-flagged')?.checked || false;

    visibleImages = currentImages.filter(img => {
        // A. Search
        if (!img.file_name.toLowerCase().includes(term)) return false;

        // B. NEW: Flag Filter
        if (showFlaggedOnly && parseInt(img.yes_count) === 0) return false;

        // C. Multi-Color Filter (Admin) - OR LOGIC (Modified to .some)
        if (adminActiveColorFilters.size > 0) {
            const imgColors = img.color_label ? img.color_label.split(',') : [];
            // Changed from .every() to .some() -> Checks if image has ANY of the selected colors
            const hasAny = Array.from(adminActiveColorFilters).some(c => imgColors.includes(c));
            if (!hasAny) return false;
        }

        // D. Rating
        if (ratingValue > 0) {
            const imgRating = parseInt(img.total_stars) || 0;
            if (operator === 'ge' && imgRating < ratingValue) return false;
            if (operator === 'le' && imgRating > ratingValue) return false;
            if (operator === 'eq' && imgRating !== ratingValue) return false;
        }
        return true;
    });

    // Render Logic
    container.innerHTML = '';
    if (visibleImages.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1; color:#666; text-align:center;">No matching images found.</p>';
        return;
    }

    visibleImages.forEach((img, index) => {
        const card = document.createElement('div');
        card.className = 'admin-img-card';
        card.id = `admin-card-${img.id}`;
        card.dataset.id = img.id;
        if (selectedImageIds.has(img.id)) card.classList.add('selected');

        let badges = '';
        if (img.total_stars > 0) badges += `<span class="badge">★ ${img.total_stars}</span>`;
        if (img.yes_count > 0) badges += `<span class="badge flagged">🚩</span>`;
        if (img.rater_count > 0) badges += `<span class="badge multi-user">👤 ${img.rater_count}</span>`;
        if (img.comment_count > 0) badges += `<span class="badge" style="background:#444; color:#fff;">💬 ${img.comment_count}</span>`;
        if (img.total_scribbles > 0) badges += `<div class="badge scribbled">✎</div>`;

        card.innerHTML = `
            <div class="color-picker-overlay"></div>
            <img src="uploads/${img.username}/${img.file_name}" loading="lazy">
            <div class="select-handle"></div>
            <button class="btn-delete-img" onclick="deleteImage(${img.id}, event)" title="Delete">&times;</button>
            <div class="card-meta"><div class="meta-badges">${badges}</div></div>
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
        card.appendChild(label);

        // Events
        card.onclick = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            if (e.detail > 1) return;
            handleSelectionClick(img.id, index, e);
        };
        card.ondblclick = () => { openEditor(img.id); };

        container.appendChild(card);
    });
};

// ==========================================================================
// 5. SELECTION LOGIC
// ==========================================================================

// Handles clicks on grid items (Single, Shift+Click, Ctrl+Click)
function handleSelectionClick(id, index, event) {
    // Reset anchor if Shift not held
    if (!event.shiftKey) window.selectionAnchor = index;

    if (event.shiftKey && lastSelectedIndex !== -1) {
        // Range Select
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        
        if (!event.ctrlKey && !event.metaKey) selectedImageIds.clear();

        for (let i = start; i <= end; i++) {
            selectedImageIds.add(visibleImages[i].id);
        }
    } else if (event.ctrlKey || event.metaKey) {
        // Toggle Select
        if (selectedImageIds.has(id)) selectedImageIds.delete(id);
        else selectedImageIds.add(id);
        lastSelectedIndex = index;
    } else {
        // Single Select
        selectedImageIds.clear();
        selectedImageIds.add(id);
        lastSelectedIndex = index;
    }
    updateSelectionVisuals();
}

// Updates CSS classes and toolbar buttons based on selection state
function updateSelectionVisuals() {
    // 1. Update Card Classes
    const cards = document.querySelectorAll('.admin-img-card');
    cards.forEach(card => {
        const id = parseInt(card.dataset.id);
        if (selectedImageIds.has(id)) card.classList.add('selected');
        else card.classList.remove('selected');
        
        // Focus indicator
        if (lastSelectedIndex !== -1 && visibleImages[lastSelectedIndex] && id === visibleImages[lastSelectedIndex].id) {
            card.classList.add('last-active');
        } else {
            card.classList.remove('last-active');
        }
    });

    // 2. Update Delete Button in Toolbar
    const count = selectedImageIds.size;
    const btn = document.getElementById('btn-delete-selected');
    const countSpan = document.getElementById('selected-count');
    
    if (countSpan) countSpan.innerText = count;
    
    if (btn) {
        if (count > 0) btn.style.display = 'inline-block';
        else btn.style.display = 'none';
    }
}

// Scrolls the view to a specific card
function scrollToCard(id) {
    const card = document.getElementById(`admin-card-${id}`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ==========================================================================
// 6. API & DATA FETCHING
// ==========================================================================

// Trigger a reload based on current client dropdown
function reloadGallery() {
    const userId = document.getElementById('client-select').value;
    if(userId && userId !== "") {
        loadClientImages(userId);
    }
}

// Fetches images from API and populates global state
function loadClientImages(userId) {
    const container = document.getElementById('admin-gallery-container');
    
    const sortMode = document.getElementById('sort-select').value;
    const filterUser = document.getElementById('filter-user').value;
    const filterStatus = document.getElementById('filter-status').value;

    const fd = new FormData();
    fd.append('action', 'fetch_images');
    fd.append('filter_user_id', userId);
    fd.append('sort', sortMode);
    fd.append('filter_user', filterUser);
    fd.append('filter_status', filterStatus);

    fetch('api_selection.php', { method: 'POST', body: fd })
        .then(r => {
            if(!r.ok) throw new Error("Network response was not ok");
            return r.json();
        })
        .then(images => {
            if (Array.isArray(images)) {
                currentImages = images;
                selectedImageIds.clear(); 
                updateSelectionVisuals();
                applyFilters(); // Re-apply local filters (Search, Stars, etc.)
            } else {
                 console.error("Invalid data format", images);
            }
        })
        .catch(e => {
            console.error(e);
            container.innerHTML = '<p style="grid-column: 1/-1; color:#d9534f; text-align:center;">Error loading images. Please refresh.</p>';
        });
}

// Sets a color label via API (Admin override with Toggle Logic)
window.setColor = function(id, color, event) {
    if (event) event.stopPropagation();
    
    // 1. FALLBACK: Wenn Klick aus Sidebar (id ist null), nimm aktuelles Editor Bild
    if (!id) id = currentImageId;
    if (!id) return;

    const img = currentImages.find(i => i.id == id);
    if (img) {
        let currentColors = img.color_label ? img.color_label.split(',').filter(c => c.length > 0) : [];
        
        if (!color) {
            // "X" geklickt -> Alles löschen
            img.color_label = "";
        } else {
            // Toggle Logik: Rein oder Raus
            const index = currentColors.indexOf(color);
            if (index > -1) {
                currentColors.splice(index, 1);
            } else {
                currentColors.push(color);
            }
            img.color_label = currentColors.join(',');
        }
    }

    // 2. UI Updates (Sofort)
    applyFilters(); // Grid aktualisieren
    
    // Wenn Editor offen ist, Sidebar & Border sofort updaten
    if (document.getElementById('editor-modal').style.display === 'flex' && id == currentImageId) {
        updateEditorAssignedLabels();
        if (img) updateCanvasBorder(img.color_label);
    }

    // 3. API Request (Speichern)
    const fd = new FormData();
    fd.append('action', 'set_color_label');
    fd.append('image_id', id);
    fd.append('color', color || ''); // PHP übernimmt auch das Mergen, aber wir senden den Trigger

    fetch('api_selection.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(res => {
            if(res.status === 'success') {
                if(img) img.color_label = res.new_colors;
                // Sicherstellen, dass alles synchron ist
                if (id == currentImageId) {
                    updateEditorAssignedLabels();
                    updateCanvasBorder(res.new_colors);
                }
            }
        });
};


// ==========================================================================
// 7. DELETE FUNCTIONS
// ==========================================================================

// Single Image Delete
function deleteImage(imgId, event) {
    if (event) event.stopPropagation();
    if (!confirm("Delete this image permanently?")) return;

    const fd = new FormData();
    fd.append('action', 'delete_image');
    fd.append('image_id', imgId);
    fetch('api_selection.php', { method: 'POST', body: fd }).then(() => reloadGallery());
}

// Batch Delete
function deleteSelectedImages() {
    const count = selectedImageIds.size;
    if (count === 0) return;
    
    if (!confirm(`WARNING: You are about to DELETE ${count} images permanently.\nThis cannot be undone.\n\nContinue?`)) return;

    const ids = Array.from(selectedImageIds);
    document.getElementById('btn-delete-selected').innerText = "Deleting...";

    const deleteOne = (id) => {
        const fd = new FormData();
        fd.append('action', 'delete_image');
        fd.append('image_id', id);
        return fetch('api_selection.php', { method: 'POST', body: fd });
    };

    Promise.all(ids.map(id => deleteOne(id)))
        .then(() => {
            selectedImageIds.clear();
            reloadGallery();
            showToast(`Deleted ${count} images.`, '#5cb85c');
        })
        .catch(err => {
            showToast('Error deleting some images.', '#d9534f');
            reloadGallery();
        });
}

// Batch Delete All Images for Client
function deleteAllImages() {
    const userId = document.getElementById('client-select').value;
    if (!userId) return;

    if (!confirm("WARNING: Delete ALL images for this client?\nThis will process in batches to prevent timeouts.")) return;
    
    // Lock the interface
    const btn = document.querySelector('button[onclick="deleteAllImages()"]');
    const originalText = btn.innerText;
    btn.disabled = true;

    // Recursive function to process batches
    function processBatch() {
        btn.innerText = "Deleting... (Processing)";
        
        const fd = new FormData();
        fd.append('action', 'delete_all_images');
        fd.append('target_user_id', userId);
        fd.append('limit', 50); // Delete 50 images per request

        fetch('api_selection.php', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(data => {
                if (data.status === 'success') {
                    if (data.remaining > 0) {
                        // Still images left, run again
                        btn.innerText = `Deleting... (${data.remaining} remaining)`;
                        processBatch(); 
                    } else {
                        // All done
                        btn.innerText = originalText;
                        btn.disabled = false;
                        showToast('All images deleted.', '#5cb85c');
                        reloadGallery();
                    }
                } else {
                    showToast('Error: ' + (data.message || 'Unknown error'), '#d9534f');
                    btn.innerText = originalText;
                    btn.disabled = false;
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Connection lost. Please try again.', '#d9534f');
                btn.innerText = originalText;
                btn.disabled = false;
            });
    }

    // Start the process
    processBatch();
}

// ==========================================================================
// 8. ADMIN MANAGEMENT (CLIENTS & SUB-USERS)
// ==========================================================================

// Client Dropdown Change Listener
const clientSelect = document.getElementById('client-select');
if(clientSelect) {
    clientSelect.addEventListener('change', function() {
        if (this.value) {
            document.getElementById('management-area').style.display = 'block';
            const opt = this.options[this.selectedIndex];
            updateSubmittedState(opt.dataset.submitted === '1', opt.dataset.submittedAt || '');
            const qi = document.getElementById('quota-input');
            if (qi) qi.value = parseInt(opt.dataset.quota) > 0 ? opt.dataset.quota : '';
            const dlToggle = document.getElementById('allow-download-toggle');
            const dlLabel  = document.getElementById('download-toggle-label');
            if (dlToggle) {
                dlToggle.checked = opt.dataset.allowDownload === '1';
                if (dlLabel) dlLabel.textContent = dlToggle.checked ? 'On' : 'Off';
                dlLabel.style.color = dlToggle.checked ? '#5cb85c' : '#666';
            }
            loadSubUsersForFilter(this.value);
            reloadGallery();
        } else {
            document.getElementById('management-area').style.display = 'none';
            updateSubmittedState(false, '');
            const qi = document.getElementById('quota-input');
            if (qi) qi.value = '';
        }
    });
}

function setAllowDownload(allowed) {
    const userId = document.getElementById('client-select').value;
    if (!userId) return;
    const label = document.getElementById('download-toggle-label');
    const fd = new FormData();
    fd.append('action', 'set_allow_download');
    fd.append('target_user_id', userId);
    fd.append('allow', allowed ? '1' : '0');
    fetch('api_selection.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') {
                if (label) { label.textContent = allowed ? 'On' : 'Off'; label.style.color = allowed ? '#5cb85c' : '#666'; }
                const opt = document.getElementById('client-select').options[document.getElementById('client-select').selectedIndex];
                opt.dataset.allowDownload = allowed ? '1' : '0';
                showToast(allowed ? 'Downloads enabled for client.' : 'Downloads disabled.', allowed ? '#5cb85c' : '#aaa');
            }
        });
}

function exportZip() {
    const userId = document.getElementById('client-select').value;
    if (!userId) { showToast('Select a client first.', '#d9534f'); return; }

    showToast('Preparing ZIP…', '#ffd700');

    fetch('export_zip.php?client_id=' + userId)
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => { throw new Error(text.trim()); });
            }
            // Extract filename from Content-Disposition header
            const disposition = response.headers.get('Content-Disposition') || '';
            const match = disposition.match(/filename="?([^"]+)"?/);
            const filename = match ? match[1] : 'selection.zip';
            return response.blob().then(blob => ({ blob, filename }));
        })
        .then(({ blob, filename }) => {
            const url = URL.createObjectURL(blob);
            const a   = document.createElement('a');
            a.href     = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        })
        .catch(err => {
            const modal = document.getElementById('error-modal');
            const msg   = document.getElementById('error-modal-msg');
            if (modal && msg) { msg.textContent = err.message; modal.style.display = 'flex'; }
        });
}

function refreshClientStats() {
    const btn = document.getElementById('stats-refresh-btn');
    if (btn) { btn.disabled = true; btn.textContent = '↻ ...'; }
    const fd = new FormData(); fd.append('action', 'fetch_client_stats');
    fetch('api_selection.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(stats => {
            if (!Array.isArray(stats)) return;
            const tbody = document.querySelector('#client-stats-table tbody');
            if (tbody) {
                tbody.innerHTML = stats.map(s => {
                    const selColor = s.quota_met ? '#5cb85c' : (s.quota_over ? '#d9534f' : '');
                    const selStr   = s.selected_count + (s.selection_quota ? ' / ' + s.selection_quota : '');
                    const submStr  = s.submitted_at
                        ? `<span style="color:#5cb85c">✓</span> <span style="color:#666;font-size:0.75rem;">${s.submitted_at.substring(0,10)}</span>`
                        : `<span style="color:#444">—</span>`;
                    return `<tr>
                        <td style="color:#ffd700;font-weight:bold;">${s.username}</td>
                        <td style="text-align:center;color:#aaa;">${s.photo_count}</td>
                        <td style="text-align:center;${selColor ? 'color:' + selColor + ';' : ''}font-weight:bold;">${selStr}</td>
                        <td style="text-align:center;color:#666;">${s.selection_quota || '—'}</td>
                        <td style="text-align:center;">${submStr}</td>
                        <td class="timestamp">${s.last_active ? s.last_active.substring(0,16) : '—'}</td>
                        <td class="timestamp">${s.last_login ? s.last_login.substring(0,16) : '—'}</td>
                    </tr>`;
                }).join('');
            }
            if (btn) { btn.disabled = false; btn.textContent = '↻ Refresh'; }
            showToast('Stats refreshed.', '#5cb85c');
        })
        .catch(() => { if (btn) { btn.disabled = false; btn.textContent = '↻ Refresh'; } });
}

function saveQuota() {
    const userId = document.getElementById('client-select').value;
    const quotaInput = document.getElementById('quota-input');
    const statusEl   = document.getElementById('quota-status');
    if (!userId || !quotaInput) return;

    const fd = new FormData();
    fd.append('action', 'set_quota');
    fd.append('target_user_id', userId);
    fd.append('quota', quotaInput.value);

    fetch('api_selection.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') {
                const opt = document.getElementById('client-select').options[document.getElementById('client-select').selectedIndex];
                opt.dataset.quota = data.quota || 0;
                if (statusEl) { statusEl.textContent = '✓ Saved'; setTimeout(() => { statusEl.textContent = ''; }, 2000); }
            }
        });
}

function updateSubmittedState(submitted, submittedAt) {
    const banner = document.getElementById('submitted-banner');
    const dateEl = document.getElementById('submitted-date');
    if (!banner) return;
    if (submitted) {
        banner.style.display = 'flex';
        if (dateEl && submittedAt) {
            const d = new Date(submittedAt.replace(' ', 'T'));
            dateEl.textContent = d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } else if (dateEl) {
            dateEl.textContent = '';
        }
    } else {
        banner.style.display = 'none';
    }
}

function unsubmitClient() {
    const userId = document.getElementById('client-select').value;
    if (!userId || !confirm('Reset this client\'s submission status?')) return;

    const fd = new FormData();
    fd.append('action', 'unsubmit_selection');
    fd.append('target_user_id', userId);
    fetch('api_selection.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') {
                updateSubmittedState(false, '');
                // Update the dropdown option's data attributes
                const opt = document.getElementById('client-select').options[document.getElementById('client-select').selectedIndex];
                opt.dataset.submitted = '0';
                opt.dataset.submittedAt = '';
                opt.text = opt.text.replace(' ✓', '');
            }
        });
}

// Create New Client User
const createUserForm = document.getElementById('create-user-form');
if(createUserForm) {
    createUserForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const fd = new FormData();
        fd.append('action', 'create_user');
        fd.append('username', document.getElementById('new-username').value);
        fd.append('password', document.getElementById('new-password').value);
        fetch('api_selection.php', { method: 'POST', body: fd })
            .then(r => r.json()).then(data => {
                if(data.status === 'success') { showToast('Client created!', '#5cb85c'); setTimeout(() => location.reload(), 1000); }
                else showToast('Error: ' + data.message, '#d9534f');
            });
    });
}

// Fetch Sub-users for Filter Dropdown
function loadSubUsersForFilter(clientId) {
    const fd = new FormData();
    fd.append('action', 'fetch_subusers');
    fd.append('target_user_id', clientId);
    fetch('api_selection.php', { method: 'POST', body: fd })
        .then(r => r.json()).then(names => {
            const dropdown = document.getElementById('filter-user');
            // Remove old options except "All Users"
            while (dropdown.options.length > 1) dropdown.remove(1);
            
            names.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name; opt.innerText = name;
                dropdown.appendChild(opt);
            });
            document.getElementById('btn-del-subuser').style.display = 'none';
        });
}

// Toggle Sub-user Delete Button Visibility
function toggleSubUserDelete() {
    const val = document.getElementById('filter-user').value;
    document.getElementById('btn-del-subuser').style.display = (val !== 'all' && val !== '') ? 'inline-block' : 'none';
}

// Delete a Sub-user's Data
function deleteSubUser() {
    const subUser = document.getElementById('filter-user').value;
    if (!confirm(`Delete all ratings/comments from "${subUser}"?`)) return;
    const fd = new FormData();
    fd.append('action', 'delete_subuser');
    fd.append('target_user_id', document.getElementById('client-select').value);
    fd.append('sub_user_name', subUser);
    fetch('api_selection.php', { method: 'POST', body: fd }).then(() => {
        loadSubUsersForFilter(document.getElementById('client-select').value);
        reloadGallery();
    });
}

// ==========================================================================
// 9. EDITOR & CANVAS FUNCTIONS
// ==========================================================================

function openEditor(id) {
    currentImageId = id;
    const idx = currentImages.findIndex(i => i.id == id);
    if (idx === -1) return;
    
    // UI: Hide arrows if at ends of list
    document.getElementById('admin-nav-prev').style.display = (idx === 0) ? 'none' : 'block';
    document.getElementById('admin-nav-next').style.display = (idx === currentImages.length - 1) ? 'none' : 'block';

    const imgObj = currentImages[idx];
    document.getElementById('editor-modal').style.display = 'flex';
    document.getElementById('editor-filename-display').innerText = imgObj.file_name;

	updateEditorAssignedLabels();
	
    // Fetch Details & Interactions
    const fd = new FormData();
    fd.append('action', 'fetch_image_details');
    fd.append('image_id', id);

    fetch('api_selection.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(data => {
            // Build Interaction List (Sidebar)
            const list = document.getElementById('user-details-list');
            list.innerHTML = '';
            let allScribbles = [];

            if (data.interactions && data.interactions.length > 0) {
                data.interactions.forEach(i => {
                    const item = document.createElement('div');
                    item.style.cssText = "background:#222; padding:10px; border-radius:4px; border:1px solid #333; margin-bottom:10px;";
                    
                    // --- NEW: GENERATE READ-ONLY COLOR BADGES ---
                    // This checks if this specific user has saved colors (requires 'color_label' in DB table 'image_interactions')
                    let colorBadges = '';
                    if (i.color_label && i.color_label.length > 0) {
                        const cList = i.color_label.split(',').filter(x => x);
                        if (cList.length > 0) {
                             colorBadges += `<div style="margin-top:8px; border-top:1px solid #333; padding-top:5px;">`;
                             colorBadges += `<span style="color:#666; font-size:0.7rem; text-transform:uppercase;">Assigned Colors:</span>`;
                             colorBadges += `<div style="display:flex; gap:4px; margin-top:2px;">`;
                             cList.forEach(c => {
                                 // Read-only small squares
                                 colorBadges += `<div class="color-sq sq-${c}" style="width:14px; height:14px; border:1px solid #555; cursor:default;" title="${c}"></div>`;
                             });
                             colorBadges += `</div></div>`;
                        }
                    }
                    // ---------------------------------------------

                    // Build the HTML
                    item.innerHTML = `
                        <div style="font-weight:bold; color:#fff; border-bottom:1px solid #444; padding-bottom:5px; margin-bottom:5px;">${i.sub_user_name}</div>
                        <div style="color:#ffd700; font-size:0.9rem;">Rating: ${'★'.repeat(i.rating) || '0'}</div>
                        <div style="color:${i.is_selected == 1 ? '#d9534f' : '#666'}; font-size:0.9rem;">Selected: ${i.is_selected == 1 ? 'YES 🚩' : 'No'}</div>
                        
                        ${colorBadges}
                        
                        ${i.comment ? `<div style="margin-top:5px; font-size:0.85rem; color:#aaa; font-style:italic; border-top:1px solid #333; padding-top:4px;">"${i.comment}"</div>` : ''}
                    `;
                    list.appendChild(item);

                    if (i.scribble_data) {
                        try {
                            const parsed = JSON.parse(i.scribble_data);
                            if (parsed.objects && parsed.objects.length > 0) allScribbles.push(parsed);
                        } catch (e) {}
                    }
                });
            } else {
                list.innerHTML = '<p style="color:#666;">No interactions yet.</p>';
            }

            // Load Canvas
            canvas.clear();
				fabric.Image.fromURL(`uploads/${imgObj.username}/${imgObj.file_name}`, function(oImg) {
                const wrapper = document.querySelector('.editor-canvas-area');
                const scale = Math.min((wrapper.clientWidth - 40) / oImg.width, (wrapper.clientHeight - 40) / oImg.height);
                oImg.scale(scale);
                canvas.setWidth(oImg.getScaledWidth());
                canvas.setHeight(oImg.getScaledHeight());
                canvas.setBackgroundImage(oImg, canvas.renderAll.bind(canvas));
				
				// Apply border to canvas wrapper
				const currentImgObj = currentImages.find(i => i.id == currentImageId);
                if (currentImgObj) {
                    updateCanvasBorder(currentImgObj.color_label);
                }

			    // Overlay Scribbles
                allScribbles.forEach(scribbleData => {
                    if (!scribbleData || !scribbleData.objects) return;
                    fabric.util.enlivenObjects(scribbleData.objects, function(enlivenedObjects) {
                        enlivenedObjects.forEach(function(obj) {
                            if (obj.type === 'text') return;
                            obj.scaleX *= scale;
                            obj.scaleY *= scale;
                            obj.left *= scale;
                            obj.top *= scale;
                            obj.selectable = false;
                            obj.evented = false;
                            canvas.add(obj);
                            canvas.add(new fabric.Text(obj.owner || 'Unknown', {
                                fontSize: 14, fontFamily: 'Inter', fill: '#fff',
                                backgroundColor: 'rgba(0,0,0,0.7)',
                                left: obj.left, top: obj.top - 20,
                                selectable: false, evented: false
                            }));
                        });
                        canvas.renderAll();
                    }, null, function(jsonObj, fabricObj) {
                        if (jsonObj.owner) fabricObj.owner = jsonObj.owner;
                    });
                });
            });
        });
}

function changeImage(dir) {
    const idx = currentImages.findIndex(i => i.id == currentImageId);
    if (idx === -1) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= currentImages.length) return;
    openEditor(currentImages[newIdx].id);
}

function closeEditor() {
    document.getElementById('editor-modal').style.display = 'none';
	document.body.style.overflow = '';
    if(currentImageId) {
        scrollToCard(currentImageId);
    }
}

// ==========================================================================
// 10. MODAL HELPERS (HELP & PASSWORD)
// ==========================================================================

function openHelpModal() { document.getElementById('help-modal').style.display = 'flex'; }
function closeHelpModal() { document.getElementById('help-modal').style.display = 'none'; }

// ==========================================================================
// ADMIN PASSWORD CHANGE
// ==========================================================================

function openPassModal() {
    document.getElementById('pass-modal').style.display = 'flex';
}

function closePassModal() {
    document.getElementById('pass-modal').style.display = 'none';
    document.getElementById('pass-form').reset();
    const msg = document.getElementById('pass-msg');
    if (msg) { msg.innerText = ''; msg.style.display = 'none'; }
}

const passForm = document.getElementById('pass-form');
if (passForm) {
    passForm.addEventListener('submit', function(e) {
        e.preventDefault();

        const oldPass = document.getElementById('old-pass').value;
        const newPass = document.getElementById('new-pass').value;
        const btn     = this.querySelector('button[type="submit"]');
        const msg     = document.getElementById('pass-msg');

        if (!newPass) { msg.innerText = 'Please enter a new password.'; msg.style.display = 'block'; return; }

        btn.innerText = 'Saving...';
        btn.disabled  = true;

        const fd = new FormData();
        fd.append('action',       'change_password');
        fd.append('old_password', oldPass);
        fd.append('new_password', newPass);

        fetch('api_selection.php', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(data => {
                btn.innerText = 'Update Password';
                btn.disabled  = false;
                if (data.status === 'success') {
                    msg.style.color   = '#5cb85c';
                    msg.innerText     = 'Password updated successfully.';
                    msg.style.display = 'block';
                    this.reset();
                } else {
                    msg.style.color   = '#d9534f';
                    msg.innerText     = 'Incorrect current password.';
                    msg.style.display = 'block';
                }
            })
            .catch(() => {
                btn.innerText = 'Update Password';
                btn.disabled  = false;
                msg.style.color   = '#d9534f';
                msg.innerText     = 'Connection error. Please try again.';
                msg.style.display = 'block';
            });
    });
}



// ==========================================================================
// 11. EXPORT & UPLOAD UTILS
// ==========================================================================

// Export List to CSV/TXT
function exportSelection(type) {
    const selected = currentImages.filter(img => img.yes_count > 0);
    if (selected.length === 0) { showToast('No images with YES flag.', '#d9534f'); return; }
    let content = (type === 'txt') ? "SELECTED IMAGES:\n" : "File Name,Stars,Yes Count,Users\n";
    selected.forEach(img => {
        if(type === 'txt') content += img.file_name + "\n";
        else content += `"${img.file_name}",${img.total_stars},${img.yes_count > 0 ? 'Yes' : 'No'},${img.rater_count}\n`;
    });
    const blob = new Blob([content], { type: type === 'csv' ? "text/csv" : "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const name = document.getElementById('client-select').options[document.getElementById('client-select').selectedIndex].text;
    a.download = `Selection_${name}.${type}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// Setup Drag & Drop Listeners
function setupDragAndDrop() {
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    
    if(dropArea && fileInput) {
        dropArea.onclick = () => fileInput.click();
        dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('drag-active'); });
        dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag-active'));
        dropArea.addEventListener('drop', (e) => {
            e.preventDefault(); dropArea.classList.remove('drag-active');
            handleFiles(e.dataTransfer.files);
        });
        fileInput.addEventListener('change', () => handleFiles(fileInput.files));
    }
}

// ==========================================================================
// ULTIMATE ROBUST UPLOADER (ANTI-CRASH)
// ==========================================================================

async function handleFiles(files) {
    const statusContainer = document.getElementById('upload-status');
    const fileArray = Array.from(files);
    const total = fileArray.length;
    
    if (total === 0) return;

    // 1. UI Setup
    statusContainer.innerHTML = `
        <div style="margin-bottom:8px; font-weight:bold; color:#fff; display:flex; justify-content:space-between;">
            <span id="upload-msg">Uploading...</span>
            <span><span id="upload-count">0</span> / ${total}</span>
        </div>
        <div style="width:100%; background:#222; height:12px; border-radius:6px; overflow:hidden; border:1px solid #444;">
            <div id="upload-bar" style="width:0%; height:100%; background:#00aaff; transition:width 0.2s ease;"></div>
        </div>
        <div id="upload-errors" style="color:#d9534f; font-size:0.8rem; margin-top:5px; display:none; max-height:100px; overflow-y:auto;"></div>
    `;

    const countSpan = document.getElementById('upload-count');
    const bar = document.getElementById('upload-bar');
    const msgSpan = document.getElementById('upload-msg');
    const errorDiv = document.getElementById('upload-errors');
    const userId = document.getElementById('client-select').value;
    
    let completed = 0;
    
    // 2. The Smart Retry Function
    const uploadWithRetry = async (file, attempt = 1) => {
        const fd = new FormData();
        fd.append('action', 'upload');
        fd.append('image', file);
        fd.append('target_user_id', userId);

        try {
            const response = await fetch('api_selection.php', { method: 'POST', body: fd });
            
            // A. HANDLE SERVER BLOCK (503 Service Unavailable)
            if (response.status === 503 || response.status === 429) {
                if (attempt > 4) throw new Error("Server blocked connection (Max retries reached)");
                
                // Progressive Backoff: Wait 5s, then 10s, then 20s
                const waitTime = attempt * 5000; 
                
                msgSpan.innerHTML = `<span style="color:#ffd700;">⚠ Server Busy. Pausing ${waitTime/1000}s... (Retry ${attempt})</span>`;
                
                // Pause execution here
                await new Promise(r => setTimeout(r, waitTime));
                
                msgSpan.innerText = "Resuming...";
                return await uploadWithRetry(file, attempt + 1);
            }

            // B. HANDLE OTHER HTTP ERRORS (Like 404, 500)
            if (!response.ok) {
                throw new Error(`Server Error: ${response.status} ${response.statusText}`);
            }

            // C. PARSE JSON (Only if response was OK)
            // This prevents the "Unexpected token <" error
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.message || 'Unknown API error');

            return true; // Success

        } catch (err) {
            console.error(`Failed ${file.name}:`, err);
            errorDiv.style.display = 'block';
            errorDiv.innerHTML = `<div>❌ ${file.name}: ${err.message}</div>` + errorDiv.innerHTML;
            return false;
        }
    };

    // 3. Process Queue (Strictly One-by-One)
    for (const file of fileArray) {
        // Small breathing room between successful uploads (200ms)
        if (completed > 0) await new Promise(r => setTimeout(r, 200));

        await uploadWithRetry(file);
        
        completed++;
        countSpan.innerText = completed;
        bar.style.width = Math.round((completed / total) * 100) + "%";
    }

    // 4. Cleanup
    setTimeout(() => {
        const hasErrors = errorDiv.style.display === 'block';
        const msg = hasErrors ? "Completed with errors." : "✔ Upload Complete!";
        const color = hasErrors ? "#ffd700" : "#5cb85c";

        msgSpan.innerHTML = `<span style="color:${color}">${msg}</span>`;
        
        reloadGallery();
        
        if (!hasErrors) {
            setTimeout(() => { statusContainer.innerHTML = ""; }, 4000);
        }
    }, 1000);
}

// ==========================================================================
// 12. DELETE CLIENT ACCOUNT
// ==========================================================================

function deleteClientAccount() {
    const select = document.getElementById('client-select');
    const userId = select.value;
    
    // Safety: Ensure a user is actually selected
    if (!userId || userId === "") {
        showToast('Please select a client first.', '#d9534f');
        return;
    }

    const username = select.options[select.selectedIndex].text;

    // Safety: Double Confirmation
    if (!confirm(`DANGER: You are about to delete the user "${username}".\n\n- All uploaded photos will be deleted.\n- All ratings and comments will be lost.\n\nThis cannot be undone.`)) return;
    
    if (!confirm(`Are you absolutely certain you want to delete "${username}"?`)) return;

    // Send Request
    const fd = new FormData();
    fd.append('action', 'delete_client_account');
    fd.append('user_id', userId);

    fetch('api_selection.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') {
                showToast(`Client "${username}" deleted.`, '#5cb85c');
                setTimeout(() => location.reload(), 1000);
            } else {
                showToast('Error: ' + (data.message || 'Unknown error'), '#d9534f');
            }
        })
        .catch(err => {
            console.error(err);
            showToast('Request failed. Check console.', '#d9534f');
        });
}

// NEW ROBUST BORDER FUNCTION (Multi-Color Support)
function updateCanvasBorder(colorString) {
    const wrapper = document.querySelector('.editor-canvas-area');
    if (!wrapper) return;

    // Reset styles
    let borderLayer = wrapper.querySelector('.custom-border-layer');
    if (!borderLayer) {
        borderLayer = document.createElement('div');
        borderLayer.className = 'custom-border-layer';
        Object.assign(borderLayer.style, {
            position: 'absolute',
            top: '-10px', left: '-10px', right: '-10px', bottom: '-10px',
            zIndex: '0', borderRadius: '4px', pointerEvents: 'none'
        });
        wrapper.insertBefore(borderLayer, wrapper.firstChild);
    }

    const colors = colorString ? colorString.split(',').filter(c => c && BORDER_COLORS[c]) : [];

    if (colors.length === 0) {
        borderLayer.style.display = 'none';
        return;
    }

    borderLayer.style.display = 'block';

    if (colors.length === 1) {
        const c = BORDER_COLORS[colors[0]];
        borderLayer.style.background = c;
        borderLayer.style.boxShadow = `0 0 20px ${c}40`;
    } else {
        const stops = [];
        const step = 100 / colors.length;
        
        // HIER WAR DER FEHLER: Achten Sie auf das "=>"
        colors.forEach((c, i) => {
            const hex = BORDER_COLORS[c];
            stops.push(`${hex} ${i * step}%`);
            stops.push(`${hex} ${(i + 1) * step}%`);
        });
        
        borderLayer.style.background = `conic-gradient(${stops.join(', ')})`;
        borderLayer.style.boxShadow = 'none'; 
    }
}

// Helper: Updates the "Assigned Labels" display in the Admin Sidebar
function updateEditorAssignedLabels() {
    const colorsContainer = document.getElementById('editor-image-colors');
    // Admin uses 'currentImages', not 'imagesData'
    const imgObj = currentImages.find(i => i.id == currentImageId);
    
    if (colorsContainer && imgObj) {
        if (imgObj.color_label && imgObj.color_label.length > 0) {
            const currentColors = imgObj.color_label.split(',').filter(c => c);
            
            if (currentColors.length > 0) {
                let html = '<label style="color:#aaa; font-size:0.8rem; text-transform:uppercase; display:block; margin-bottom:5px;">Assigned Labels:</label>';
                html += '<div style="display:flex; gap:5px;">';
                
                currentColors.forEach(color => {
                    html += `<div class="color-sq sq-${color}" style="width:16px; height:16px; cursor:default; border:1px solid #555;"></div>`;
                });
                
                html += '</div>';
                colorsContainer.innerHTML = html;
                colorsContainer.style.display = 'block';
                return;
            }
        }
        // Hide if no colors
        colorsContainer.style.display = 'none';
    }
}