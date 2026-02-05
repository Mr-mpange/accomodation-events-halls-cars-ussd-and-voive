#!/bin/bash

# Visitor Assistance USSD System Deployment Script
# Usage: ./scripts/deploy.sh [environment]

set -e

ENVIRONMENT=${1:-production}
PROJECT_NAME="visitor-assistance-ussd"

echo "🚀 Deploying $PROJECT_NAME to $ENVIRONMENT environment..."

# Check if required environment variables are set
check_env_vars() {
    local required_vars=(
        "DB_HOST"
        "DB_USER" 
        "DB_PASSWORD"
        "DB_NAME"
        "AT_USERNAME"
        "AT_API_KEY"
        "JWT_SECRET"
    )
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            echo "❌ Error: $var environment variable is not set"
            exit 1
        fi
    done
    
    echo "✅ All required environment variables are set"
}

# Install dependencies
install_dependencies() {
    echo "📦 Installing dependencies..."
    npm ci --only=production
    echo "✅ Dependencies installed"
}

# Run database migrations
run_migrations() {
    echo "🗄️ Running database migrations..."
    npm run migrate
    echo "✅ Database migrations completed"
}

# Seed database (only for development/staging)
seed_database() {
    if [[ "$ENVIRONMENT" != "production" ]]; then
        echo "🌱 Seeding database with sample data..."
        npm run seed
        echo "✅ Database seeded"
    else
        echo "⏭️ Skipping database seeding in production"
    fi
}

# Build application (if needed)
build_application() {
    echo "🔨 Building application..."
    # Add any build steps here if needed
    echo "✅ Application built"
}

# Start application with PM2
start_with_pm2() {
    echo "🚀 Starting application with PM2..."
    
    # Stop existing process if running
    pm2 stop $PROJECT_NAME 2>/dev/null || true
    pm2 delete $PROJECT_NAME 2>/dev/null || true
    
    # Start new process
    pm2 start server.js --name $PROJECT_NAME --env $ENVIRONMENT
    pm2 save
    
    echo "✅ Application started with PM2"
}

# Setup Nginx (if not already configured)
setup_nginx() {
    if [[ "$ENVIRONMENT" == "production" ]]; then
        echo "🌐 Setting up Nginx..."
        
        # Copy nginx configuration
        sudo cp nginx.conf /etc/nginx/sites-available/$PROJECT_NAME
        sudo ln -sf /etc/nginx/sites-available/$PROJECT_NAME /etc/nginx/sites-enabled/
        
        # Test nginx configuration
        sudo nginx -t
        
        # Reload nginx
        sudo systemctl reload nginx
        
        echo "✅ Nginx configured"
    fi
}

# Setup SSL certificate (Let's Encrypt)
setup_ssl() {
    if [[ "$ENVIRONMENT" == "production" ]] && [[ -n "$DOMAIN" ]]; then
        echo "🔒 Setting up SSL certificate..."
        
        # Install certbot if not already installed
        if ! command -v certbot &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y certbot python3-certbot-nginx
        fi
        
        # Obtain SSL certificate
        sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email $SSL_EMAIL
        
        echo "✅ SSL certificate configured"
    fi
}

# Health check
health_check() {
    echo "🏥 Performing health check..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f http://localhost:3000/health > /dev/null 2>&1; then
            echo "✅ Health check passed"
            return 0
        fi
        
        echo "⏳ Attempt $attempt/$max_attempts - waiting for application to start..."
        sleep 2
        ((attempt++))
    done
    
    echo "❌ Health check failed after $max_attempts attempts"
    exit 1
}

# Backup database (production only)
backup_database() {
    if [[ "$ENVIRONMENT" == "production" ]]; then
        echo "💾 Creating database backup..."
        
        local backup_dir="/var/backups/$PROJECT_NAME"
        local backup_file="$backup_dir/backup_$(date +%Y%m%d_%H%M%S).sql"
        
        mkdir -p $backup_dir
        
        mysqldump -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME > $backup_file
        gzip $backup_file
        
        # Keep only last 7 days of backups
        find $backup_dir -name "*.sql.gz" -mtime +7 -delete
        
        echo "✅ Database backup created: $backup_file.gz"
    fi
}

# Main deployment function
main() {
    echo "🎯 Starting deployment process..."
    
    # Pre-deployment checks
    check_env_vars
    
    # Backup (production only)
    backup_database
    
    # Install and build
    install_dependencies
    build_application
    
    # Database operations
    run_migrations
    seed_database
    
    # Start application
    start_with_pm2
    
    # Infrastructure setup (production only)
    setup_nginx
    setup_ssl
    
    # Post-deployment checks
    health_check
    
    echo "🎉 Deployment completed successfully!"
    echo "📊 Application status:"
    pm2 status $PROJECT_NAME
}

# Run main function
main "$@"