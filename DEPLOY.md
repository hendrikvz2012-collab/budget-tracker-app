# Deploy Budget Tracker to Production

## Option 1: Deploy to a VPS (Linux)

```bash
# 1. Install Node.js 20+ on your server
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs git

# 2. Clone the app
git clone https://github.com/yourusername/budget-tracker-app.git
cd budget-tracker-app

# 3. Install dependencies
npm install

# 4. Configure environment
nano .env
# Edit: PAYPAL_MODE=live, JWT_SECRET=<random>, PORT=3001

# 5. Run with PM2 (process manager)
sudo npm install -g pm2
pm2 start server.js --name budget-tracker
pm2 save
pm2 startup

# 6. Set up reverse proxy (Nginx)
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/budget-tracker
```

**Nginx config:**
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable and restart
sudo ln -s /etc/nginx/sites-available/budget-tracker /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

# 7. SSL with Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Option 2: Deploy to Railway (easiest)

1. Push the app to a GitHub repo
2. Go to https://railway.app
3. Click **New Project** → **Deploy from GitHub repo**
4. Add environment variables (`.env` values)
5. Set start command: `node server.js`
6. Done — Railway gives you a URL

---

## Option 3: Deploy to Render

1. Push to GitHub
2. Go to https://render.com → **New Web Service**
3. Connect your repo
4. Set: Build Command = `npm install`, Start Command = `node server.js`
5. Add environment variables
6. Deploy

---

## Environment Variables for Production

```
PAYPAL_CLIENT_ID=your_live_client_id
PAYPAL_CLIENT_SECRET=your_live_secret
PAYPAL_MODE=live
PORT=3001
JWT_SECRET=generate-a-long-random-string-here
```

Generate a JWT secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
