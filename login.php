<?php
session_start();
require 'db_connect.php';

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $user = $_POST['username'];
    $pass = $_POST['password'];

    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$user]);
    $u = $stmt->fetch();

    if ($u && password_verify($pass, $u['password'])) {
        session_regenerate_id(true);
        $_SESSION['user_id']  = $u['id'];
        $_SESSION['role']     = $u['role'];
        $_SESSION['username'] = $u['username'];

        $logStmt = $pdo->prepare("INSERT INTO login_logs (username, ip_address, login_time) VALUES (?, ?, NOW())");
        $logStmt->execute([$user, $_SERVER['REMOTE_ADDR']]);

        header("Location: " . ($u['role'] === 'admin' ? 'admin.php' : 'index.php'));
        exit;
    } else {
        $error = "Invalid credentials";
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login | <?= htmlspecialchars(BRAND_NAME) ?></title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Oswald:wght@300;700&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; }
        body {
            display: flex; height: 100vh; align-items: center; justify-content: center;
            background: #000; font-family: 'Inter', sans-serif; margin: 0;
        }
        .login-box {
            background: #111; padding: 3rem; border: 1px solid #333;
            text-align: center; width: 100%; max-width: 400px; border-radius: 8px;
        }
        input {
            width: 100%; padding: 12px; margin: 10px 0;
            background: #222; border: 1px solid #444; color: #fff;
            border-radius: 4px; font-size: 1rem;
        }
        button {
            width: 100%; padding: 12px; background: #fff; color: #000;
            border: none; cursor: pointer; font-weight: bold; margin-top: 1rem;
            border-radius: 4px; text-transform: uppercase; font-size: 1rem;
        }
        button:hover { background: #ccc; }
        .slugline {
            font-family: 'Inter', sans-serif; color: #888; font-size: 0.8rem;
            text-transform: uppercase; letter-spacing: 2px;
            margin: 5px 0 30px; font-weight: 400;
        }
        .error { color: #d9534f; margin-bottom: 1rem; }
        @media (max-width: 768px) {
            .login-box { max-width: 90%; padding: 2rem; }
            input, button { padding: 15px; font-size: 16px; }
        }
    </style>
</head>
<body>
    <div class="login-box">
        <h1 style="font-size:80px; margin:0 0 5px; color:#fff;"><?= htmlspecialchars(BRAND_INITIALS) ?></h1>
        <div class="slugline">Client Review &amp; Collaboration</div>
        <hr style="border:0; border-top:1px solid #444; margin:10px 0 30px;">
        <h2 style="color:#fff; font-family:'Oswald'; margin-bottom:1.5rem;">CLIENT LOGIN</h2>
        <?php if (isset($error)): ?>
            <p class="error"><?= htmlspecialchars($error) ?></p>
        <?php endif; ?>
        <form method="post">
            <input type="text"     name="username" placeholder="Username" required>
            <input type="password" name="password" placeholder="Password" required>
            <button type="submit">Enter Gallery</button>
        </form>
    </div>
    <script>sessionStorage.removeItem('fw_subuser');</script>
</body>
</html>
