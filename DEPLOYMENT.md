# 自动部署文档

## GitHub Actions 自动部署流程

本项目已配置GitHub Actions自动部署，当代码推送到main分支时会自动触发部署。

### 部署流程
1. 推送代码到 `main` 分支
2. GitHub Actions 自动触发，在 GitHub 的 runner 上测试并构建（`npm test && npm run build:prod`），只构建这一次
3. 把 `dist` 打包成 `brainnel-dist-<commit>.tgz`，计算 SHA-256，上传到服务器 `/home/admin/cod-deploy-artifacts/`
4. SSH 到服务器，快进更新代码后执行 `deploy-ci.sh --dist <包> --sha256 <值>`：先校验，再解压，服务器上不安装依赖、不构建
5. 先同步新资源（保留旧的 hash 文件），最后原子替换 `index.html`，两个站点（brainnel.com、brainnel-vite.com）同时更新；正在浏览的访客不受影响

上传的包和解压目录都保留在 `/home/admin/cod-deploy-artifacts/`，和 webroot 备份一样可以作为回滚材料（约 1 MB/次）。

### 必需的GitHub Secrets
- `HOST`: 服务器IP地址 (13.245.80.24)
- `USERNAME`: SSH用户名 (admin)
- `PORT`: SSH端口 (22)
- `SSH_PRIVATE_KEY`: SSH私钥

### 本地部署命令
如需手动部署，可以使用：
```bash
# 使用原始部署脚本
./deploy.sh

# 或在服务器上用 CI 脚本本机构建再发布（备用路径，会占用服务器 CPU 约 1 分钟）
bash deploy-ci.sh
```

### 网站地址
- 生产环境: https://www.brainnel.com

### 构建命令
- 开发模式: `npm run dev`
- 生产构建: `npm run build`
- 代码检查: `npm run lint`
