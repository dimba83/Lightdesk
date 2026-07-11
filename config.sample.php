<?php
// ============================================================
// config.php  —  Copy this file to config.php and fill in your details
// ============================================================

// 1. Database credentials (from your hosting control panel)
define('DB_HOST', 'localhost');
define('DB_NAME', 'your_database_name');
define('DB_USER', 'your_database_user');
define('DB_PASS', 'your_database_password');

// 2. Branding — shown on the login page and throughout the UI
define('BRAND_NAME',     'My Photography');   // Full studio name
define('BRAND_INITIALS', 'MP');               // Short initials shown on login screen

// 3. Notifications — where the "client submitted their selection" email goes
define('NOTIFY_EMAIL', 'you@example.com');

// 3. Watermarking (optional)
//    WARNING: watermark is burned permanently into uploaded images — cannot be undone.
//    Requires PHP GD extension (enabled on most hosts by default).
define('WATERMARK_ENABLED', false);
define('WATERMARK_TEXT',    '© ' . BRAND_NAME);
