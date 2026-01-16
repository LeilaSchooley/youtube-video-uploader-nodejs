# Production Setup Guide

This guide covers setting up the YouTube Video Uploader for production deployment.

## Prerequisites

- Node.js 18+ installed
- PM2 installed globally: `npm install -g pm2`
- SSL certificate (for HTTPS)
- Reverse proxy (Apache/Nginx) configured

## 1. Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `GOOGLE_CLIENT_ID` - From Google Cloud Console
- `GOOGLE_CLIENT_SECRET` - From Google Cloud Console  
- `GOOGLE_REDIRECT_URI` - Must match your production domain (HTTPS)
- `NODE_ENV=production` - Enables secure cookies and production optimizations

## 2. Build the Application

```bash
npm install
npm run build
```

## 3. PM2 Setup

### Start with PM2

```bash
pm2 start ecosystem.config.js
```

### Enable PM2 Log Rotation

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
```

### Save PM2 Configuration

```bash
pm2 save
pm2 startup  # Follow instructions to enable auto-start on boot
```

### PM2 Commands

```bash
pm2 list              # View running processes
pm2 logs              # View all logs
pm2 logs nextjs       # View Next.js logs
pm2 logs worker       # View worker logs
pm2 restart all       # Restart all processes
pm2 restart nextjs    # Restart Next.js only
pm2 restart worker    # Restart worker only
pm2 stop all          # Stop all processes
pm2 delete all        # Remove all processes
```

## 4. Reverse Proxy Configuration

### Apache Configuration

```apache
<VirtualHost *:80>
    ServerName yourdomain.com
    Redirect permanent / https://yourdomain.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName yourdomain.com
    
    SSLEngine on
    SSLCertificateFile /path/to/certificate.crt
    SSLCertificateKeyFile /path/to/private.key
    
    ProxyPreserveHost On
    ProxyRequests Off
    
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
    
    # WebSocket support (if needed)
    RewriteEngine on
    RewriteCond %{HTTP:Upgrade} websocket [NC]
    RewriteCond %{HTTP:Connection} upgrade [NC]
    RewriteRule ^/?(.*) "ws://localhost:3000/$1" [P,L]
</VirtualHost>
```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 5. Firewall Configuration

Only expose ports 80 (HTTP) and 443 (HTTPS). Block direct access to port 3000:

```bash
# UFW example
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 3000/tcp
sudo ufw enable
```

## 6. Health Check

Monitor the application health:

```bash
curl https://yourdomain.com/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "uptime": 3600,
  "memory": { ... },
  "disk": { ... },
  "environment": { ... }
}
```

## 7. Monitoring

### Check PM2 Status

```bash
pm2 status
pm2 monit  # Real-time monitoring dashboard
```

### View Logs

```bash
pm2 logs --lines 100  # Last 100 lines
pm2 logs --err        # Errors only
```

### Disk Space Monitoring

Monitor disk usage for uploads directory:

```bash
du -sh uploads/
df -h
```

Set up alerts if disk usage exceeds 80%.

## 8. Backup Strategy

### Automated Backup Script

Create `scripts/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/backups/youtube-uploader"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup data directory
tar -czf $BACKUP_DIR/data_$DATE.tar.gz data/

# Backup uploads directory (optional, can be large)
# tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz uploads/

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/data_$DATE.tar.gz"
```

Add to crontab:
```bash
0 2 * * * /path/to/scripts/backup.sh
```

## 9. File Cleanup

Old completed jobs are automatically cleaned up. To manually clean:

```bash
# Via API (if implemented)
curl -X POST https://yourdomain.com/api/queue-manage \
  -H "Content-Type: application/json" \
  -d '{"action": "delete-all"}'
```

## 10. Troubleshooting

### Application won't start

1. Check logs: `pm2 logs`
2. Verify environment variables: `pm2 env 0`
3. Check port availability: `netstat -tulpn | grep 3000`

### Worker not processing jobs

1. Check worker logs: `pm2 logs worker`
2. Verify worker is running: `pm2 status`
3. Check queue file: `cat data/queue.json`

### High memory usage

1. Check memory: `pm2 monit`
2. Restart processes: `pm2 restart all`
3. Adjust memory limits in `ecosystem.config.js`

### Disk space issues

1. Check disk usage: `df -h`
2. Clean old uploads: Remove completed job directories
3. Set up automatic cleanup

## 11. Security Checklist

- [ ] HTTPS enabled with valid SSL certificate
- [ ] Environment variables secured (not in git)
- [ ] Firewall configured (only 80/443 open)
- [ ] Secure cookies enabled (NODE_ENV=production)
- [ ] Google OAuth redirect URI matches production domain
- [ ] Regular security updates applied
- [ ] Logs monitored for suspicious activity
- [ ] Backup strategy in place

## 12. Performance Optimization

- File size limit: 500MB (configurable in `next.config.js`)
- Queue writes: Debounced to reduce disk I/O
- Worker polling: 5-second intervals
- Memory limits: 1GB for Next.js, 500MB for worker

## Support

For issues or questions, check:
- PM2 logs: `pm2 logs`
- Health endpoint: `/api/health`
- Application logs in `logs/` directory




