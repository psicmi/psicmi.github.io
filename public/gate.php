<?php
declare(strict_types=1);

/**
 * 受保护文章的密码门。
 * 静态页面放在 _protected/，本文件校验密码后原样输出。
 */

define('PSICMI_GATE', true);

$configFile = __DIR__ . '/_gate/config.php';
if (!is_file($configFile)) {
    http_response_code(404);
    exit('Not found');
}

$config = require $configFile;
$articles = isset($config['articles']) && is_array($config['articles']) ? $config['articles'] : [];
$secret = isset($config['secret']) ? (string) $config['secret'] : '';

$id = isset($_GET['id']) ? preg_replace('/[^0-9]/', '', (string) $_GET['id']) : '';
if ($id === '' || !isset($articles[$id])) {
    http_response_code(404);
    exit('Not found');
}

$article = $articles[$id];
$cookieName = 'psicmi_gate';
$maxAge = 60 * 60 * 24 * 30;
$authorized = false;

if (!empty($_COOKIE[$cookieName])) {
    $parts = explode('|', (string) $_COOKIE[$cookieName]);
    if (count($parts) === 3) {
        [$cid, $exp, $sig] = $parts;
        $expected = hash_hmac('sha256', $cid . '|' . $exp, $secret);
        if ($cid === $id && ctype_digit($exp) && (int) $exp > time() && hash_equals($expected, $sig)) {
            $authorized = true;
        }
    }
}

$error = '';
$status = 200;

if (!$authorized && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $input = isset($_POST['password']) ? (string) $_POST['password'] : '';
    $expectedPassword = isset($article['password']) ? (string) $article['password'] : '';

    if ($expectedPassword !== '' && hash_equals($expectedPassword, $input)) {
        $exp = (string) (time() + $maxAge);
        $sig = hash_hmac('sha256', $id . '|' . $exp, $secret);
        setcookie($cookieName, $id . '|' . $exp . '|' . $sig, [
            'expires' => time() + $maxAge,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Lax',
            'secure' => !empty($_SERVER['HTTPS']),
        ]);
        header('Location: ' . ($_SERVER['REQUEST_URI'] ?? '/gate.php?id=' . $id), true, 303);
        exit;
    }

    usleep(600000);
    $status = 401;
    $error = '密码不正确';
} elseif (!$authorized) {
    $status = 401;
}

if ($authorized) {
    $file = __DIR__ . '/_protected/' . $id . '.html';
    if (!is_file($file)) {
        http_response_code(404);
        exit('Not found');
    }

    header('X-Robots-Tag: noindex, nofollow');
    header('Content-Type: text/html; charset=utf-8');
    readfile($file);
    exit;
}

http_response_code($status);
header('X-Robots-Tag: noindex, nofollow');
header('Content-Type: text/html; charset=utf-8');

$title = htmlspecialchars((string) ($article['title'] ?? '受保护的文章'), ENT_QUOTES, 'UTF-8');
$errorHtml = $error !== '' ? '<p class="error">' . htmlspecialchars($error, ENT_QUOTES, 'UTF-8') . '</p>' : '';
$action = htmlspecialchars('/gate.php?id=' . $id, ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow">
  <title><?= $title ?> - PSICMI</title>
  <style>
    :root {
      --content-width: 677px;
      --color-bg: #ededed;
      --color-surface: #ffffff;
      --color-text: #1f1f1f;
      --color-text-secondary: #8c8c8c;
      --color-border: #ededed;
      --color-link: #576b95;
      --color-accent: #07c160;
      --font-sans: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--color-bg);
      color: var(--color-text);
      font-family: var(--font-sans);
      font-size: 17px;
      line-height: 1.75;
      letter-spacing: 0.5px;
    }
    .shell {
      width: 100%;
      max-width: var(--content-width);
      min-height: 100vh;
      margin: 0 auto;
      background: var(--color-surface);
      box-shadow: 0 0 24px rgb(0 0 0 / 6%);
    }
    .card {
      padding: 56px 20px 64px;
      text-align: center;
    }
    .avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #eef2f8;
      color: var(--color-link);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 600;
    }
    h1 {
      margin: 20px 0 6px;
      font-size: 20px;
      line-height: 1.5;
      font-weight: 600;
    }
    .hint {
      margin: 0 0 28px;
      color: var(--color-text-secondary);
      font-size: 14px;
      letter-spacing: 0;
    }
    form {
      display: flex;
      gap: 10px;
      max-width: 360px;
      margin: 0 auto;
    }
    input[type="password"] {
      flex: 1;
      min-width: 0;
      padding: 10px 14px;
      border: 1px solid #dcdcdc;
      border-radius: 6px;
      background: #fff;
      color: var(--color-text);
      font: inherit;
      font-size: 15px;
      letter-spacing: 0;
      outline: none;
    }
    input[type="password"]:focus {
      border-color: var(--color-link);
    }
    button {
      flex: none;
      padding: 10px 20px;
      border: 0;
      border-radius: 6px;
      background: var(--color-accent);
      color: #fff;
      font: inherit;
      font-size: 15px;
      letter-spacing: 0;
      cursor: pointer;
    }
    button:hover {
      opacity: 0.9;
    }
    .error {
      margin: 14px 0 0;
      color: #e64340;
      font-size: 14px;
      letter-spacing: 0;
    }
    .back {
      display: inline-block;
      margin-top: 32px;
      color: var(--color-link);
      font-size: 14px;
      letter-spacing: 0;
      text-decoration: none;
    }
    @media (max-width: 720px) {
      .shell { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="card">
      <span class="avatar">P</span>
      <h1><?= $title ?></h1>
      <p class="hint">这篇文章需要密码才能查看</p>
      <form method="post" action="<?= $action ?>">
        <input type="password" name="password" placeholder="请输入访问密码" autofocus autocomplete="current-password" required>
        <button type="submit">查看</button>
      </form>
      <?= $errorHtml ?>
      <a class="back" href="/">返回首页</a>
    </div>
  </div>
</body>
</html>
