#!/bin/bash

# Exit script on any error
set -e

echo -e "\033[1;32m=== Email Tracking System Deployment Script ===\033[0m"

# Check if running as root
if [ "$(id -u)" != "0" ]; then
   echo -e "\033[1;31mThis script must be run as root\033[0m" 1>&2
   exit 1
fi

# Configuration - Update these variables as needed
APP_DIR="/var/www/davsafaris-email-system"
GIT_REPO="https://github.com/Dav-Safaris/davsafaris-email-system.git"
APP_USER="www-data"  # Default user for web applications
NODE_VERSION="18"

# Check if user exists and create if not available
if [ "$APP_USER" != "www-data" ] && ! id "$APP_USER" &>/dev/null; then
    echo -e "\033[1;33mUser $APP_USER does not exist. Creating user...\033[0m"
    useradd -m -s /bin/bash "$APP_USER"
    # Set a random password for the user
    TEMP_PASSWORD=$(openssl rand -base64 12)
    echo "$APP_USER:$TEMP_PASSWORD" | chpasswd
    echo -e "\033[1;32mUser $APP_USER created with password: $TEMP_PASSWORD\033[0m"
    echo -e "\033[1;33mNote: You should change this password immediately after installation.\033[0m"
    
    # Allow the user to restart the service without password
    echo "$APP_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart email-api" >> /etc/sudoers.d/email-api
    echo "$APP_USER ALL=(ALL) NOPASSWD: /usr/local/bin/pm2 restart email-api" >> /etc/sudoers.d/email-api
    chmod 0440 /etc/sudoers.d/email-api
fi

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
    
    # Create database and user
    echo -e "\033[1;34mSetting up PostgreSQL database...\033[0m"
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

# Handle application directory and git repository
if [ -d "$APP_DIR" ]; then
    echo -e "\033[1;33mApplication directory already exists.\033[0m"
    
    if [ -d "$APP_DIR/.git" ]; then
        echo -e "\033[1;33mGit repository exists. Choose an option:\033[0m"
        echo "1) Pull latest changes"
        echo "2) Backup and create fresh clone"
        echo "3) Continue without updating repository"
        read -p "Enter your choice (1-3): " repo_choice
        
        case $repo_choice in
            1)
                echo -e "\033[1;34mPulling latest changes...\033[0m"
                cd $APP_DIR
                git stash  # Save any local changes
                git pull origin main || git pull origin master
                ;;
            2)
                # Create backup
                TIMESTAMP=$(date +%Y%m%d%H%M%S)
                BACKUP_DIR="${APP_DIR}_backup_${TIMESTAMP}"
                echo -e "\033[1;34mBacking up existing $APP_DIR to $BACKUP_DIR...\033[0m"
                cp -r "$APP_DIR" "$BACKUP_DIR"
                
                # Remove and clone fresh
                echo -e "\033[1;34mClearing directory for fresh clone...\033[0m"
                rm -rf "$APP_DIR"
                mkdir -p "$APP_DIR"
                echo -e "\033[1;34mCloning repository...\033[0m"
                git clone $GIT_REPO $APP_DIR
                ;;
            3)
                echo -e "\033[1;34mContinuing with existing repository...\033[0m"
                ;;
            *)
                echo -e "\033[1;33mInvalid choice. Continuing with existing repository...\033[0m"
                ;;
        esac
    else
        # Directory exists but not a git repository
        echo -e "\033[1;33mDirectory exists but is not a git repository. Choose an option:\033[0m"
        echo "1) Backup directory and clone repository"
        echo "2) Exit"
        read -p "Enter your choice (1-2): " dir_choice
        
        case $dir_choice in
            1)
                # Create backup
                TIMESTAMP=$(date +%Y%m%d%H%M%S)
                BACKUP_DIR="${APP_DIR}_backup_${TIMESTAMP}"
                echo -e "\033[1;34mBacking up existing $APP_DIR to $BACKUP_DIR...\033[0m"
                cp -r "$APP_DIR" "$BACKUP_DIR"
                
                # Remove and clone fresh
                echo -e "\033[1;34mClearing directory for fresh clone...\033[0m"
                rm -rf "$APP_DIR"
                mkdir -p "$APP_DIR"
                echo -e "\033[1;34mCloning repository...\033[0m"
                git clone $GIT_REPO $APP_DIR
                ;;
            2)
                echo -e "\033[1;31mExiting as requested.\033[0m"
                exit 0
                ;;
            *)
                echo -e "\033[1;31mInvalid choice. Exiting.\033[0m"
                exit 1
                ;;
        esac
    fi
