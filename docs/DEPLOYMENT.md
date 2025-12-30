# Orbit Tools - Deployment Guide

This guide documents the complete deployment process for the Orbit Tools website (`site/`) to the production VPS.

## 📋 Prerequisites

- **SSH Access:** You must have SSH access to the VPS (`51.38.190.126`) as the `ubuntu` user.
- **SSH Key:** Your public key must be added to `~/.ssh/authorized_keys` on the server.
- **Node.js & PM2:** The server must have Node.js (v18+) and PM2 installed globally.
- **Nginx:** Configured as a reverse proxy pointing to port `3002`.

## 🚀 Quick Deploy (One-Liner)

Run this command from the project root or `site/` directory to deploy changes immediately:

```bash
# From /home/tomio/Projects/instagram_extension/site
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude '.git' ./ ubuntu@51.38.190.126:/var/www/orbittools/site/ && ssh ubuntu@51.38.190.126 "cd /var/www/orbittools/site && npm install && npm run build && pm2 restart orbittools"
```

---

## 🛠️ Manual Deployment Steps

If you prefer to run the steps individually for better control or debugging:

### 1. Sync Files to VPS
Use `rsync` to upload the latest code, excluding heavy/unnecessary folders.

```bash
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude '.git' /home/tomio/Projects/instagram_extension/site/ ubuntu@51.38.190.126:/var/www/orbittools/site/
```

### 2. Remote Build & Restart
Connect via SSH to install dependencies, build the Next.js app, and restart the PM2 process.

```bash
ssh ubuntu@51.38.190.126 "cd /var/www/orbittools/site && npm install && npm run build && pm2 restart orbittools"
```

---

## 🆘 Troubleshooting

### "Changes are not showing up"
This is usually a caching issue (either build cache or browser cache).

1. **Force a Clean Rebuild:**
   Run this to delete the `.next` build folder on the server and rebuild from scratch:
   ```bash
   ssh ubuntu@51.38.190.126 "cd /var/www/orbittools/site && rm -rf .next && npm run build && pm2 restart orbittools"
   ```

2. **Hard Refresh Browser:**
   Press `Ctrl + F5` (Windows/Linux) or `Cmd + Shift + R` (Mac) to clear client-side cache.

### "Build Error on Server"
If the build fails on the server but works locally:
1. Check the logs:
   ```bash
   ssh ubuntu@51.38.190.126 "pm2 logs orbittools --lines 50"
   ```
2. Verify TypeScript errors (the server build is strict).
3. Ensure all new files were actually uploaded (check `rsync` output).

### Server Paths & Configs
- **Remote Path:** `/var/www/orbittools/site`
- **PM2 Process Name:** `orbittools`
- **Port:** `3002`
- **Nginx Config:** `/etc/nginx/sites-available/orbittools`
