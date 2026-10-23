#!/usr/bin/env python3
"""把 dist/ 上传到阿里云虚拟主机。

用法：
    python3 scripts/deploy.py --dry-run   只登录并列出远端根目录
    python3 scripts/deploy.py             上传 dist/ 全部文件

配置来自项目根目录的 .env.deploy。
"""

import ftplib
import os
import sys
import time

CONFIG = ".env.deploy"
LOCAL_DIR = "dist"
DRY_RUN = "--dry-run" in sys.argv


def load_env(path):
    env = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


if not os.path.isfile(CONFIG):
    sys.exit(f"缺少 {CONFIG}")
if not os.path.isdir(LOCAL_DIR):
    sys.exit("缺少 dist/，请先运行 npm run build")

env = load_env(CONFIG)
host = env.get("DEPLOY_HOST", "")
user = env.get("DEPLOY_USER", "")
password = env.get("DEPLOY_PASS", "")
root = env.get("DEPLOY_ROOT", "/") or "/"
port = int(env.get("DEPLOY_PORT", "21") or 21)

if not host or not user or not password:
    sys.exit("DEPLOY_HOST / DEPLOY_USER / DEPLOY_PASS 不能为空")


def connect():
    ftp = ftplib.FTP()
    ftp.encoding = "gbk"
    ftp.connect(host, port, timeout=30)
    ftp.login(user, password)
    ftp.set_pasv(True)
    ftp.cwd(root)
    return ftp


ftp = connect()
print(f"[deploy] connected {host}:{port} -> {root}{' (dry-run)' if DRY_RUN else ''}")


def with_retry(action, label, attempts=3):
    global ftp
    last_error = None
    for attempt in range(attempts):
        try:
            return action()
        except Exception as exc:
            last_error = exc
            print(f"  retry {attempt + 1}/{attempts} {label}: {type(exc).__name__} {exc}", flush=True)
            try:
                ftp.close()
            except Exception:
                pass
            time.sleep(1)
            ftp = connect()
    raise last_error


def ensure_dir(rel):
    def action():
        current = ""
        for part in rel.split("/"):
            if not part:
                continue
            current = part if not current else f"{current}/{part}"
            try:
                ftp.mkd(current)
            except ftplib.error_perm:
                pass

    with_retry(action, f"mkdir {rel}")


def put_file(rel, local_path):
    def action():
        with open(local_path, "rb") as fh:
            ftp.storbinary(f"STOR {rel}", fh)

    with_retry(action, rel)


def upload(local_dir, prefix=""):
    count = 0
    for name in sorted(os.listdir(local_dir)):
        local_path = os.path.join(local_dir, name)
        rel = name if not prefix else f"{prefix}/{name}"
        if os.path.isdir(local_path):
            ensure_dir(rel)
            count += upload(local_path, rel)
        else:
            put_file(rel, local_path)
            count += 1
            if count % 20 == 0:
                print(f"  uploaded {count}", flush=True)
    return count


if DRY_RUN:
    names = ftp.nlst()
    print(f"[deploy] 远端 {root} 现有 {len(names)} 项：")
    for name in names[:40]:
        print(f"  - {name}")
    if len(names) > 40:
        print(f"  … 另有 {len(names) - 40} 项")
else:
    total = upload(LOCAL_DIR)
    print(f"[deploy] uploaded {total} files")

try:
    ftp.quit()
except Exception:
    ftp.close()
