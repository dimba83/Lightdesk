<?php
// db_connect.php

// Check if config exists
if (!file_exists('config.php')) {
    die("Error: config.php not found. Please rename config.sample.php to config.php and enter your details.");
}

require_once 'config.php';

$dsn = "mysql:host=".DB_HOST.";dbname=".DB_NAME.";charset=utf8mb4";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
} catch (\PDOException $e) {
    // Generic error message for security (don't show password errors to public)
    die("Database Connection Error. Check your config.php settings.");
}
?>