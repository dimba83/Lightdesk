<?php
session_start();
require 'db_connect.php';

if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'admin') {
    http_response_code(403);
    exit('Unauthorized');
}

$clientId = $_GET['client_id'] ?? null;
if (!$clientId || !is_numeric($clientId)) {
    http_response_code(400);
    exit('Missing or invalid client_id');
}

$stmt = $pdo->prepare("SELECT username FROM users WHERE id = ? AND role = 'client'");
$stmt->execute([$clientId]);
$client = $stmt->fetch();
if (!$client) {
    http_response_code(404);
    exit('Client not found');
}

// All images flagged by at least one sub-user
$stmt = $pdo->prepare("
    SELECT DISTINCT ci.file_name
    FROM client_images ci
    JOIN image_interactions ii ON ii.image_id = ci.id AND ii.is_selected = 1
    WHERE ci.user_id = ?
    ORDER BY ci.file_name ASC
");
$stmt->execute([$clientId]);
$images = $stmt->fetchAll(PDO::FETCH_COLUMN);

if (empty($images)) {
    http_response_code(404);
    exit('No selected images for this client');
}

if (!class_exists('ZipArchive')) {
    http_response_code(500);
    exit('ZipArchive not available on this server');
}

$username  = preg_replace("/[^a-zA-Z0-9\._-]/", "", $client['username']);
$uploadDir = __DIR__ . '/uploads/' . $username . '/';
$zipName   = $username . '_selection_' . date('Ymd') . '.zip';
$zipPath   = sys_get_temp_dir() . '/' . uniqid('zip_') . '.zip';

$zip = new ZipArchive();
if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
    http_response_code(500);
    exit('Could not create zip archive');
}

$added = 0;
foreach ($images as $fileName) {
    $filePath = $uploadDir . $fileName;
    if (file_exists($filePath)) {
        $zip->addFile($filePath, $fileName);
        $added++;
    }
}
$zip->close();

if ($added === 0) {
    unlink($zipPath);
    http_response_code(404);
    exit('No image files found on disk');
}

header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . $zipName . '"');
header('Content-Length: ' . filesize($zipPath));
header('Cache-Control: no-cache');
readfile($zipPath);
unlink($zipPath);
exit;
