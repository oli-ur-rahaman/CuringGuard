# CuringGuard Deployment Guide for Hostinger KVM4

This guide is written for your exact case:

- VPS: `Hostinger KVM4`
- OS: `Ubuntu`
- Web server already in use: `Nginx`
- Other projects already exist on the server
- DB already installed and running
- Upload method: `FileZilla`
- Target domain: `curing.autoxyz.cloud`
- Desired Linux user: `curing`

This guide avoids disturbing the other 4 projects on the VPS.

---

## 0. What this guide assumes

These were already confirmed:

- DNS control for `autoxyz.cloud` is available
- MySQL/MariaDB is already installed
- Nginx and Certbot are already in use
- File upload to server will be done with FileZilla

From your live port check, these ports are already occupied:

- `127.0.0.1:8000` by another `gunicorn` app
- `*:8080` by `httpd`
- `127.0.0.1:8088` by docker
- `127.0.0.1:8888` by docker
- `0.0.0.0:8900` by docker
- `0.0.0.0:8901` by docker

So this guide uses:

- backend internal port: `127.0.0.1:8010`

This port was chosen specifically to avoid the services already running on your VPS.

---

## 1. Final deployment architecture

The safe deployment layout will be:

- public domain:
  - `https://curing.autoxyz.cloud`
- frontend:
  - built static files served by `Nginx`
- backend:
  - `FastAPI` on `127.0.0.1:8010`
- database:
  - local MySQL/MariaDB
- uploads:
  - stored under `/home/curing/app/uploads`
- Linux app user:
  - `curing`

Important:

- public users will only hit `Nginx`
- backend port `8010` will not be public
- this protects the app better and avoids conflict with your other projects

---

## 2. Directory plan

Use this exact directory structure:

```text
/home/curing/app/
├── backend/
├── frontend/
├── uploads/
└── .env
```

---

## 3. Step 1: Point the subdomain

Create this DNS record:

- Type: `A`
- Host/Name: `curing`
- Value: `YOUR_VPS_PUBLIC_IP`

### How to know it is done

From your PC:

```powershell
nslookup curing.autoxyz.cloud
```

You should see your VPS public IP.

Do not continue until it resolves correctly.

---

## 4. Step 2: Log into the VPS

From your PC:

```powershell
ssh root@YOUR_VPS_PUBLIC_IP
```

### How to know it is done

You should see the Ubuntu shell prompt like:

```bash
root@srv1232553:~#
```

---

## 5. Step 3: Create the Linux user

Run:

```bash
adduser curing
usermod -aG www-data curing
```

### How to know it is done

Run:

```bash
id curing
```

You should see the `curing` user and group info.

---

## 6. Step 4: Create the application directories

Run:

```bash
mkdir -p /home/curing/app/backend
mkdir -p /home/curing/app/frontend
mkdir -p /home/curing/app/uploads
chown -R curing:curing /home/curing/app
chmod -R 750 /home/curing/app
```

### How to know it is done

Run:

```bash
ls -la /home/curing/app
```

You should see:

- `backend`
- `frontend`
- `uploads`

---

## 7. Step 5: Create the database and DB user

Open MySQL/MariaDB:

```bash
mysql -u root -p
```

Run:

```sql
CREATE DATABASE curingguard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'curingguard_user'@'localhost' IDENTIFIED BY 'CuringGuard_DB_2026_91';
GRANT ALL PRIVILEGES ON curingguard.* TO 'curingguard_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Use a DB password that is strong but URL-safe.

Recommended style:

- letters
- numbers
- `_`
- `-`

Avoid if possible:

- `@`
- `:`
- `/`
- `?`
- `#`
- `&`
- `%`

Reason:

- this project stores the DB connection as a URL in `.env`
- special characters can break the DB URL unless they are URL-encoded

### How to know it is done

Run:

```bash
mysql -u curingguard_user -p -e "SHOW DATABASES;"
```

You should see `curingguard`.

---

## 8. Step 6: Upload project files with FileZilla

Login in FileZilla using the `curing` user.

Upload the project into:

- `/home/curing/app/backend`
- `/home/curing/app/frontend`

Upload:

- backend source files
- frontend source files
- existing `uploads` only if you want old data/media

Do not upload unnecessary local folders such as:

- `node_modules`
- `dist`
- `.playwright-mcp`
- screenshots
- temporary logs

### How to know it is done

Run:

```bash
ls -la /home/curing/app/backend
ls -la /home/curing/app/frontend
```

You should see:

- `/home/curing/app/backend/app`
- `/home/curing/app/backend/requirements.txt`
- `/home/curing/app/frontend/package.json`
- `/home/curing/app/frontend/src`

---

## 9. Step 7: Create the environment files

Create:

```bash
nano /home/curing/app/.env
```

Paste:

```env
DATABASE_URL=mysql+pymysql://curingguard_user:CuringGuard_DB_2026_91@localhost:3306/curingguard
SECRET_KEY=CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_KEY
```

Save and exit.

Create backend env too:

```bash
nano /home/curing/app/backend/.env
```

Paste the same content:

