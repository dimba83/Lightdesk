<?php
session_start();

if (!isset($_SESSION['user_id'])) {
    header("Location: login.php");
    exit;
}

require 'db_connect.php';
$isSubmitted = false;
$userSubmittedAt = '';
$selectionQuota = 0;
try {
    $stmt = $pdo->prepare("SELECT submitted_at, selection_quota, allow_download FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $userSubmittedAt = $row['submitted_at'] ?? '';
    $isSubmitted     = !empty($userSubmittedAt);
    $selectionQuota  = (int)($row['selection_quota'] ?? 0);
    $allowDownload   = (int)($row['allow_download'] ?? 0);
} catch (PDOException $e) { /* columns not yet added — run the ALTER TABLE statements */ }
?>
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Client Selection | <?= htmlspecialchars(BRAND_NAME) ?></title>
    <script>(function(){var t=localStorage.getItem('fw_theme')||'dark';document.documentElement.setAttribute('data-theme',t);if(t==='light'){document.write('<style>body{background:#efefef!important;color:#111!important}<\/style>');}})();</script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Oswald:wght@300;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/client_style.css?v=<?= filemtime(__DIR__ . '/css/client_style.css') ?>">
    
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js"></script>
</head>
<body>

    <div id="login-modal">
        <div class="login-card">
            <h2>Who are you?</h2>
            <div id="existing-names" style="margin-bottom: 1rem;"></div>
            <div style="margin:15px 0; color:#666;">- OR -</div>
            <input type="text" id="new-subuser-name" placeholder="Enter your Name" style="width:100%; padding:10px; margin-bottom:10px; background:#000; color:#fff; border:1px solid #444;">
            <button onclick="setSubUser()" style="width:100%; cursor:pointer; background:#fff; color:#000; padding:10px; font-weight:bold;">Start Selecting</button>
        </div>
    </div>

   <div class="selection-header">

        <div class="header-main">
            <div class="header-left">
                <span class="header-title" data-lang-key="title">CLIENT SELECTION</span>
                <span class="header-sep"></span>
                <span class="header-user-info">
                    <span data-lang-key="user_label">User</span><span class="header-username" id="display-subuser">...</span>
                </span>
                <span id="selection-counter" class="selection-counter" data-quota="<?= $selectionQuota ?>">0 <span data-lang-key="counter_label">selected</span></span>
            </div>
            <div class="header-right">
                <button id="submit-btn" class="submit-btn<?= $isSubmitted ? ' submitted' : '' ?>"
                    onclick="submitSelection()"
                    data-submitted="<?= $isSubmitted ? '1' : '0' ?>"
                    data-submitted-at="<?= htmlspecialchars($userSubmittedAt ?: '') ?>"
                    <?= $isSubmitted ? 'disabled' : '' ?>>
                    <?= $isSubmitted ? '✓ Submitted' : 'Submit Selection' ?>
                </button>
                <button id="theme-toggle" class="header-ghost-btn" onclick="toggleTheme()" title="Toggle theme">☀</button>
                <button onclick="openPassModal()" class="header-ghost-btn" title="Change Password">⚙</button>
                <a href="logout.php" class="header-logout-btn" onclick="return confirmLogout()">Logout</a>
                <div class="lang-switcher" style="border-left:1px solid #1e1e1e; padding-left:12px;">
                    <span class="lang-btn active" id="lang-en" onclick="setLanguage('en')" title="English">🇬🇧</span>
                    <span class="lang-btn" id="lang-de" onclick="setLanguage('de')" title="Deutsch">🇩🇪</span>
                </div>
            </div>
        </div>

        <div class="header-tools">            
            
            <div class="filter-group">
                <select id="filter-user" onchange="loadImages()" style="background:#222; color:#fff; border:1px solid #444; padding:0.5rem; border-radius:4px; font-size:0.9rem; margin-right:10px; max-width: 150px;">
                    <option value="all" data-lang-key="view_all">View: All Users</option>
                </select>
                <label>
                    <input type="checkbox" id="filter-yes" onchange="applyFilters()"> 
                    <span data-lang-key="flag_only">Show 🚩 flagged only</span>
                </label>
            </div>

            <div class="filter-group" style="border-left:1px solid #444; padding-left:15px; margin-left:10px;">
                <select id="rating-operator" onchange="applyFilters()" style="background:#222; color:#fff; border:1px solid #444; border-radius:4px; padding:2px 5px; font-size:0.9rem; cursor:pointer;">
                    <option value="ge">≥</option>
                    <option value="le">≤</option>
                    <option value="eq">=</option>
                </select>

                <div id="filter-stars" class="filter-stars-container" style="display:flex; cursor:pointer;">
                    <span data-val="1" onclick="setFilterRating(1)">★</span>
                    <span data-val="2" onclick="setFilterRating(2)">★</span>
                    <span data-val="3" onclick="setFilterRating(3)">★</span>
                    <span data-val="4" onclick="setFilterRating(4)">★</span>
                    <span data-val="5" onclick="setFilterRating(5)">★</span>
                </div>
                
                <span id="filter-reset" onclick="setFilterRating(0)" style="cursor:pointer; font-size:0.8rem; color:#d9534f; display:none; margin-left:5px;" title="Reset">✖</span>
            </div>

            <div class="color-filter-group">
                <div class="color-sq sq-red" data-color="red" onclick="toggleColorFilter('red')"></div>
                <div class="color-sq sq-yellow" data-color="yellow" onclick="toggleColorFilter('yellow')"></div>
                <div class="color-sq sq-green" data-color="green" onclick="toggleColorFilter('green')"></div>
                <div class="color-sq sq-blue" data-color="blue" onclick="toggleColorFilter('blue')"></div>
                <div class="color-sq sq-none" onclick="toggleColorFilter('all')" title="Reset">×</div>
            </div>

            <input type="text" id="client-search" placeholder="Filter filenames..." 
                   style="background:#222; color:#fff; border:1px solid #444; padding:0.5rem; border-radius:4px; font-size:0.9rem; width:120px;">
            
            <select id="sort-select" class="sort-select">
                <option value="file_name" data-lang-key="sort_file">File Name</option>
                <option value="rating_desc" data-lang-key="sort_rating">Total Stars</option>
                <option value="selected" data-lang-key="sort_sel">Selected</option>
            </select>
            
            <div style="display:flex; align-items:center; gap:6px; border-left:1px solid #444; padding-left:12px; margin-left:5px;">
                <span style="font-size:0.8rem; color:#555;" title="Grid size">⊞</span>
                <input type="range" id="grid-size-slider" min="150" max="500" value="250"
                    style="width:70px; accent-color:#ffd700; cursor:pointer;" title="Adjust grid size">
            </div>

            <div style="display:flex; gap:5px; border-left:1px solid #444; padding-left:12px; margin-left:5px;">
                <button onclick="selectAllVisible()" class="help-btn" title="Select all visible photos">✓ All</button>
                <button onclick="deselectAllVisible()" class="help-btn" style="color:#d9534f;" title="Deselect all visible photos">✕ All</button>
            </div>

            <button class="help-btn" onclick="openHelp()" data-lang-key="help_btn">Help ?</button>
        </div>
    </div>
   
    <div class="selection-grid" id="grid-container"></div>
    <div id="gallery-count" class="gallery-count"></div>

   <div id="editor-modal">
    <div class="editor-canvas-area" id="canvas-wrapper" style="display:flex; align-items:center; justify-content:center;">
		<button id="nav-prev" class="editor-nav-btn nav-prev" onclick="changeImage(-1)">&lt;</button>
		<button id="nav-next" class="editor-nav-btn nav-next" onclick="changeImage(1)">&gt;</button>

	<div style="position: relative; width: max-content; height: max-content;">
		<canvas id="c"></canvas>
		
		<div class="editor-filename-overlay">
			<span id="editor-filename-display">Filename.jpg</span>
			<span id="editor-counter" style="margin-left: 15px; padding-left: 15px; border-left: 1px solid #666; color: #ffd700;"></span>
		</div>
	</div>
	</div>

	<div class="editor-sidebar">
    <h3 style="font-family:'Oswald'; text-transform:uppercase;" data-lang-key="rate_review">Rate & Review</h3>
    
    <div style="background:#222; padding:15px; margin-bottom:20px; border-radius:4px; text-align:center; border:1px solid #333;">
        <span id="global-stats" style="color:#ffd700; font-weight:bold; font-size:1.2rem;">...</span><br>
        <span id="global-yes" style="color:#666; font-size:0.9rem; font-weight:bold; text-transform:uppercase;">...</span>
    </div>
    
    <div style="margin-bottom: 20px;">
        <label style="color:#aaa; font-size:0.8rem; text-transform:uppercase;" data-lang-key="scribblers">Scribblers</label>
        <div id="active-users-legend" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:5px;"></div>
    </div>

    <div class="rating-stars" id="star-container">
        <span data-val="1">★</span><span data-val="2">★</span><span data-val="3">★</span><span data-val="4">★</span><span data-val="5">★</span>
    </div>
    
    <div style="margin-bottom: 20px;">
		<label style="color:#aaa; font-size:0.8rem; text-transform:uppercase;" data-lang-key="assign_label">Assign Label:</label>
		<div id="editor-label-selector" style="display:flex; gap:10px; margin-top:5px;">
			<div class="color-sq sq-red" data-color="red" onclick="setColor(null, 'red', event)" style="width:32px; height:32px; cursor:pointer;"></div>
			<div class="color-sq sq-yellow" data-color="yellow" onclick="setColor(null, 'yellow', event)" style="width:32px; height:32px; cursor:pointer;"></div>
			<div class="color-sq sq-green" data-color="green" onclick="setColor(null, 'green', event)" style="width:32px; height:32px; cursor:pointer;"></div>
			<div class="color-sq sq-blue" data-color="blue" onclick="setColor(null, 'blue', event)" style="width:32px; height:32px; cursor:pointer;"></div>
			<div class="color-sq sq-none" onclick="setColor(null, null, event)" style="width:32px; height:32px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#fff;">✕</div>
		</div>
	</div>

<div id="editor-image-colors" style="margin-top:15px; display:none;"></div>

    <div id="editor-image-colors" style="margin-top:15px; display:none;"></div>
    
    <button class="flag-btn" id="flag-btn" style="margin-top:1rem;" data-lang-key="btn_flag">🚩 Select (YES)</button>

    <div style="margin-top:1rem;">
        <label data-lang-key="your_comment">Your Comment</label>
        <textarea id="img-comment" rows="3" placeholder="..."></textarea>
        <div style="display:flex; gap:5px;">
            <button onclick="saveCurrentState(false)" style="flex:1; background:#444; color:#fff; border:none; padding:8px; cursor:pointer;" data-lang-key="save_note">💾 Save Note</button>
            <button onclick="deleteMyComment()" style="background:#333; color:#d9534f; border:none; padding:8px; cursor:pointer; width:40px;">🗑️</button>
        </div>
    </div>

    <div style="margin-top:20px;">
        <label style="color:#aaa; font-size:0.8rem; text-transform:uppercase;" data-lang-key="all_comments">All Comments</label>
        <div id="other-comments-list" style="margin-top:5px; max-height:150px; overflow-y:auto;"></div>
    </div>

    <div class="scribble-tools" style="margin-top:auto;">
        <label style="color:#aaa; font-size:0.8rem; text-transform:uppercase;" data-lang-key="tools">Tools</label>
        <div class="scribble-group" style="margin-bottom:5px;">
            <button onclick="resetCanvasView()" class="scribble-btn" title="Reset zoom and pan">
                <span class="scribble-icon">⊙</span>
                <span class="scribble-label">Reset</span>
            </button>
        </div>
        <div class="scribble-group">
            <button id="btn-draw" onclick="enableDraw(true)" class="scribble-btn active">
                <span class="scribble-icon">✎</span>
                <span class="scribble-label" data-lang-key="tool_draw">Draw</span>
            </button>
            <button id="btn-move" onclick="enableDraw(false)" class="scribble-btn">
                <span class="scribble-icon">✋</span>
                <span class="scribble-label" data-lang-key="tool_move">Move</span>
            </button>
            <button onclick="clearCanvas()" class="scribble-btn danger">
                <span class="scribble-icon">🗑</span>
                <span class="scribble-label" data-lang-key="tool_clear">Clear</span>
            </button>
        </div>
    </div>

    <div class="shortcut-legend-box">
        <h4 data-lang-key="shortcuts">Keyboard Shortcuts</h4>
        <div class="legend-grid">
            <div><span class="key">1</span>-<span class="key">5</span> Rating</div>
            <div><span class="key">6</span>-<span class="key">9</span> Color</div>
            <div><span class="key">F</span> Flag</div>
            <div><span class="key">⌫</span> Clear</div>
            <div><span class="key">Enter</span> Close</div>
        </div>
    </div>

    <?php if ($allowDownload): ?>
    <div style="margin-top:0.5rem;">
        <a id="download-btn" href="#" download
            style="display:block; width:100%; padding:8px; background:#1a1a1a; border:1px solid #444; color:#aaa; text-align:center; text-decoration:none; font-size:0.85rem; border-radius:4px; box-sizing:border-box;">
            ⬇ Download
        </a>
    </div>
    <?php endif; ?>
    <div style="margin-top:0.5rem;">
        <button onclick="saveAndClose()" style="width:100%; background:#fff; color:#000; border:none; padding:10px; font-weight:bold; cursor:pointer;" data-lang-key="close_btn">Close</button>
    </div>
</div>

   </div>
    
	<div id="help-modal">
    <div class="help-modal-content">
        <button class="help-close-btn" onclick="closeHelp()">X</button>
        
        <div id="help-de" style="display:none;">
            <h2>Anleitung & Hilfe</h2>
            <div class="help-section">
                <p>Willkommen in Ihrer Auswahl-Galerie. Bewerten und markieren Sie Bilder einfach und schnell.</p>
                <h3>1. Navigation</h3>
                <ul>
                    <li><strong>Doppelklick</strong> oder <span class="help-key">Enter</span>: Großansicht öffnen.</li>
                    <li><strong>Pfeiltasten</strong> <span class="help-key">&larr;</span> <span class="help-key">&rarr;</span>: Blättern.</li>
                    <li><span class="help-key">ESC</span>: Schließen.</li>
                </ul>
                <h3>2. Shortcuts</h3>
                <ul>
                    <li><span class="help-key">F</span>: Auswählen (Fahne setzen 🚩).</li>
                    <li><span class="help-key">1</span>-<span class="help-key">5</span>: Sterne vergeben. (<span class="help-key">0</span> löscht).</li>
                    <li><span class="help-key">6</span>-<span class="help-key">9</span>: Farbmarkierung setzen.</li>
                </ul>
            </div>
        </div>

        <div id="help-en">
            <h2>Help & Instructions</h2>
            <div class="help-section">
                <p>Welcome to your client gallery. Rate and flag images efficiently.</p>
                <h3>1. Navigation</h3>
                <ul>
                    <li><strong>Double-click</strong> or <span class="help-key">Enter</span>: Open Fullscreen.</li>
                    <li><strong>Arrow Keys</strong> <span class="help-key">&larr;</span> <span class="help-key">&rarr;</span>: Navigate.</li>
                    <li><span class="help-key">ESC</span>: Close.</li>
                </ul>
                <h3>2. Shortcuts</h3>
                <ul>
                    <li><span class="help-key">F</span>: Select (Set Flag 🚩).</li>
                    <li><span class="help-key">1</span>-<span class="help-key">5</span>: Rate Stars. (<span class="help-key">0</span> clears).</li>
                    <li><span class="help-key">6</span>-<span class="help-key">9</span>: Set Color Label.</li>
                </ul>
            </div>
        </div>
        
        <button class="help-close-btn" onclick="closeHelp()" style="width:100%; margin-top:10px;" data-lang-key="close_btn">Close</button>
    </div>
</div>
	
	<div id="pass-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9999; align-items:center; justify-content:center;">
    <div style="background:#222; padding:2rem; width:100%; max-width:400px; border:1px solid #444; border-radius:8px; text-align:center;">
        <h2 style="color:#fff; margin-top:0; font-family:'Oswald';">Change Password</h2>
        <form id="client-pass-form" style="margin-top:1rem;">
            <input type="password" id="old-pass" placeholder="Current Password" required style="width:100%; padding:10px; background:#000; border:1px solid #444; color:#fff; margin-bottom:10px;">
            <input type="password" id="new-pass" placeholder="New Password" required style="width:100%; padding:10px; background:#000; border:1px solid #444; color:#fff; margin-bottom:10px;">
            <button type="submit" style="width:100%; padding:10px; background:#fff; color:#000; font-weight:bold; cursor:pointer; border:none;">Update Password</button>
        </form>
        <button onclick="closePassModal()" style="width:100%; margin-top:10px; background:transparent; border:1px solid #444; color:#aaa; padding:8px; cursor:pointer;">Cancel</button>
    </div>
</div>
    
    <div id="toast-container"></div>

    <script src="js/client_script.js?v=<?= filemtime(__DIR__ . '/js/client_script.js') ?>"></script>


</body>
</html>