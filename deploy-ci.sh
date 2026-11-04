#!/bin/bash

# CI/CD 部署脚本 - 适用于 GitHub Actions
# 用于自动化部署 Brainnel.com

set -euo pipefail

echo "🚀 开始 CI/CD 自动部署..."

# 检查必要的环境
if [ ! -d "/home/admin/projects/cod-ecommerce" ]; then
    echo "❌ 项目目录不存在"
    exit 1
fi

cd /home/admin/projects/cod-ecommerce

for REQUIRED_COMMAND in git npm rsync curl flock; do
    command -v "$REQUIRED_COMMAND" >/dev/null || { echo "❌ 缺少命令: $REQUIRED_COMMAND"; exit 1; }
done
# Serialize manual/script deployments as well as the workflow concurrency guard.
exec 9>.git/brainnel-deploy.lock
flock -n 9 || { echo "❌ 已有前端部署正在运行，请稍后重试"; exit 1; }

echo "📥 拉取最新代码..."
git fetch origin main
if [ -n "$(git status --porcelain)" ]; then
    echo "❌ 工作区有本地修改，停止部署并保留全部修改；请先人工核对。"
    git status --short
    exit 1
fi
git merge --ff-only origin/main

echo "📦 安装/更新依赖..."
npm ci --include=dev

echo "🏗️ 构建生产版本..."
npm run build:prod

# 检查构建是否成功
if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
    echo "❌ 构建失败 - dist 目录或 index.html 不存在"
    exit 1
fi

# 双站点发布: 同一份 dist 发布到两个域名的 webroot
SITES=(/var/www/brainnel.com /var/www/brainnel-vite.com)
BACKUP_TS="$(date +%Y%m%d_%H%M%S)_$$"
INDEX_TMP=""
cleanup_index_tmp() {
    # Only remove the exact temporary index created by mktemp, never a webroot.
    case "$INDEX_TMP" in
        /var/www/brainnel.com/.index.html.deploy.*|/var/www/brainnel-vite.com/.index.html.deploy.*)
            sudo rm -f -- "$INDEX_TMP" ;;
    esac
}
trap cleanup_index_tmp EXIT

# Check both destinations and nginx before publishing anything.
for SITE in "${SITES[@]}"; do
    if [ ! -d "$SITE" ]; then
        echo "❌ $SITE 不存在，停止双站点发布；请先创建目录和 nginx 配置。"
        exit 1
    fi
done
sudo nginx -t

for SITE in "${SITES[@]}"; do
    echo "📁 备份 $SITE ..."
    sudo cp -a -- "$SITE" "$SITE.backup.$BACKUP_TS"

    echo "🚚 先发布资源到 $SITE（保留旧 hash 资源和无关文件）..."
    # No --delete / --inplace: old tabs retain their lazy chunks, and rsync
    # finishes files with a rename instead of exposing partially copied files.
    sudo rsync -a --delay-updates --exclude='/index.html' \
        --chown=www-data:www-data --chmod=D755,F644 ./dist/ "$SITE/"

    echo "🔀 最后原子替换 $SITE/index.html ..."
    # mktemp lives in the destination directory: mv is a same-filesystem rename.
    # Until the rename succeeds, readers continue seeing the previous entrypoint.
    INDEX_TMP=$(sudo mktemp "$SITE/.index.html.deploy.XXXXXXXX")
    sudo install -o www-data -g www-data -m 644 ./dist/index.html "$INDEX_TMP"
    sudo mv -fT -- "$INDEX_TMP" "$SITE/index.html"
    INDEX_TMP=""

    # Backups and old hashed assets are deliberately retained. Do not prune
    # webroot contents here; any retention cleanup needs a separate reviewed plan.
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
