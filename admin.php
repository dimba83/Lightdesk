<?php
session_start();
require 'db_connect.php';

// Login Check & Admin Check
if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'admin') {
    header("Location: login.php");
    exit;
}

// Fetch Clients (for dropdown)
$clients = $pdo->query("SELECT id, username, submitted_at, selection_quota, allow_download FROM users WHERE role = 'client' ORDER BY username ASC")->fetchAll();

// Dashboard stats per client
$clientStats = $pdo->query("
    SELECT
        u.id, u.username, u.submitted_at, u.selection_quota,
        COUNT(DISTINCT ci.id) as photo_count,
        (SELECT COUNT(DISTINCT ii2.image_id)
         FROM image_interactions ii2
         JOIN client_images ci2 ON ii2.image_id = ci2.id
         WHERE ci2.user_id = u.id AND ii2.is_selected = 1) as selected_count,
        (SELECT MAX(login_time) FROM login_logs WHERE username = u.username) as last_login,
        (SELECT MAX(ii3.updated_at)
         FROM image_interactions ii3
         JOIN client_images ci3 ON ii3.image_id = ci3.id
         WHERE ci3.user_id = u.id) as last_active
    FROM users u
    LEFT JOIN client_images ci ON ci.user_id = u.id
    WHERE u.role = 'client'
    GROUP BY u.id
    ORDER BY u.username ASC
")->fetchAll();
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Dashboard | <?= htmlspecialchars(BRAND_NAME) ?></title>
    <script>(function(){var t=localStorage.getItem('fw_theme')||'dark';document.documentElement.setAttribute('data-theme',t);if(t==='light'){document.write('<style>body{background:#efefef!important;color:#111!important}<\/style>');}})();</script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Oswald:wght@300;700&display=swap" rel="stylesheet">
	<link rel="stylesheet" href="css/admin_style.css?v=<?= filemtime(__DIR__ . '/css/admin_style.css') ?>">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js"></script>

</head>
<body>

<div class="admin-header">
    <div style="font-family:'Oswald'; font-size:1.4rem; letter-spacing:1px; color:#fff;">ADMIN DASHBOARD</div>
    <div style="display:flex; align-items:center; gap:12px; margin-left:auto;">
        <button onclick="openHelpModal()" class="btn-action" style="border-color:#00aaff; color:#00aaff;">? Hilfe</button>
        <button onclick="openPassModal()" class="btn-action">Change Password</button>
        <button id="theme-toggle" class="btn-action" onclick="toggleTheme()" title="Toggle theme" style="font-size:1rem; padding:5px 10px;">☀</button>
        <a href="logout.php" class="header-logout-btn" onclick="return confirmLogout()">Logout</a>
    </div>
</div>

<div class="panel" style="margin-bottom:1.5rem;">
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1.2rem; flex-wrap:wrap; gap:10px;">
        <h2 style="margin:0;">Clients</h2>
            <button id="stats-refresh-btn" onclick="refreshClientStats()" class="btn-action" style="font-size:0.85rem; padding:4px 10px;">↻ Refresh</button>
        <form id="create-user-form" style="display:flex; gap:8px;">
            <input type="text" id="new-username" placeholder="New client name" required style="width:160px;">
            <input type="password" id="new-password" placeholder="Password" required style="width:130px;">
            <button type="submit" style="white-space:nowrap;">+ Add Client</button>
        </form>
    </div>

    <?php if (empty($clientStats)): ?>
        <p style="color:#555;">No clients yet.</p>
    <?php else: ?>
    <table id="client-stats-table" class="log-table" style="font-size:0.9rem;">
        <thead>
            <tr>
                <th>Client</th>
                <th style="text-align:center;">Photos</th>
                <th style="text-align:center;">Selected</th>
                <th style="text-align:center;">Quota</th>
                <th style="text-align:center;">Submitted</th>
                <th>Last Active</th>
                <th>Last Login</th>
            </tr>
        </thead>
        <tbody>
        <?php foreach($clientStats as $s):
            $selRatio = $s['photo_count'] > 0 ? ($s['selected_count'] / $s['photo_count']) : 0;
            $quotaMet = $s['selection_quota'] && $s['selected_count'] == $s['selection_quota'];
            $quotaOver = $s['selection_quota'] && $s['selected_count'] > $s['selection_quota'];
        ?>
        <tr>
            <td style="color:#ffd700; font-weight:bold;"><?= htmlspecialchars($s['username']) ?></td>
            <td style="text-align:center; color:#aaa;"><?= $s['photo_count'] ?></td>
            <td style="text-align:center; color:<?= $quotaMet ? '#5cb85c' : ($quotaOver ? '#d9534f' : '#fff') ?>; font-weight:bold;">
                <?= $s['selected_count'] ?><?= $s['selection_quota'] ? ' / ' . $s['selection_quota'] : '' ?>
            </td>
            <td style="text-align:center; color:#666;"><?= $s['selection_quota'] ?: '—' ?></td>
            <td style="text-align:center;">
                <?php if ($s['submitted_at']): ?>
                    <span style="color:#5cb85c; font-weight:bold;">✓</span>
                    <span style="color:#666; font-size:0.75rem;"><?= date('d.m.y', strtotime($s['submitted_at'])) ?></span>
                <?php else: ?>
                    <span style="color:#444;">—</span>
                <?php endif; ?>
            </td>
            <td class="timestamp"><?= $s['last_active'] ? date('d.m.y H:i', strtotime($s['last_active'])) : '—' ?></td>
            <td class="timestamp"><?= $s['last_login'] ? date('d.m.y H:i', strtotime($s['last_login'])) : '—' ?></td>
        </tr>
        <?php endforeach; ?>
        </tbody>
    </table>
    <?php endif; ?>
</div>

<div class="panel">
    <h2>2. Upload & Manage</h2>
    <label>Select Client Gallery:</label>
    
	<h3 style="color:#aaa; font-size:0.9rem; text-transform:uppercase; margin-bottom:10px;">1. Select Client</h3>

	<div style="display: flex; gap: 5px;">
		<select id="client-select" style="flex:1; padding:10px; background:#000; color:#fff; border:1px solid #444;">
			<option value="">-- Choose Client --</option>
			<?php foreach($clients as $c): ?>
				<option value="<?= $c['id'] ?>"
                    data-submitted="<?= !empty($c['submitted_at']) ? '1' : '0' ?>"
                    data-submitted-at="<?= htmlspecialchars($c['submitted_at'] ?? '') ?>"
                    data-quota="<?= (int)($c['selection_quota'] ?? 0) ?>"
                    data-allow-download="<?= (int)($c['allow_download'] ?? 0) ?>">
                    <?= htmlspecialchars($c['username']) ?><?= !empty($c['submitted_at']) ? ' ✓' : '' ?>
                </option>
			<?php endforeach; ?>
		</select>
		
		<button onclick="deleteClientAccount()" title="Delete this User" style="width: 45px; background: #333; color: #d9534f; border: 1px solid #444; font-weight: bold; font-size: 1.2rem;">
			&times;
		</button>
	</div>

    <div id="management-area" style="display:none; margin-top:20px;">

        <div id="submitted-banner" class="submitted-banner" style="display:none;">
            <span class="sub-label">✓ Selection Submitted</span>
            <span id="submitted-date" class="sub-date"></span>
            <button onclick="unsubmitClient()" class="btn-action" style="color:#d9534f; border-color:#d9534f; padding:4px 10px; font-size:0.8rem;">Reset</button>
        </div>

        <div style="display:flex; align-items:center; gap:20px; margin-bottom:15px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:8px;">
                <label style="color:#aaa; font-size:0.85rem; white-space:nowrap;">Selection quota:</label>
                <input type="number" id="quota-input" min="1" placeholder="No limit"
                    style="width:100px; background:#111; border:1px solid #444; color:#fff; padding:5px 8px; border-radius:4px;">
                <button onclick="saveQuota()" class="btn-action" style="padding:5px 12px; font-size:0.85rem;">Set</button>
                <span id="quota-status" style="font-size:0.8rem; color:#5cb85c;"></span>
            </div>
            <div style="display:flex; align-items:center; gap:8px; border-left:1px solid #333; padding-left:20px;">
                <label style="color:#aaa; font-size:0.85rem; white-space:nowrap;">Allow download:</label>
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                    <input type="checkbox" id="allow-download-toggle" onchange="setAllowDownload(this.checked)"
                        style="width:16px; height:16px; accent-color:#5cb85c; cursor:pointer;">
                    <span id="download-toggle-label" style="font-size:0.8rem; color:#666;">Off</span>
                </label>
            </div>
        </div>

        <div class="upload-area" id="drop-area">
            <h3>+ Drag & Drop Images Here</h3>
            <p>or click to browse</p>
            <input type="file" id="file-input" multiple style="display:none" accept="image/*">
        </div>
        <div id="upload-status" style="margin-top:10px; color:#aaa; text-align:center;"></div>
        
        <hr style="border:0; border-top:1px solid #333; margin: 2rem 0;">

      <div class="gallery-toolbar">
            <div class="toolbar-group">
                <input type="text" id="admin-search" placeholder="Search filenames..." oninput="applyFilters()" style="min-width: 150px; padding: 10px; border-radius: 4px;">
                <label style="display:flex; align-items:center; gap:5px; margin-left:10px; margin-right:10px; cursor:pointer; color:#ccc; font-size:0.9rem; border:1px solid #444; padding:5px 10px; border-radius:4px; background:#222;">
					<input type="checkbox" id="admin-filter-flagged" onchange="applyFilters()" style="accent-color:#d9534f; width:16px; height:16px;">🚩 
				</label>
                <div class="filter-group" style="display:flex; align-items:center; border-left:1px solid #444; padding-left:15px; margin-left:10px; margin-right:10px;">
                    <select id="rating-operator" onchange="applyFilters()" style="background:#222; color:#fff; border:1px solid #444; border-radius:4px; padding:2px 5px; font-size:0.9rem; cursor:pointer;">
                        <option value="ge" title="Greater than or equal">Rating ≥</option>
                        <option value="le" title="Less than or equal">Rating ≤</option>
                        <option value="eq" title="Equal">Rating =</option>
                    </select>

                    <div id="filter-stars" class="filter-stars-container" style="display:flex; cursor:pointer;">
                        <span data-val="1" onclick="setFilterRating(1)">★</span>
                        <span data-val="2" onclick="setFilterRating(2)">★</span>
                        <span data-val="3" onclick="setFilterRating(3)">★</span>
                        <span data-val="4" onclick="setFilterRating(4)">★</span>
                        <span data-val="5" onclick="setFilterRating(5)">★</span>
                    </div>
                    
                    <span id="filter-reset" onclick="setFilterRating(0)" style="cursor:pointer; font-size:0.8rem; color:#d9534f; display:none; margin-left:5px;" title="Reset Rating Filter">✖</span>
                </div>
                <select id="filter-user" onchange="toggleSubUserDelete(); reloadGallery()" style="min-width:120px;">
                    <option value="all">All Users</option>
                </select>
                <button id="btn-del-subuser" onclick="deleteSubUser()" class="btn-danger" style="margin-left:5px; padding:5px 10px; display:none;">&times;</button>
                
                <select id="filter-status" onchange="reloadGallery()" style="min-width:120px;">
                    <option value="all">All Status</option>
                    <option value="yes">Selected (YES)</option>
                    <option value="commented">Has Comment</option>
					<option value="scribbled">Has Scribble</option> </select>
                </select>
                
                <select id="sort-select" onchange="reloadGallery()" style="min-width:150px;">
                    <option value="file_name_asc">File Name (A-Z)</option> 
                    <option value="file_name_desc">File Name (Z-A)</option> 
                    <option value="date_desc">Newest First</option>
                    <option value="rating_desc">Highest Rating</option>
                </select>
				<div class="color-filter-group" id="admin-color-filters">
					<div class="color-sq sq-red" data-color="red" onclick="adminToggleColorFilter('red')"></div>
					<div class="color-sq sq-yellow" data-color="yellow" onclick="adminToggleColorFilter('yellow')"></div>
					<div class="color-sq sq-green" data-color="green" onclick="adminToggleColorFilter('green')"></div>
					<div class="color-sq sq-blue" data-color="blue" onclick="adminToggleColorFilter('blue')"></div>
					<div class="color-sq sq-none" onclick="adminToggleColorFilter('all')" title="Reset Color Filter">×</div>
				</div>
				
				<button onclick="resetAllAdminFilters()" class="btn-action" style="background: #444; color: #fff; border-color: #666;">
            <i class="fa-solid fa-rotate-left"></i> Reset Filters
        </button>
            </div>

            <div class="toolbar-group">
                <button id="btn-delete-selected" onclick="deleteSelectedImages()" class="btn-danger" style="display:none;">
                    Delete Selected (<span id="selected-count">0</span>)
                </button>
            </div>

            <div class="toolbar-group">
                <button class="btn-action" onclick="exportSelection('txt')">📄 TXT</button>
                <button class="btn-action" onclick="exportSelection('csv')">📊 CSV</button>
                <button class="btn-action" onclick="exportZip()" style="border-color:#ffd700; color:#ffd700;">📦 ZIP</button>
                <button onclick="deleteAllImages()" class="btn-danger">Clear Gallery</button>
            </div>

            <div class="toolbar-group" style="margin-left:auto;">
                <span style="font-size:0.8rem; color:#555;" title="Grid size">⊞</span>
                <input type="range" id="admin-grid-slider" min="120" max="400" value="180"
                    style="width:70px; accent-color:#ffd700; cursor:pointer;" title="Adjust grid size">
            </div>
        </div>

        <div id="admin-gallery-container" class="admin-gallery-grid"></div>
        <div style="margin-top:10px; color:#666; font-size:0.8rem;">
            Tips: Double-click to Edit. Use Arrows to navigate. Shift+Arrows to select range.
        </div>
    </div>
</div>

<div id="editor-modal">
		<div class="editor-canvas-area" style="display:flex; align-items:center; justify-content:center;">
        
        <div style="position: relative; width: max-content; height: max-content;">
            
            <button id="admin-nav-prev" class="editor-nav-btn nav-prev" onclick="changeImage(-1)">&lt;</button>
            <button id="admin-nav-next" class="editor-nav-btn nav-next" onclick="changeImage(1)">&gt;</button>

            <canvas id="c"></canvas>
            
            <div id="editor-filename-display" class="editor-filename-overlay">Filename</div>
        </div>

    </div>
		<div class="editor-sidebar">
        <div id="editor-image-colors" style="margin-bottom:20px; display:none;"></div>
        <h3>User Details</h3>
        <div id="user-details-list"></div>
        
        <button onclick="closeEditor()" style="margin-top:auto; padding:15px;">Close (ENTER)</button>
    </div>
</div>

<div id="error-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9999; align-items:center; justify-content:center;">
    <div style="background:#222; padding:2rem; width:100%; max-width:400px; border:1px solid #d9534f; border-radius:8px; text-align:center;">
        <div style="font-size:2.5rem; margin-bottom:0.5rem;">⚠</div>
        <h3 style="color:#d9534f; margin:0 0 1rem; font-family:'Oswald'; text-transform:uppercase;">Export Error</h3>
        <p id="error-modal-msg" style="color:#ccc; margin-bottom:1.5rem; font-size:0.95rem;"></p>
        <button onclick="document.getElementById('error-modal').style.display='none'" class="btn-danger" style="width:100%; padding:10px;">Close</button>
    </div>
</div>

<div id="help-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:9999; align-items:center; justify-content:center;">
    <div style="background:#222; padding:2rem; max-width:600px; color:#ddd;">
        <h2>Admin Help</h2>
        <p><strong>Selection:</strong> Click to select. Shift+Click for range. Ctrl/Cmd+Click to toggle.</p>
        <p><strong>Keyboard:</strong> Arrow keys to move. Shift+Arrows to select multiple. Enter/Double-Click to open editor.</p>
        <button onclick="closeHelpModal()" class="btn-action" style="width:100%; margin-top:20px;">Close</button>
    </div>
</div>

	<div id="pass-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9999; align-items:center; justify-content:center;">
    <div style="background:#222; padding:2rem; width:100%; max-width:400px; border:1px solid #444; border-radius:8px; text-align:center;">
        <h2 style="color:#fff; margin-top:0; font-family:'Oswald';">Change Password</h2>
        <div id="pass-msg" style="display:none; padding:8px; border-radius:4px; margin-bottom:10px; font-size:0.9rem;"></div>
        <form id="pass-form" style="margin-top:1rem;">
            <input type="password" id="old-pass" placeholder="Current Password" required style="width:100%; padding:10px; background:#000; border:1px solid #444; color:#fff; margin-bottom:10px;">
            <input type="password" id="new-pass" placeholder="New Password" required style="width:100%; padding:10px; background:#000; border:1px solid #444; color:#fff; margin-bottom:10px;">
            <button type="submit" style="width:100%; padding:10px; background:#fff; color:#000; font-weight:bold; cursor:pointer; border:none;">Update Password</button>
        </form>
        <button onclick="closePassModal()" style="width:100%; margin-top:10px; background:transparent; border:1px solid #444; color:#aaa; padding:8px; cursor:pointer;">Cancel</button>
    </div>
</div>

    <div id="toast-container"></div>
    <script src="js/admin_script.js?v=<?= filemtime(__DIR__ . '/js/admin_script.js') ?>"></script>


</body>
</html>