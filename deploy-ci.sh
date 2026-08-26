#!/bin/bash

# CI/CD 部署脚本 - 适用于 GitHub Actions
# 用于自动化部署 Brainnel.com

set -e

echo "🚀 开始 CI/CD 自动部署..."

# 检查必要的环境
if [ ! -d "/home/admin/projects/cod-ecommerce" ]; then
    echo "❌ 项目目录不存在"
    exit 1
fi

cd /home/admin/projects/cod-ecommerce

echo "📥 拉取最新代码..."
# 强制更新本地代码以处理强制推送的情况
git fetch origin main
git reset --hard origin/main

echo "📦 安装/更新依赖..."
npm install --production=false

echo "🏗️ 构建生产版本..."
npm run build:prod

# 检查构建是否成功
if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
    echo "❌ 构建失败 - dist 目录或 index.html 不存在"
    exit 1
fi

# 双站点发布: 同一份 dist 发布到两个域名的 webroot
SITES="/var/www/brainnel.com /var/www/brainnel-vite.com"
BACKUP_TS=$(date +%Y%m%d_%H%M%S)

for SITE in $SITES; do
    if [ ! -d "$SITE" ]; then
        echo "⚠️  $SITE 不存在，跳过（如为新站点请先在服务器创建目录和 nginx 配置）"
        continue
    fi
    echo "📁 备份 $SITE ..."
    sudo cp -r "$SITE" "$SITE.backup.$BACKUP_TS"

    echo "🚚 部署新版本到 $SITE ..."
    sudo rm -rf "$SITE"/*
    sudo cp -r ./dist/* "$SITE"/

    echo "🔐 设置权限 $SITE ..."
    sudo chown -R www-data:www-data "$SITE"
    sudo chmod -R 755 "$SITE"

    # 每个站点只保留最近 5 份备份
    ls -1dt "$SITE".backup.* 2>/dev/null | tail -n +6 | while read -r OLD; do
        sudo rm -rf "$OLD"
        echo "🧹 清理旧备份: $OLD"
    done
done

echo "🔄 验证并重新加载 Nginx..."
if sudo nginx -t; then
    sudo systemctl reload nginx
    echo "✅ Nginx 重新加载成功"
else
    echo "❌ Nginx 配置测试失败"
    exit 1
fi

echo "🌐 测试网站访问..."
for URL in https://www.brainnel.com https://brainnel-vite.com; do
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL" || echo "000")
    if [ "$HTTP_STATUS" = "200" ]; then
        echo "✅ $URL 访问正常 (HTTP $HTTP_STATUS)"
    else
        echo "⚠️  $URL 可能有问题 (HTTP $HTTP_STATUS)"
    fi
done

echo "✅ CI/CD 部署完成！"
echo "🌐 网站地址：https://www.brainnel.com + https://brainnel-vite.com"
echo "📊 部署时间：$(date)"