```env
DATABASE_URL=mysql+pymysql://curingguard_user:CuringGuard_DB_2026_91@localhost:3306/curingguard
SECRET_KEY=CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_KEY
```

### How to know it is done

Run:

```bash
cat /home/curing/app/.env
cat /home/curing/app/backend/.env
```

Check that both files exist and values are correct.

---

## 10. Step 8: Install required packages

Run:

```bash
apt update
apt install -y python3 python3-venv python3-pip nginx mysql-client certbot python3-certbot-nginx curl
```

### How to know it is done

Run:

```bash
python3 --version
nginx -v
certbot --version
```

All should return versions.

Important:

- do **not** upgrade or replace the system-wide Node.js blindly
- your other VPS projects may depend on the current system Node
- CuringGuard frontend will use a **user-local Node** for the `curing` user only

---

## 11. Step 9: Create Python virtual environment

Important:

The backend requirements file is incomplete for the actual project runtime, so install the extra packages too.

Run:

```bash
sudo -u curing bash -c '
cd /home/curing/app/backend &&
python3 -m venv .venv &&
source .venv/bin/activate &&
pip install --upgrade pip &&
pip install -r requirements.txt &&
pip install pymysql "passlib[bcrypt]" "python-jose[cryptography]" python-multipart Pillow "bcrypt==4.0.1"
'
```

### How to know it is done

Run:

```bash
sudo -u curing bash -c 'source /home/curing/app/backend/.venv/bin/activate && pip list | egrep "fastapi|uvicorn|sqlalchemy|pymysql|passlib|python-jose|bcrypt"'
```

You should see all required packages.

If you want a stricter check, run:

```bash
sudo -u curing bash -c 'source /home/curing/app/backend/.venv/bin/activate && pip show sqlalchemy pymysql python-multipart Pillow'
```

Also verify bcrypt version:

```bash
sudo -u curing bash -c 'source /home/curing/app/backend/.venv/bin/activate && pip show bcrypt'
```

You want:

- `Version: 4.0.1`

---

## 12. Step 10: Install frontend dependencies and build

Run:

```bash
su - curing
```

Then install `nvm` for the `curing` user only:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
command -v nvm
nvm --version
```

What you want:

- `command -v nvm` returns `nvm`
- `nvm --version` returns a real version number

Then install Node 22 only for `curing`:

```bash
nvm install 22
nvm use 22
nvm alias default 22
node -v
npm -v
which node
```

What you want:

- Node version `v22.x.x`
- `which node` should point inside `/home/curing/.nvm/...`
- not `/usr/bin/node`

Then build the frontend:

```bash
cd /home/curing/app/frontend
rm -rf node_modules
npm install
VITE_API_BASE_URL=/api npm run build
```

### How to know it is done

Run:

```bash
ls -la /home/curing/app/frontend/dist
```

You should see:

- `index.html`
- `assets/`

---

## 13. Step 11: Create one-time superadmin init script

Create:

```bash
nano /home/curing/app/backend/init_superadmin.py
```

Paste:

```python
from backend.app.core.database import SessionLocal
from backend.app.core.auth import get_password_hash
from backend.app.models.users import User, UserRole

EMAIL = "superadmin@gmail.com"
PASSWORD = "oliruetce@110064"
MOBILE = "01700000000"

db = SessionLocal()
try:
    existing = db.query(User).filter(User.username == EMAIL).first()
    if existing:
        print("SUPERADMIN_ALREADY_EXISTS")
    else:
        user = User(
            username=EMAIL,
            email=EMAIL,
            hashed_password=get_password_hash(PASSWORD),
            role=UserRole.SUPERADMIN,
            mobile_number=MOBILE,
            is_active=1,
            full_name="Super Admin",
        )
        db.add(user)
        db.commit()
        print("SUPERADMIN_CREATED")
finally:
    db.close()
```

If you want a different mobile number for the superadmin, replace the `MOBILE` value with a real 11-digit number.

### How to know it is done

Run:

```bash
cat /home/curing/app/backend/init_superadmin.py
```

---

## 14. Step 12: Create backend systemd service

Create:

```bash
nano /etc/systemd/system/curingguard-backend.service
```

Paste:

```ini
[Unit]
Description=CuringGuard FastAPI Backend
After=network.target mysql.service mariadb.service

[Service]
User=curing
Group=www-data
WorkingDirectory=/home/curing/app
Environment="PYTHONPATH=/home/curing/app/backend:/home/curing/app"
EnvironmentFile=/home/curing/app/backend/.env
ExecStart=/home/curing/app/backend/.venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8010
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Run:

```bash
systemctl daemon-reload
systemctl enable curingguard-backend
systemctl start curingguard-backend
```

### How to know it is done

Run:

```bash
systemctl status curingguard-backend --no-pager
```

You want:

- `active (running)`

Then check backend locally:

```bash
curl http://127.0.0.1:8010/
```

You should get a JSON health response.

If it fails, inspect:

```bash
journalctl -u curingguard-backend -n 100 --no-pager
```

---

## 15. Step 13: Run superadmin init once

