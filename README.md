# Lightdesk

> Self-hosted PHP photo selection tool for photographers. Clients rate, flag and annotate their gallery. Admins manage uploads, quotas and ZIP exports.

Lightdesk gives photographers a private, branded space where clients can review their shoot, star and flag keepers, leave comments, and draw directly on images. The admin side handles uploads, tracks progress per client, sets selection quotas, and exports the final picks as a ZIP — no third-party subscription required.

---

## Features

- **Client gallery** — star ratings, flag selections, comments, Fabric.js scribble annotations
- **Multi-user support** — multiple team members share one client login, each tracked separately
- **Admin dashboard** — per-client stats (photos, selections, quota, last active), live refresh
- **Selection quota** — set a target number of photos per client (e.g. "pick 30")
- **Submit & notify** — client submits final selection, admin receives email notification
- **ZIP export** — download all flagged photos as a zip file
- **Download toggle** — optionally allow clients to download originals
- **Watermarking** — optional permanent watermark burned into uploads (PHP GD)
- **Dark / light theme** — toggle per user, persists across sessions
- **Color labels** — Lightroom-style red/yellow/green/blue labels per image
- **Filter & sort** — filter by flag, rating, color label, filename; filter state persists
- **Keyboard shortcuts** — arrow navigation, 1–5 stars, F to flag, 6–9 color labels

---

## Requirements

- PHP 7.4 or higher
- MySQL 5.7 / MariaDB 10.3 or higher
- A web server (Apache / Nginx)
- PHP extensions: `pdo_mysql`, `gd` (optional, for watermarking)

---

## Installation

### 1. Upload files
Upload the entire contents of this folder to your web server, e.g. `yourdomain.com/photo-tool/`

### 2. Create a database
In your hosting control panel (cPanel / Plesk), create a new MySQL database and note the:
- Database name
- Database username
- Database password
- Host (usually `localhost`)

### 3. Import the schema
Open **phpMyAdmin**, select your new database, click **Import**, and upload `install.sql`.

This creates all tables and a default admin user.

### 4. Configure
Rename `config.sample.php` to `config.php` and fill in your details:

```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'your_database_name');
define('DB_USER', 'your_database_user');
define('DB_PASS', 'your_database_password');

define('BRAND_NAME',     'My Photography');
define('BRAND_INITIALS', 'MP');
```

### 5. Set folder permissions
Make the `uploads/` folder writable by the web server:

```bash
chmod 755 uploads/
```

Or via your hosting file manager, set permissions to **755**.

### 6. Log in
Open `yourdomain.com/photo-tool/login.php`

**Default credentials:**
| Field | Value |
|---|---|
| Username | `admin` |
| Password | `admin123` |

**Change the admin password immediately** via the "Change Password" button in the header.

---

## First steps after install

1. Log in as admin
2. Change the admin password
3. Create a client account (top panel → "Add Client")
4. Select the client in the dropdown → upload their photos via drag & drop
5. Share the login URL with your client

---

## Watermarking (optional)

To enable full-image watermarks on all new uploads, edit `config.php`:

```php
define('WATERMARK_ENABLED', true);
define('WATERMARK_TEXT',    '© My Photography');
```

**Warning:** watermarks are burned permanently into the uploaded image files. Already-uploaded images are not affected. Requires PHP GD extension.

---

## Email notifications

When a client submits their selection, an email is sent to the address hardcoded in `api_selection.php` (search for `$to =`). Change it to your email address.

---

## Security notes

- Never commit `config.php` to version control — it contains your database credentials
- The `uploads/` directory has an `.htaccess` that blocks direct PHP execution
- Client images are served from `uploads/{username}/` — consider adding authentication if you need stricter access control
- Change the default `admin` / `admin123` credentials before sharing the URL

---

## File structure

```
photo-tool/
├── config.sample.php   ← copy to config.php and fill in credentials
├── install.sql         ← import once into your database
├── login.php           ← entry point
├── index.php           ← client gallery
├── admin.php           ← admin dashboard
├── api_selection.php   ← all AJAX actions
├── export_zip.php      ← ZIP download handler
├── db_connect.php      ← database connection
├── logout.php
├── css/
│   ├── client_style.css
│   └── admin_style.css
├── js/
│   ├── client_script.js
│   └── admin_script.js
└── uploads/            ← client photos go here (needs write permission)
    └── .htaccess       ← blocks PHP execution in uploads
```
