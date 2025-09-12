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
git pull origin main

echo "📦 安装/更新依赖..."
npm install --production=false

echo "🏗️ 构建生产版本..."
npm run build

# 检查构建是否成功
if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
    echo "❌ 构建失败 - dist 目录或 index.html 不存在"
    exit 1
fi

echo "📁 备份当前网站..."
sudo cp -r /var/www/brainnel.com /var/www/brainnel.com.backup.$(date +%Y%m%d_%H%M%S)

echo "🚚 部署新版本..."
sudo rm -rf /var/www/brainnel.com/*
sudo cp -r ./dist/* /var/www/brainnel.com/

echo "🔐 设置权限..."
sudo chown -R www-data:www-data /var/www/brainnel.com
sudo chmod -R 755 /var/www/brainnel.com

echo "🔄 验证并重新加载 Nginx..."
if sudo nginx -t; then
    sudo systemctl reload nginx
    echo "✅ Nginx 重新加载成功"
else
    echo "❌ Nginx 配置测试失败"
    exit 1
fi

echo "🌐 测试网站访问..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://www.brainnel.com || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ 网站访问正常 (HTTP $HTTP_STATUS)"
else
    echo "⚠️  网站可能有问题 (HTTP $HTTP_STATUS)"
fi

echo "✅ CI/CD 部署完成！"
echo "🌐 网站地址：https://www.brainnel.com"
echo "📊 部署时间：$(date)"
