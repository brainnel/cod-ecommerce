#!/bin/bash

# CI/CD 部署脚本 - 适用于 GitHub Actions
# 用于自动化部署 Brainnel.com
#
#   bash deploy-ci.sh --dist <archive.tgz> --sha256 <hex>
#       GitHub Actions 已构建好的版本：校验后直接发布，本机不安装依赖、不构建（默认路径）。
#   bash deploy-ci.sh
#       本机构建再发布（手动备用路径）。

set -euo pipefail

# Archives uploaded by GitHub Actions; kept as rollback material like the webroot backups.
ARTIFACT_DIR=/home/admin/cod-deploy-artifacts
DIST_ARCHIVE=""
DIST_SHA256=""
while [ $# -gt 0 ]; do
    case "$1" in
        --dist) DIST_ARCHIVE="${2:-}"; shift 2 ;;
        --sha256) DIST_SHA256="${2:-}"; shift 2 ;;
        *) echo "❌ 未知参数: $1"; exit 1 ;;
    esac
done

echo "🚀 开始 CI/CD 自动部署..."

# 检查必要的环境
if [ ! -d "/home/admin/projects/cod-ecommerce" ]; then
    echo "❌ 项目目录不存在"
    exit 1
fi

cd /home/admin/projects/cod-ecommerce

for REQUIRED_COMMAND in git npm rsync curl flock tar sha256sum; do
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

if [ -n "$DIST_ARCHIVE" ]; then
    echo "📦 使用 GitHub Actions 构建好的版本（本机不构建）..."
    case "$DIST_ARCHIVE" in
        "$ARTIFACT_DIR"/brainnel-dist-*.tgz) ;;
        *) echo "❌ 构建包必须位于 $ARTIFACT_DIR"; exit 1 ;;
    esac
    [ -f "$DIST_ARCHIVE" ] || { echo "❌ 构建包不存在: $DIST_ARCHIVE"; exit 1; }
    [[ "$DIST_SHA256" =~ ^[0-9a-f]{64}$ ]] || { echo "❌ 缺少或无效的 --sha256"; exit 1; }
    # Verify before extracting anything: a truncated or foreign upload never reaches the webroot.
    echo "$DIST_SHA256  $DIST_ARCHIVE" | sha256sum -c --quiet - || { echo "❌ 构建包校验失败"; exit 1; }
    DIST_DIR=$(mktemp -d "${DIST_ARCHIVE%.tgz}.XXXXXXXX")
    tar -xzf "$DIST_ARCHIVE" -C "$DIST_DIR" --no-same-owner
else
    echo "📦 安装/更新依赖..."
    npm ci --include=dev

    echo "🏗️ 构建生产版本..."
    npm run build:prod
    DIST_DIR=./dist
fi

# 检查构建产物
if [ ! -d "$DIST_DIR" ] || [ ! -f "$DIST_DIR/index.html" ]; then
    echo "❌ 构建产物不完整 - $DIST_DIR/index.html 不存在"
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
        --chown=www-data:www-data --chmod=D755,F644 "$DIST_DIR/" "$SITE/"

    echo "🔀 最后原子替换 $SITE/index.html ..."
    # mktemp lives in the destination directory: mv is a same-filesystem rename.
    # Until the rename succeeds, readers continue seeing the previous entrypoint.
    INDEX_TMP=$(sudo mktemp "$SITE/.index.html.deploy.XXXXXXXX")
    sudo install -o www-data -g www-data -m 644 "$DIST_DIR/index.html" "$INDEX_TMP"
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