else
    # Directory doesn't exist, create it and clone the repository
    echo -e "\033[1;34mCreating application directory...\033[0m"
    mkdir -p $APP_DIR
    
    echo -e "\033[1;34mCloning repository...\033[0m"
    git clone $GIT_REPO $APP_DIR
fi

# Create logs directory if it doesn't exist
mkdir -p $APP_DIR/logs

# Set proper permissions
echo -e "\033[1;34mSetting proper permissions...\033[0m"
chown -R $APP_USER:$APP_USER $APP_DIR
chmod -R 755 $APP_DIR

# Install dependencies
echo -e "\033[1;34mInstalling Node.js dependencies...\033[0m"
cd $APP_DIR
npm install --production

# Create .env file if missing
if [ ! -f "$APP_DIR/.env" ]; then
    echo -e "\033[1;34mCreating .env file...\033[0m"
    SERVER_IP=$(hostname -I | awk '{print $1}' | tr -d '[:space:]')
    cat > $APP_DIR/.env << EOL
# Server Configuration
NODE_ENV=production
PORT=3000
SERVER_IP=$SERVER_IP
SERVER_URL=http://$SERVER_IP:3000
API_KEY=$(openssl rand -hex 16)
ADMIN_API_KEY=$(openssl rand -hex 16)
ALLOWED_ORIGINS=*

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=email_system
DB_USER=email_user
DB_PASSWORD=your_strong_password
SYNC_DB=true

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Email Configuration
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_user
SMTP_PASSWORD=your_smtp_password
EMAIL_FROM_NAME=Your Company
EMAIL_FROM_ADDRESS=noreply@yourdomain.com
EMAIL_REPLY_TO=support@yourdomain.com

# Worker Configuration
EMAIL_WORKER_COUNT=2
WORKER_CONCURRENCY=5
MAX_EMAILS_PER_WORKER=1000

# Tracking Configuration
TRACK_OPENS=true
TRACK_CLICKS=true

# Logging
LOG_DIR=logs
EOL
    echo -e "\033[1;32mCreated .env file. Please update it with your actual configuration.\033[0m"
fi

# Set proper permissions for .env file
chown $APP_USER:$APP_USER $APP_DIR/.env
chmod 600 $APP_DIR/.env

# Run database setup
echo -e "\033[1;34mSetting up database...\033[0m"
cd $APP_DIR
node setup.js || echo -e "\033[1;33mWarning: Database setup may have failed. Check logs for details.\033[0m"

# Configure Nginx - FIXED FOR SERVER_NAME ISSUES
echo -e "\033[1;34mConfiguring Nginx...\033[0m"
SERVER_IP=$(hostname -I | awk '{print $1}' | tr -d '[:space:]')
echo -e "\033[1;34mUsing server IP: $SERVER_IP for Nginx configuration\033[0m"

# Create Nginx configuration file with default_server directive
cat > /etc/nginx/sites-available/email-system << EOL
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    
    # Using default_server instead of server_name to avoid potential issues
    
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
    
    # Handle long-running tracking requests
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

# Enable the site
ln -sf /etc/nginx/sites-available/email-system /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
echo -e "\033[1;34mTesting Nginx configuration...\033[0m"
if ! nginx -t; then
    echo -e "\033[1;31mNginx configuration test failed. Trying alternative configuration...\033[0m"
    
    # Even simpler configuration as a last resort
    cat > /etc/nginx/sites-available/email-system << EOL
