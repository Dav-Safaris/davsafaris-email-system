#!/bin/bash

# Exit script on any error
set -e

echo "=== Email Tracking System Deployment Script ==="

# Check if running as root
if [ "$(id -u)" != "0" ]; then
   echo "This script must be run as root" 1>&2
   exit 1
fi

# Configuration
APP_DIR="/var/www/davsafaris-email-system"
GIT_REPO="https://github.com/Dav-Safaris/davsafaris-email-system.git"
APP_USER="ssemugenyi"
NODE_VERSION="18"

# Update system packages
echo "Updating system packages..."
apt update && apt upgrade -y

# Install essential tools
echo "Installing essential tools..."
apt install -y curl wget git build-essential

# Install Node.js if not installed
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt install -y nodejs
    
    # Verify installation
    node -v
    npm -v
fi

# Install PM2 globally if not installed
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
fi

# Install PostgreSQL if not installed
if ! command -v psql &> /dev/null; then
    echo "Installing PostgreSQL..."
    apt install -y postgresql postgresql-contrib
    
    # Start PostgreSQL service
    systemctl start postgresql
    systemctl enable postgresql
    
    # Create database and user
    echo "Setting up PostgreSQL database..."
    sudo -u postgres psql -c "CREATE USER email_user WITH PASSWORD 'your_strong_password';"
    sudo -u postgres psql -c "CREATE DATABASE email_system OWNER email_user;"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE email_system TO email_user;"
fi

# Install Redis if not installed
if ! command -v redis-server &> /dev/null; then
    echo "Installing Redis..."
    apt install -y redis-server
    
    # Configure Redis
    sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf
    sed -i 's/# requirepass foobared/requirepass your_redis_password/' /etc/redis/redis.conf
    
    # Restart Redis
    systemctl restart redis-server
    systemctl enable redis-server
fi

# Install Nginx if not installed
if ! command -v nginx &> /dev/null; then
    echo "Installing Nginx..."
    apt install -y nginx
    
    # Enable and start Nginx
    systemctl enable nginx
    systemctl start nginx
fi

# Create app directory
echo "Creating application directory..."
mkdir -p $APP_DIR
mkdir -p $APP_DIR/logs

# Clone or pull repository
if [ -d "$APP_DIR/.git" ]; then
    echo "Repository exists, pulling latest changes..."
    cd $APP_DIR
    git pull
else
    echo "Cloning repository..."
    git clone $GIT_REPO $APP_DIR
fi

# Set proper permissions
chown -R $APP_USER:$APP_USER $APP_DIR

# Install dependencies
echo "Installing dependencies..."
cd $APP_DIR
npm install --production

# Create .env file if it doesn't exist
if [ ! -f "$APP_DIR/.env" ]; then
    echo "Creating .env file..."
    SERVER_IP=$(hostname -I | awk '{print $1}')
    
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

    echo "Created .env file. Please update it with your actual configuration."
fi

# Run database setup
echo "Setting up database..."
cd $APP_DIR
node setup.js

# Configure Nginx
echo "Configuring Nginx..."
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

# Test the configuration
nginx -t

# Reload Nginx
systemctl reload nginx

# Configure PM2
echo "Configuring PM2..."
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

# Start application with PM2
echo "Starting application..."
cd $APP_DIR
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Configure PM2 to start on boot
pm2 startup systemd
systemctl enable pm2-$USER

# Display completion message
echo "==================================================="
echo "Email tracking system has been deployed successfully!"
echo ""
echo "API Endpoint: http://$SERVER_IP/api/email"
echo "API Key: $(grep API_KEY $APP_DIR/.env | cut -d= -f2)"
echo "Admin API Key: $(grep ADMIN_API_KEY $APP_DIR/.env | cut -d= -f2)"
echo ""
echo "Important next steps:"
echo "1. Update your .env file with proper SMTP credentials"
echo "2. Consider setting up a domain name with SSL"
echo "3. Update your firewall rules"
echo "==================================================="