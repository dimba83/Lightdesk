<?php
session_start();
require 'db_connect.php';
date_default_timezone_set('Europe/Vienna');

// Fehlerreporting für Debugging (in Produktion ggf. auskommentieren)
ini_set('display_errors', 0);
error_reporting(E_ALL);
header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    http_response_code(403);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$action = $_POST['action'] ?? '';
$currentUser = $_SESSION['user_id'];
$currentRole = $_SESSION['role'] ?? 'client';

// Watermark helper — full-image tiled diagonal overlay
function applyWatermark($filePath, $text) {
    if (!extension_loaded('gd') || !file_exists($filePath)) return;
    $info = @getimagesize($filePath);
    if (!$info) return;
    switch ($info['mime']) {
        case 'image/jpeg': $img = @imagecreatefromjpeg($filePath); break;
        case 'image/png':  $img = @imagecreatefrompng($filePath);  break;
        case 'image/webp': $img = @imagecreatefromwebp($filePath); break;
        default: return;
    }
    if (!$img) return;

    $w = imagesx($img);
    $h = imagesy($img);
    imagealphablending($img, true);

    $white  = imagecolorallocatealpha($img, 255, 255, 255, 55);
    $shadow = imagecolorallocatealpha($img, 0,   0,   0,   70);

    // Look for a TTF font on the server
    $fontFile = null;
    foreach ([
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        '/usr/share/fonts/liberation/LiberationSans-Regular.ttf',
        'C:/Windows/Fonts/arial.ttf',
        __DIR__ . '/fonts/watermark.ttf',
    ] as $p) { if (file_exists($p)) { $fontFile = $p; break; } }

    if ($fontFile && function_exists('imagettftext')) {
        // Scale font to ~1/12 of image width, tile diagonally at -30°
        $fontSize = max(18, (int)($w / 12));
        $angle    = -30;
        $bbox     = imagettfbbox($fontSize, $angle, $fontFile, $text);
        $tw = abs($bbox[4] - $bbox[0]);
        $th = abs($bbox[5] - $bbox[1]);
        $stepX = (int)($tw * 1.6);
        $stepY = (int)($th * 3.0);
        for ($y = 0; $y <= $h + $stepY; $y += $stepY) {
            $ox = (int)((($y / $stepY) % 2) * ($stepX / 2));
            for ($x = -$stepX + $ox; $x <= $w + $stepX; $x += $stepX) {
                imagettftext($img, $fontSize, $angle, $x + 1, $y + 1, $shadow, $fontFile, $text);
                imagettftext($img, $fontSize, $angle, $x,     $y,     $white,  $fontFile, $text);
            }
        }
    } else {
        // Fallback: tile built-in font in a grid (no rotation)
        $font  = 5;
        $tw    = imagefontwidth($font)  * strlen($text);
        $th    = imagefontheight($font);
        $stepX = $tw + 20;
        $stepY = $th * 4;
        for ($y = 0; $y < $h; $y += $stepY) {
            $ox = (int)((($y / $stepY) % 2) * ($stepX / 2));
            for ($x = -$tw + $ox; $x < $w + $tw; $x += $stepX) {
                imagestring($img, $font, $x + 1, $y + 1, $text, $shadow);
                imagestring($img, $font, $x,     $y,     $text, $white);
            }
        }
    }

    switch ($info['mime']) {
        case 'image/jpeg': imagejpeg($img, $filePath, 90); break;
        case 'image/png':  imagesavealpha($img, true); imagepng($img, $filePath);  break;
        case 'image/webp': imagewebp($img, $filePath, 90); break;
    }
    imagedestroy($img);
}

