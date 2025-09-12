# 自动部署文档

## GitHub Actions 自动部署流程

本项目已配置GitHub Actions自动部署，当代码推送到main分支时会自动触发部署。

### 部署流程
1. 推送代码到 `main` 分支
2. GitHub Actions 自动触发
3. 在GitHub的runner上构建项目
4. SSH连接到服务器执行部署脚本
5. 自动部署到生产环境

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

# 或使用CI脚本
./deploy-ci.sh
```

### 网站地址
- 生产环境: https://www.brainnel.com

### 构建命令
- 开发模式: `npm run dev`
- 生产构建: `npm run build`
- 代码检查: `npm run lint`
