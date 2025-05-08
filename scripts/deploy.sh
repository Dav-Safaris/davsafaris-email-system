#!/bin/bash

# Exit script on any error
set -e

echo -e "\033[1;32m=== Email Tracking System Deployment Script ===\033[0m"

# Check if running as root
if [ "$(id -u)" != "0" ]; then
   echo -e "\033[1;31mThis script must be run as root\033[0m" 1>&2
   exit 1
fi

# Configuration
APP_DIR="/var/www/davsafaris-email-system"
GIT_REPO="https://github.com/Dav-Safaris/davsafaris-email-system.git"
APP_USER="ssemugenyi"
NODE_VERSION="18"

# Update system packages
echo -e "\033[1;34mUpdating system packages...\033[0m"
apt update && apt upgrade -y

# Install essential tools
echo -e "\033[1;34mInstalling essential tools...\033[0m"
apt install -y curl wget git build-essential

# Install Node.js if not installed
if ! command -v node &> /dev/null; then
    echo -e "\033[1;34mInstalling Node.js...\033[0m"
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt install -y nodejs
    node -v
    npm -v
fi

# Install PM2 globally if not installed
if ! command -v pm2 &> /dev/null; then
    echo -e "\033[1;34mInstalling PM2...\033[0m"
    npm install -g pm2
fi

# Install PostgreSQL if not installed
if ! command -v psql &> /dev/null; then
    echo -e "\033[1;34mInstalling PostgreSQL...\033[0m"
    apt install -y postgresql postgresql-contrib
    systemctl start postgresql
    systemctl enable postgresql
    sudo -u postgres psql -c "CREATE USER email_user WITH PASSWORD 'your_strong_password';"
    sudo -u postgres psql -c "CREATE DATABASE email_system OWNER email_user;"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE email_system TO email_user;"
fi

# Install Redis if not installed
if ! command -v redis-server &> /dev/null; then
    echo -e "\033[1;34mInstalling Redis...\033[0m"
    apt install -y redis-server
    sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf
    sed -i 's/# requirepass foobared/requirepass your_redis_password/' /etc/redis/redis.conf
    systemctl restart redis-server
    systemctl enable redis-server
fi

# Install Nginx if not installed
if ! command -v nginx &> /dev/null; then
    echo -e "\033[1;34mInstalling Nginx...\033[0m"
    apt install -y nginx
    systemctl enable nginx
    systemctl start nginx
fi

# DIRECT FIX FOR THE GIT CLONE ISSUE - Force removal and fresh clone
if [ -d "$APP_DIR" ]; then
    echo -e "\033[1;33mDestination directory already exists.\033[0m"
    
    # Create backup of existing directory
    TIMESTAMP=$(date +%Y%m%d%H%M%S)
    BACKUP_DIR="${APP_DIR}_backup_${TIMESTAMP}"
    echo -e "\033[1;34mBacking up existing $APP_DIR to $BACKUP_DIR...\033[0m"
    cp -r "$APP_DIR" "$BACKUP_DIR"
    
    # Remove existing directory contents but keep the directory
    echo -e "\033[1;34mClearing existing directory for fresh installation...\033[0m"
    rm -rf "$APP_DIR"/*
    
    # Clone repository into the now-empty directory
    echo -e "\033[1;34mCloning repository into existing directory...\033[0m"
    git clone $GIT_REPO $APP_DIR.tmp
    mv $APP_DIR.tmp/* $APP_DIR/
    mv $APP_DIR.tmp/.* $APP_DIR/ 2>/dev/null || true  # Move hidden files too
    rm -rf $APP_DIR.tmp
else
    # Create app directory
    mkdir -p $APP_DIR
    
    # Clone repository
    echo -e "\033[1;34mCloning repository...\033[0m"
    git clone $GIT_REPO $APP_DIR
fi

# Create logs directory if it doesn't exist
mkdir -p $APP_DIR/logs

# Set proper permissions
chown -R $APP_USER:$APP_USER $APP_DIR

# Install dependencies
echo -e "\033[1;34mInstalling dependencies...\033[0m"
cd $APP_DIR
npm install --production

# Create .env file if missing
if [ ! -f "$APP_DIR/.env" ]; then
    echo -e "\033[1;34mCreating .env file...\033[0m"
    SERVER_IP=$(hostname -I | awk '{print $1}')
    cat > $APP_DIR/.env << EOL
NODE_ENV=production
PORT=3000
SERVER_IP=$SERVER_IP
SERVER_URL=http://$SERVER_IP:3000
API_KEY=$(openssl rand -hex 16)
ADMIN_API_KEY=$(openssl rand -hex 16)
ALLOWED_ORIGINS=*

DB_HOST=localhost
DB_PORT=5432
DB_NAME=email_system
DB_USER=email_user
DB_PASSWORD=your_strong_password
SYNC_DB=true

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_user
SMTP_PASSWORD=your_smtp_password
EMAIL_FROM_NAME=Your Company
EMAIL_FROM_ADDRESS=noreply@yourdomain.com
EMAIL_REPLY_TO=support@yourdomain.com

EMAIL_WORKER_COUNT=2
WORKER_CONCURRENCY=5
MAX_EMAILS_PER_WORKER=1000

TRACK_OPENS=true
TRACK_CLICKS=true

LOG_DIR=logs
EOL
    echo -e "\033[1;32mCreated .env file. Please update it with your actual configuration.\033[0m"
fi

# Run database setup
echo -e "\033[1;34mSetting up database...\033[0m"
node setup.js || echo -e "\033[1;33mWarning: Database setup may have failed. Check logs for details.\033[0m"

# Configure Nginx
echo -e "\033[1;34mConfiguring Nginx...\033[0m"
cat > /etc/nginx/sites-available/email-system << EOL
server {
    listen 80;
    server_name $SERVER_IP;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location /api/email/tracking/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOL

ln -sf /etc/nginx/sites-available/email-system /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# Configure PM2
echo -e "\033[1;34mConfiguring PM2...\033[0m"
cat > $APP_DIR/ecosystem.config.js << EOL
module.exports = {
  apps: [
    {
      name: "email-api",
      script: "src/server.js",
      instances: "max",
      exec_mode: "cluster",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3000
      },
      max_memory_restart: "1G"
    }
  ]
}
EOL

cd $APP_DIR
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd
systemctl enable pm2-$USER

echo -e "\033[1;32m===================================================\033[0m"
echo -e "\033[1;32mEmail tracking system has been deployed successfully!\033[0m"
echo ""
echo -e "\033[1;36mAPI Endpoint: http://$SERVER_IP/api/email\033[0m"
echo -e "\033[1;36mAPI Key: $(grep API_KEY $APP_DIR/.env | cut -d= -f2)\033[0m"
echo -e "\033[1;36mAdmin API Key: $(grep ADMIN_API_KEY $APP_DIR/.env | cut -d= -f2)\033[0m"
echo ""
echo -e "\033[1;33mImportant next steps:\033[0m"
echo -e "\033[1;33m1. Update your .env file with proper SMTP credentials\033[0m"
echo -e "\033[1;33m2. Consider setting up a domain name with SSL\033[0m"
echo -e "\033[1;33m3. Update your firewall rules\033[0m"
echo -e "\033[1;32m===================================================\033[0m"