server {
    listen 80;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOL
    
    nginx -t && echo -e "\033[1;32mAlternative Nginx configuration is valid.\033[0m" || echo -e "\033[1;31mNginx configuration still failed. Please check manually.\033[0m"
fi

# Reload Nginx
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

# Make sure PM2 is owned by the right user if .pm2 directory exists
if [ -d "/home/$APP_USER/.pm2" ]; then
    chown $APP_USER:$APP_USER -R /home/$APP_USER/.pm2
fi

# Start the app with PM2 as the appropriate user
cd $APP_DIR

# If APP_USER is www-data, use a different approach since www-data usually doesn't have a proper shell
if [ "$APP_USER" = "www-data" ]; then
    echo -e "\033[1;34mStarting application with PM2 as www-data user...\033[0m"
    pm2 start ecosystem.config.js
    pm2 save
    
    # Set up PM2 startup
    pm2 startup systemd -u $USER --hp /home/$USER
    systemctl enable pm2-$USER
else
    echo -e "\033[1;34mStarting application with PM2 as $APP_USER user...\033[0m"
    su - $APP_USER -c "cd $APP_DIR && pm2 start ecosystem.config.js"
    su - $APP_USER -c "pm2 save"
    
    # Set up PM2 startup for the specific user
    PM2_STARTUP=$(su - $APP_USER -c "pm2 startup systemd -u $APP_USER --hp /home/$APP_USER" | grep "sudo" | sed -e "s/\s*\$.*//")
    
    if [ -n "$PM2_STARTUP" ]; then
        echo -e "\033[1;34mRunning PM2 startup command: $PM2_STARTUP\033[0m"
        eval $PM2_STARTUP
        
        # Ensure the service is enabled
        systemctl daemon-reload
        systemctl enable pm2-$APP_USER || echo -e "\033[1;33mWarning: Failed to enable pm2-$APP_USER service\033[0m"
    else
        echo -e "\033[1;33mWarning: Could not generate PM2 startup command. You may need to configure PM2 startup manually.\033[0m"
        echo -e "\033[1;33mTry running: 'sudo -u $APP_USER pm2 startup systemd -u $APP_USER --hp /home/$APP_USER'\033[0m"
    fi
fi

# Set up logrotate for application logs
echo -e "\033[1;34mSetting up log rotation...\033[0m"
cat > /etc/logrotate.d/email-system << EOL
$APP_DIR/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 $APP_USER $APP_USER
    sharedscripts
    postrotate
        [ "$APP_USER" = "www-data" ] && pm2 reload email-api || su - $APP_USER -c "pm2 reload email-api"
    endscript
}
EOL

echo -e "\033[1;32m===================================================\033[0m"
echo -e "\033[1;32mEmail tracking system has been deployed successfully!\033[0m"
echo ""
echo -e "\033[1;36mAPI Endpoint: http://$SERVER_IP/api/email\033[0m"
echo -e "\033[1;36mAPI Key: $(grep API_KEY $APP_DIR/.env | cut -d= -f2 || echo 'Not found')\033[0m"
echo -e "\033[1;36mAdmin API Key: $(grep ADMIN_API_KEY $APP_DIR/.env | cut -d= -f2 || echo 'Not found')\033[0m"
echo ""
if [ -n "${TEMP_PASSWORD:-}" ]; then
    echo -e "\033[1;33mUser $APP_USER was created with password: $TEMP_PASSWORD\033[0m"
    echo -e "\033[1;33mPlease change this password immediately using: sudo passwd $APP_USER\033[0m"
    echo ""
fi
echo -e "\033[1;33mImportant next steps:\033[0m"
echo -e "\033[1;33m1. Update your .env file with proper SMTP credentials\033[0m"
echo -e "\033[1;33m2. Consider setting up a domain name with SSL\033[0m"
echo -e "\033[1;33m3. Update your firewall rules\033[0m"
echo -e "\033[1;33m4. Test the email sending and tracking functionality\033[0m"
echo -e "\033[1;32m===================================================\033[0m"