Run:

```bash
sudo -u curing bash -c '
cd /home/curing/app &&
source /home/curing/app/backend/.venv/bin/activate &&
PYTHONPATH=/home/curing/app/backend:/home/curing/app python /home/curing/app/backend/init_superadmin.py
'
```

### How to know it is done

You should get one of:

- `SUPERADMIN_CREATED`
- `SUPERADMIN_ALREADY_EXISTS`

---

## 16. Step 13.1: Optional DB check in phpMyAdmin

If phpMyAdmin is already present on your VPS, open it in browser using your existing phpMyAdmin URL.

Login with:

- MySQL user: `curingguard_user`
- MySQL password: `CuringGuard_DB_2026_91`

Then open database:

- `curingguard`

What you should confirm:

- the database opens successfully
- tables begin appearing after backend startup
- after running the superadmin init script, the `users` table contains:
  - `superadmin@gmail.com`

If you prefer, you can also log in to phpMyAdmin as MySQL root and inspect the same `curingguard` database there.

---

## 17. Step 14: Create Nginx site config

Create:

```bash
nano /etc/nginx/sites-available/curing.autoxyz.cloud
```

Paste:

```nginx
server {
    listen 80;
    server_name curing.autoxyz.cloud;

    root /home/curing/app/frontend/dist;
    index index.html;

    client_max_body_size 200M;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8010/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300;
        proxy_connect_timeout 60;
        proxy_send_timeout 300;
    }

    location /uploads/ {
        alias /home/curing/app/uploads/;
        autoindex off;
    }

    location = /docs {
        deny all;
        return 403;
    }

    location = /openapi.json {
        deny all;
        return 403;
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

Enable it:

```bash
ln -s /etc/nginx/sites-available/curing.autoxyz.cloud /etc/nginx/sites-enabled/curing.autoxyz.cloud
nginx -t
systemctl reload nginx
```

Important:

- use `reload`
- do not use `restart` unless necessary
- `reload` is safer because your VPS already serves other projects

### How to know it is done

`nginx -t` must say:

- `syntax is ok`
- `test is successful`

Then check:

```bash
curl -I http://curing.autoxyz.cloud
```

You should get an HTTP response.

---

## 18. Step 15: Issue SSL certificate

Run:

```bash
certbot --nginx -d curing.autoxyz.cloud
```

When asked, choose:

- redirect HTTP to HTTPS = `yes`

### How to know it is done

Run:

```bash
curl -I https://curing.autoxyz.cloud
```

You should see an HTTPS response.

Also open in browser:

- `https://curing.autoxyz.cloud/login`

---

## 19. Step 16: Check mobile and PC access

### On PC

Open:

- `https://curing.autoxyz.cloud/login`

### On mobile

Open:

- `https://curing.autoxyz.cloud/login`

This matters because mobile capture/location flow needs HTTPS.

### How to know it is done

Both PC and mobile should:

- open the login page
- allow login
- use the same domain

On mobile, camera/location permission should now work properly because the site is HTTPS.

---

## 20. Step 17: Check that other VPS projects are still safe

Run:

```bash
systemctl status nginx --no-pager
systemctl status curingguard-backend --no-pager
nginx -t
ls -la /etc/nginx/sites-enabled/
```

### What you should confirm

- Nginx is running
- `curingguard-backend` is running
- your other site configs are still present
- only one new site file was added:
  - `curing.autoxyz.cloud`

Do not edit or remove any other Nginx site config unless necessary.

---

## 21. Step 18: How to update later

### If backend code changes

Run:

```bash
systemctl restart curingguard-backend
systemctl status curingguard-backend --no-pager
```

### If frontend code changes

Run:

```bash
su - curing
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22
cd /home/curing/app/frontend
VITE_API_BASE_URL=/api npm run build
exit
systemctl reload nginx
```

---

## 22. Step 19: Minimum security measures for current scope

This guide already applies the minimum safe choices for your current scope:

- backend hidden on `127.0.0.1:8010`
- only Nginx is public
- HTTPS enabled
- `/docs` blocked
- `/openapi.json` blocked
- separate Linux user
- separate MySQL user
- secret key loaded from env
- uploads not openly indexed

Still important:

- do not leave weak DB passwords
- do not leave weak `SECRET_KEY`
- do not expose backend directly on public IP

---

## 23. Step 20: Things to expect on first startup

Your backend currently performs runtime table/column creation on startup.

So first startup may take slightly longer than normal.

If backend does not come up, check:

```bash
journalctl -u curingguard-backend -n 100 --no-pager
```

That log is the first place to inspect.

---

## 24. Final credentials from this guide

Initial superadmin created by the one-time script:

- login ID: `superadmin@gmail.com`
- password: `oliruetce@110064`

Change the password after first successful login.

---

## 25. Summary of exact values used

- domain:
  - `curing.autoxyz.cloud`
- app user:
  - `curing`
- app root:
  - `/home/curing/app`
- backend internal port:
  - `127.0.0.1:8010`
- DB:
  - `curingguard`
- DB user:
  - `curingguard_user`