// Helper Funktion für Stats
function getUpdatedImageStats($pdo, $imageId) {
    // DURCHSCHNITT (AVG) statt SUM, Null-Werte ignorieren
    $statStmt = $pdo->prepare("
        SELECT 
            ROUND(AVG(NULLIF(rating, 0)), 1) as total_stars,
            COALESCE(SUM(is_selected), 0) as yes_count
        FROM image_interactions 
        WHERE image_id = ?
    ");
    $statStmt->execute([$imageId]);
    $stats = $statStmt->fetch(PDO::FETCH_ASSOC);

    // FIX: 'color_label' entfernt, da es in image_interactions nicht existiert
    $commStmt = $pdo->prepare("
        SELECT sub_user_name, rating, is_selected, comment, updated_at 
        FROM image_interactions 
        WHERE image_id = ? 
        AND (rating > 0 OR (comment IS NOT NULL AND comment != '') OR is_selected = 1)
        ORDER BY updated_at DESC
    ");
    $commStmt->execute([$imageId]);
    $comments = $commStmt->fetchAll(PDO::FETCH_ASSOC);

    return ['stats' => $stats, 'comments' => $comments];
}

// =========================================================
// ACTION: PING (session check)
// =========================================================
if ($action === 'ping') {
    echo json_encode(['status' => 'ok', 'role' => $currentRole]);
    exit;
}

// =========================================================
// ACTION: BATCH FLAG (client bulk select/deselect)
// =========================================================
if ($action === 'batch_flag') {
    if ($currentRole !== 'client') { echo json_encode(['status' => 'error']); exit; }
    $subUser  = $_POST['sub_user_name'] ?? '';
    $flag     = (int)($_POST['flag'] ?? 0);
    $imageIds = json_decode($_POST['image_ids'] ?? '[]', true);
    if (!is_array($imageIds) || empty($imageIds)) { echo json_encode(['status' => 'error']); exit; }

    $check  = $pdo->prepare("SELECT id FROM image_interactions WHERE image_id = ? AND sub_user_name = ?");
    $update = $pdo->prepare("UPDATE image_interactions SET is_selected = ? WHERE image_id = ? AND sub_user_name = ?");
    $insert = $pdo->prepare("INSERT INTO image_interactions (image_id, sub_user_name, is_selected) VALUES (?, ?, ?)");

    $pdo->beginTransaction();
    foreach ($imageIds as $imgId) {
        $imgId = (int)$imgId;
        $check->execute([$imgId, $subUser]);
        if ($check->fetch()) {
            $update->execute([$flag, $imgId, $subUser]);
        } else {
            $insert->execute([$imgId, $subUser, $flag]);
        }
    }
    $pdo->commit();
    echo json_encode(['status' => 'success']);
    exit;
}

// =========================================================
// ACTION: FETCH CLIENT STATS (admin dashboard refresh)
// =========================================================
if ($action === 'fetch_client_stats') {
    if ($currentRole !== 'admin') { echo json_encode(['status' => 'error']); exit; }
    $rows = $pdo->query("
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
    ")->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$r) {
        $r['quota_met']  = $r['selection_quota'] && (int)$r['selected_count'] === (int)$r['selection_quota'];
        $r['quota_over'] = $r['selection_quota'] && (int)$r['selected_count'] >   (int)$r['selection_quota'];
    }
    echo json_encode($rows);
    exit;
}

// =========================================================
// ACTION: FETCH SUBUSERS
// =========================================================
if ($action === 'fetch_subusers') {
    try {
        $targetId = $currentUser;
        // Admin kann für andere User abfragen
        if ($currentRole === 'admin' && !empty($_POST['target_user_id'])) {
            $targetId = $_POST['target_user_id'];
        }

        $stmt = $pdo->prepare("
            SELECT DISTINCT sub_user_name 
            FROM image_interactions 
            JOIN client_images ON image_interactions.image_id = client_images.id 
            WHERE client_images.user_id = ?
            ORDER BY sub_user_name ASC
        ");
        $stmt->execute([$targetId]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_COLUMN));
    } catch (PDOException $e) { 
        echo json_encode([]); 
    }
    exit;
}

// =========================================================
// ACTION: FETCH IMAGES (Das Herzstück)
// =========================================================
if ($action === 'fetch_images') {
    $sortMode = $_POST['sort'] ?? 'file_name';
    $filterUser = $_POST['filter_user'] ?? 'all';
    $filterStatus = $_POST['filter_status'] ?? 'all';
    $subUser = $_POST['sub_user_name'] ?? ''; 

    // 1. Params initialisieren
    $params = [':subUser' => $subUser];

    // 2. Join-Logik dynamisch bauen
    $joinCondition = "ci.id = ii.image_id";

    // Wenn spezieller User im Filter gewählt ist:
    if ($filterUser !== 'all' && $filterUser !== '') {
        $joinCondition .= " AND ii.sub_user_name = :filterUserName";
        $params[':filterUserName'] = $filterUser;
    }

    $sql = "
        SELECT
            ci.*,
            u.username,
            ROUND(AVG(NULLIF(ii.rating, 0)), 1) as total_stars,
            COALESCE(SUM(ii.is_selected), 0) as yes_count,
            COUNT(DISTINCT ii.sub_user_name) as rater_count,
            COUNT(DISTINCT CASE WHEN ii.comment IS NOT NULL AND ii.comment != '' THEN ii.id END) as comment_count,
            COUNT(CASE WHEN ii.scribble_data LIKE '%\"objects\":[{\"%' THEN 1 END) as total_scribbles,
            my_ii.rating       as my_rating,
            my_ii.is_selected  as my_selection,
            my_ii.scribble_data as my_scribble

        FROM client_images ci
        LEFT JOIN users u ON ci.user_id = u.id
        LEFT JOIN image_interactions ii ON $joinCondition
        LEFT JOIN image_interactions my_ii ON my_ii.image_id = ci.id AND my_ii.sub_user_name = :subUser
    ";
    
    $whereClauses = [];

    // 3. Sicherheits-Filter: Welcher Ordner/User?
    if ($currentRole !== 'admin') {
        $whereClauses[] = "ci.user_id = :targetUserId"; 
        $params[':targetUserId'] = $currentUser;
    } else {
        // Admin: Filtert nach Client-ID aus Dropdown
        $adminFilter = $_POST['filter_user_id'] ?? null; 
        if ($adminFilter) {
            $whereClauses[] = "ci.user_id = :targetUserId"; 
            $params[':targetUserId'] = $adminFilter;
        }
    }
        
    if (count($whereClauses) > 0) {
        $sql .= " WHERE " . implode(" AND ", $whereClauses);
    }

    $sql .= " GROUP BY ci.id";

    // 4. HAVING Filter (Status)
    $havingClauses = [];
    if ($filterStatus === 'yes') {
        $havingClauses[] = "yes_count > 0"; 
    } elseif ($filterStatus === 'commented') {
        $havingClauses[] = "comment_count > 0"; 
    } elseif ($filterStatus === 'scribbled') { 
        $havingClauses[] = "total_scribbles > 0";
    }

    if (count($havingClauses) > 0) {
        $sql .= " HAVING " . implode(" AND ", $havingClauses);
    }

    // 5. Sortierung
    $orderBy = 'ci.file_name ASC'; 
    if ($sortMode === 'date_desc') $orderBy = 'ci.upload_date DESC';
    if ($sortMode === 'date_asc') $orderBy = 'ci.upload_date ASC';
    if ($sortMode === 'rating_desc') $orderBy = 'total_stars DESC, ci.file_name ASC';
    if ($sortMode === 'rating_asc') $orderBy = 'total_stars ASC, ci.file_name ASC';
    if ($sortMode === 'file_name_asc') $orderBy = 'ci.file_name ASC';
    if ($sortMode === 'file_name_desc') $orderBy = 'ci.file_name DESC';
    if ($sortMode === 'selected') $orderBy = 'yes_count DESC, ci.file_name ASC';

    $sql .= " ORDER BY $orderBy";

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        // Sanitize username to match the actual folder name on disk
        foreach ($rows as &$row) {
            $row['username'] = preg_replace("/[^a-zA-Z0-9\._-]/", "", $row['username']);
        }
        echo json_encode($rows);
    } catch (PDOException $e) {
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

// =========================================================
// ACTION: SET COLOR LABEL
// =========================================================
if ($action === 'set_color_label') {
    $imgId = $_POST['image_id'];
    $newColor = $_POST['color']; 

    $stmt = $pdo->prepare("SELECT color_label FROM client_images WHERE id = ?");
    $stmt->execute([$imgId]);
    $row = $stmt->fetch();
    
    $currentColors = (!empty($row['color_label'])) ? explode(',', $row['color_label']) : [];

    if (empty($newColor) || $newColor === 'null') {
        $finalString = "";
    } else {
        $key = array_search($newColor, $currentColors);
        if ($key !== false) {
            unset($currentColors[$key]);
        } else {
            $currentColors[] = $newColor;
        }
        $currentColors = array_filter(array_unique($currentColors));
        sort($currentColors); 
        $finalString = implode(',', $currentColors);
    }

    $update = $pdo->prepare("UPDATE client_images SET color_label = ? WHERE id = ?");
    $update->execute([$finalString, $imgId]);

    echo json_encode(['status' => 'success', 'new_colors' => $finalString]);
    exit;
}

// =========================================================
// ACTION: FETCH IMAGE DETAILS
// =========================================================
if ($action === 'fetch_image_details') {
    $imgId = $_POST['image_id'];
    $subUser = $_POST['sub_user_name'] ?? '';

    $stmt = $pdo->prepare("SELECT * FROM image_interactions WHERE image_id = ?");
    $stmt->execute([$imgId]);
    $interactions = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $myData = null;
    foreach($interactions as $i) {
        if($i['sub_user_name'] === $subUser) $myData = $i;
    }
    
    $freshData = getUpdatedImageStats($pdo, $imgId);

    echo json_encode([
        'interactions' => $interactions, 
        'myData' => $myData,
        'liveStats' => $freshData['stats'],
        'liveComments' => $freshData['comments']
    ]);
    exit;
}

// =========================================================
// ACTION: SAVE DATA (Rating, Comment, etc)
// =========================================================
if ($action === 'save_data') {
    $id = $_POST['id'];
    $subUser = $_POST['sub_user_name'] ?? 'Admin';

    if ($currentRole === 'client' && empty($subUser)) {
         echo json_encode(['status'=>'error','message'=>'No name set']);
         exit;
    }

    if ($currentRole !== 'admin') {
        $check = $pdo->prepare("SELECT id FROM client_images WHERE id = ? AND user_id = ?");
        $check->execute([$id, $currentUser]);
        if (!$check->fetch()) { echo json_encode(['status'=>'error','message'=>'Not your image']); exit; }
    }

    $exist = $pdo->prepare("SELECT id FROM image_interactions WHERE image_id = ? AND sub_user_name = ?");
    $exist->execute([$id, $subUser]);
    $existingId = $exist->fetchColumn();

    if ($existingId) {
        $fields = [];
        $params = [];
        
        if (isset($_POST['rating']) && $_POST['rating'] !== '') { 
            $fields[] = "rating = ?"; $params[] = $_POST['rating']; 
        }
        if (isset($_POST['flag']) && $_POST['flag'] !== '') { 
            $fields[] = "is_selected = ?"; $params[] = $_POST['flag']; 
        }
        if (isset($_POST['comment'])) { 
            $fields[] = "comment = ?"; $params[] = $_POST['comment']; 
        }
        if (isset($_POST['scribble'])) { 
            $fields[] = "scribble_data = ?"; $params[] = $_POST['scribble']; 
        }

        if (!empty($fields)) {
            $params[] = $existingId; 
            $sql = "UPDATE image_interactions SET " . implode(', ', $fields) . " WHERE id = ?";
            $pdo->prepare($sql)->execute($params);
        }
    } else {
        $rating = (isset($_POST['rating']) && $_POST['rating'] !== '') ? $_POST['rating'] : 0;
        $flag = (isset($_POST['flag']) && $_POST['flag'] !== '') ? $_POST['flag'] : 0;
        $comment = $_POST['comment'] ?? '';
        $scribble = $_POST['scribble'] ?? '';

        $stmt = $pdo->prepare("INSERT INTO image_interactions (image_id, sub_user_name, rating, is_selected, comment, scribble_data) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$id, $subUser, $rating, $flag, $comment, $scribble]);
    }

    $freshData = getUpdatedImageStats($pdo, $id);

    echo json_encode([
        'status' => 'success',
        'new_stats' => $freshData['stats'],
        'new_comments' => $freshData['comments']
    ]);
    exit;
}

// =========================================================
// ACTION: UPLOAD
// =========================================================
if ($action === 'upload') {
    if ($currentRole !== 'admin') exit;
    $targetUserId = $_POST['target_user_id'];
    
    $stmt = $pdo->prepare("SELECT username FROM users WHERE id = ?");
    $stmt->execute([$targetUserId]);
    $username = $stmt->fetchColumn();
    
    $safeName = preg_replace("/[^a-zA-Z0-9\._-]/", "", $username);
    $targetDir = "uploads/" . $safeName . "/";
    if (!file_exists($targetDir)) mkdir($targetDir, 0777, true);
    
    $fileName = preg_replace("/[^a-zA-Z0-9\._-]/", "_", basename($_FILES["image"]["name"]));

    // Validate it is actually an image
    $allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff'];
    $detectedMime = mime_content_type($_FILES["image"]["tmp_name"]);
    if (!in_array($detectedMime, $allowedMimes)) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid file type.']);
        exit;
    }

    if (move_uploaded_file($_FILES["image"]["tmp_name"], $targetDir . $fileName)) {
        if (defined('WATERMARK_ENABLED') && WATERMARK_ENABLED) {
            $wmText = defined('WATERMARK_TEXT') ? WATERMARK_TEXT : '© FW';
            applyWatermark($targetDir . $fileName, $wmText);
        }
        $pdo->prepare("INSERT INTO client_images (file_name, user_id) VALUES (?, ?)")->execute([$fileName, $targetUserId]);
        echo json_encode(['status' => 'success']);
    }
    exit;
}

// =========================================================
// ACTION: DELETE CLIENT ACCOUNT
// =========================================================
if ($action === 'delete_client_account') {
    if ($currentRole !== 'admin') {
        echo json_encode(['status'=>'error', 'message'=>'Unauthorized']);
        exit;
    }
    $userId = $_POST['user_id'] ?? null;
    if (!$userId) { echo json_encode(['status'=>'error']); exit; }

    try {
        $stmt = $pdo->prepare("SELECT username FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $username = $stmt->fetchColumn();

        if ($username) {
            $safeName = preg_replace("/[^a-zA-Z0-9\._-]/", "", $username);
            $userFolder = __DIR__ . '/uploads/' . $safeName . '/';
            if (is_dir($userFolder)) {
                $files = glob($userFolder . '*');
                foreach ($files as $file) { if (is_file($file)) unlink($file); }
                rmdir($userFolder);
            }
        }

        $pdo->prepare("DELETE FROM users WHERE id = ?")->execute([$userId]); // cascades to client_images → image_interactions

        echo json_encode(['status' => 'success']);
    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}

// =========================================================
// ACTION: DELETE SINGLE IMAGE
// =========================================================
if ($action === 'delete_image') {
    if ($currentRole !== 'admin') exit;
    $imgId = $_POST['image_id'];
    
    $stmt = $pdo->prepare("SELECT ci.file_name, u.username FROM client_images ci JOIN users u ON ci.user_id = u.id WHERE ci.id = ?"); 
    $stmt->execute([$imgId]);
    $img = $stmt->fetch();
    
    if ($img) {
        $safeName = preg_replace("/[^a-zA-Z0-9\._-]/", "", $img['username']);
        $path = "uploads/" . $safeName . "/" . $img['file_name'];
        if(file_exists($path)) unlink($path);
        
        $pdo->prepare("DELETE FROM client_images WHERE id = ?")->execute([$imgId]);
        echo json_encode(['status' => 'success']);
    }
    exit;
}

// =========================================================
// ACTION: DELETE ALL IMAGES (BATCH)
// =========================================================
if ($action === 'delete_all_images') {
    if ($currentRole !== 'admin') exit;
    session_write_close(); 
    
    $uid = $_POST['target_user_id'];
    $limit = isset($_POST['limit']) ? (int)$_POST['limit'] : 20;

    $uStmt = $pdo->prepare("SELECT username FROM users WHERE id = ?");
    $uStmt->execute([$uid]);
    $username = $uStmt->fetchColumn();
    $safeName = preg_replace("/[^a-zA-Z0-9\._-]/", "", $username);

    $sql = "SELECT id, file_name FROM client_images WHERE user_id = ? LIMIT $limit";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$uid]);
    $images = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach($images as $img) {
        $path = "uploads/" . $safeName . "/" . $img['file_name'];
        if(file_exists($path)) unlink($path);
    }
    
    if (count($images) > 0) {
        $ids = array_column($images, 'id');
        $inQuery = implode(',', array_fill(0, count($ids), '?'));
        $pdo->prepare("DELETE FROM image_interactions WHERE image_id IN ($inQuery)")->execute($ids);
        $pdo->prepare("DELETE FROM client_images WHERE id IN ($inQuery)")->execute($ids);
    }

    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM client_images WHERE user_id = ?");
    $countStmt->execute([$uid]);
    $remaining = $countStmt->fetchColumn();

    echo json_encode(['status' => 'success', 'remaining' => $remaining]);
    exit;
}

// =========================================================
// ACTION: USER MANAGEMENT
// =========================================================
if ($action === 'create_user') {
    if ($currentRole !== 'admin') exit;
    $username = trim($_POST['username']);
    $pass = password_hash($_POST['password'], PASSWORD_DEFAULT);
    try {
        $pdo->prepare("INSERT INTO users (username, password, role) VALUES (?, ?, 'client')")->execute([$username, $pass]);
        echo json_encode(['status' => 'success']);
    } catch(PDOException $e) { echo json_encode(['status' => 'error', 'message' => 'User exists']); }
    exit;
}

// =========================================================
// ACTION: SUB-USER LOGS & DELETION
// =========================================================
if ($action === 'log_subuser') {
    $subUser = $_POST['sub_user_name'] ?? '';
    if (!$subUser) exit;

    $stmt = $pdo->prepare("SELECT username FROM users WHERE id = ?");
    $stmt->execute([$currentUser]);
    $mainUser = $stmt->fetchColumn();

    if ($mainUser) {
        $ip = $_SERVER['REMOTE_ADDR'];
        
        // FIX: Generate Time in Vienna Timezone
        $viennaTime = date('Y-m-d H:i:s'); 

        $findStmt = $pdo->prepare("SELECT id FROM login_logs WHERE username = ? AND ip_address = ? AND sub_user_name IS NULL ORDER BY login_time DESC LIMIT 1");
        $findStmt->execute([$mainUser, $ip]);
        $existingLogId = $findStmt->fetchColumn();

        if ($existingLogId) {
            // Update existing log
            $updateStmt = $pdo->prepare("UPDATE login_logs SET sub_user_name = ? WHERE id = ?");
            $updateStmt->execute([$subUser, $existingLogId]);
        } else {
            // Insert NEW log with Vienna Time
            // Changed NOW() to ? and passed $viennaTime
            $pdo->prepare("INSERT INTO login_logs (username, sub_user_name, ip_address, login_time) VALUES (?, ?, ?, ?)")
                ->execute([$mainUser, $subUser, $ip, $viennaTime]);
        }
    }
    echo json_encode(['status' => 'success']);
    exit;
}

if ($action === 'delete_subuser') {
    if ($currentRole !== 'admin') { echo json_encode(['status' => 'error', 'message' => 'Unauthorized']); exit; }
    
    $targetUserId = $_POST['target_user_id'] ?? null;
    $subUserName = $_POST['sub_user_name'] ?? null;
    
    if (!$targetUserId || !$subUserName) { echo json_encode(['status' => 'error']); exit; }

    $sql = "DELETE ii FROM image_interactions ii JOIN client_images ci ON ii.image_id = ci.id WHERE ci.user_id = ? AND ii.sub_user_name = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$targetUserId, $subUserName]);
    echo json_encode(['status' => 'success']);
    exit;
}

// =========================================================
// ACTION: SUBMIT SELECTION (CLIENT)
// =========================================================
if ($action === 'submit_selection') {
    if ($currentRole !== 'client') { echo json_encode(['status' => 'error', 'message' => 'Unauthorized']); exit; }

    $pdo->prepare("UPDATE users SET submitted_at = NOW() WHERE id = ?")->execute([$currentUser]);
    $submittedAt = date('Y-m-d H:i:s');

    // Fetch client name + selection count for the email
    $infoStmt = $pdo->prepare("
        SELECT u.username, COUNT(ii.id) as selected_count
        FROM users u
        LEFT JOIN client_images ci ON ci.user_id = u.id
        LEFT JOIN image_interactions ii ON ii.image_id = ci.id AND ii.is_selected = 1
        WHERE u.id = ?
        GROUP BY u.id
    ");
    $infoStmt->execute([$currentUser]);
    $info = $infoStmt->fetch(PDO::FETCH_ASSOC);
    $clientName   = $info['username'] ?? 'Unknown';
    $selectedCount = (int)($info['selected_count'] ?? 0);

    $to      = 'tm@thomasmoser.at';
    $subject = "Photo Selection submitted: {$clientName}";
    $body    = "Client \"{$clientName}\" has submitted their photo selection.\n\n"
             . "Selected photos: {$selectedCount}\n"
             . "Submitted at: {$submittedAt}\n\n"
             . "View in admin panel: https://thomasmoser.at/photo-tool/admin.php";
    $headers = "From: noreply@thomasmoser.at\r\nContent-Type: text/plain; charset=UTF-8";

    @mail($to, $subject, $body, $headers);

    echo json_encode(['status' => 'success', 'submitted_at' => $submittedAt]);
    exit;
}

// =========================================================
// ACTION: TOGGLE DOWNLOAD PERMISSION (ADMIN ONLY)
// =========================================================
if ($action === 'set_allow_download') {
    if ($currentRole !== 'admin') { echo json_encode(['status' => 'error', 'message' => 'Unauthorized']); exit; }
    $targetId = $_POST['target_user_id'] ?? null;
    $allow    = isset($_POST['allow']) ? (int)(bool)$_POST['allow'] : 0;
    if (!$targetId) { echo json_encode(['status' => 'error', 'message' => 'Missing target']); exit; }
    $pdo->prepare("UPDATE users SET allow_download = ? WHERE id = ?")->execute([$allow, $targetId]);
    echo json_encode(['status' => 'success', 'allow_download' => $allow]);
    exit;
}

// =========================================================
// ACTION: SET SELECTION QUOTA (ADMIN ONLY)
// =========================================================
if ($action === 'set_quota') {
    if ($currentRole !== 'admin') { echo json_encode(['status' => 'error', 'message' => 'Unauthorized']); exit; }
    $targetId = $_POST['target_user_id'] ?? null;
    $quota    = $_POST['quota'] ?? '';
    if (!$targetId) { echo json_encode(['status' => 'error', 'message' => 'Missing target']); exit; }
    $quotaVal = ($quota !== '' && is_numeric($quota) && (int)$quota > 0) ? (int)$quota : null;
    $pdo->prepare("UPDATE users SET selection_quota = ? WHERE id = ?")->execute([$quotaVal, $targetId]);
    echo json_encode(['status' => 'success', 'quota' => $quotaVal]);
    exit;
}

// =========================================================
// ACTION: UNSUBMIT SELECTION (ADMIN ONLY)
// =========================================================
if ($action === 'unsubmit_selection') {
    if ($currentRole !== 'admin') { echo json_encode(['status' => 'error', 'message' => 'Unauthorized']); exit; }
    $targetId = $_POST['target_user_id'] ?? null;
    if (!$targetId) { echo json_encode(['status' => 'error', 'message' => 'Missing target']); exit; }
    $pdo->prepare("UPDATE users SET submitted_at = NULL WHERE id = ?")->execute([$targetId]);
    echo json_encode(['status' => 'success']);
    exit;
}

// =========================================================
// ACTION: PASSWORD CHANGE (SELF)
// =========================================================
if ($action === 'change_password') {
    $stmt = $pdo->prepare("SELECT password FROM users WHERE id = ?"); 
    $stmt->execute([$currentUser]);
    $u = $stmt->fetch();
    
    if (password_verify($_POST['old_password'], $u['password'])) {
        $pdo->prepare("UPDATE users SET password = ? WHERE id = ?")->execute([password_hash($_POST['new_password'], PASSWORD_DEFAULT), $currentUser]);
        echo json_encode(['status' => 'success']);
    } else { 
        echo json_encode(['status' => 'error']); 
    }
    exit;
}

// =========================================================
// ACTION: FETCH ALL USERS (FOR ADMIN RESET)
// =========================================================
if ($action === 'fetch_all_users_admin') {
    if ($currentRole !== 'admin') exit;
    $stmt = $pdo->query("SELECT id, username, role FROM users ORDER BY role ASC, username ASC");
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    exit;
}

// =========================================================
// ACTION: ADMIN RESET PASSWORD (NO OLD PASS NEEDED)
// =========================================================
if ($action === 'admin_reset_password') {
    if ($currentRole !== 'admin') {
        echo json_encode(['status'=>'error', 'message'=>'Unauthorized']);
        exit;
    }
    $targetId = $_POST['target_user_id'] ?? null;
    $newPass = $_POST['new_password'] ?? '';

    if (!$targetId || !$newPass) { echo json_encode(['status'=>'error']); exit; }

    $hashed = password_hash($newPass, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
    $stmt->execute([$hashed, $targetId]);

    echo json_encode(['status' => 'success']);
    exit;
}
?>