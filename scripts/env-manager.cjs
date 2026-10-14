#!/usr/bin/env node

/**
 * 环境管理脚本
 * 用于在不同环境之间快速切换
 */

const fs = require('fs')
const path = require('path')

const envFiles = {
  dev: '.env.development',
  prod: '.env.production'
}

const targetEnvFile = '.env'

function switchEnv(env) {
  if (!envFiles[env]) {
    console.error(`❌ 无效的环境: ${env}`)
    console.log('可用环境: dev (开发), prod (生产)')
    process.exit(1)
  }

  const sourceFile = path.join(__dirname, '..', envFiles[env])
  const targetFile = path.join(__dirname, '..', targetEnvFile)

  if (!fs.existsSync(sourceFile)) {
    console.error(`❌ 环境配置文件不存在: ${sourceFile}`)
    process.exit(1)
  }

  try {
    fs.copyFileSync(sourceFile, targetFile)
    console.log(`✅ 已切换到 ${env === 'dev' ? '开发' : '生产'} 环境`)
    console.log(`📁 使用配置文件: ${envFiles[env]}`)
    
    // Do not print environment values into local or deployment logs.
  } catch (error) {
    console.error('❌ 切换环境失败:', error.message)
    process.exit(1)
  }
}

function showCurrentEnv() {
  const envFile = path.join(__dirname, '..', targetEnvFile)
  
  if (!fs.existsSync(envFile)) {
    console.log('❌ 未找到环境配置文件')
    return
  }

  const content = fs.readFileSync(envFile, 'utf8')
  const envMatch = content.match(/VITE_API_ENV=(\w+)/)
  const urlMatch = content.match(/VITE_API_BASE_URL=(.+)/)
  
  if (envMatch && urlMatch) {
    const env = envMatch[1]
    const url = urlMatch[1]
    
    console.log('🌍 当前环境配置:')
    console.log(`   环境: ${env === 'development' ? '开发环境' : '生产环境'} (${env})`)
    console.log(`   API地址: ${url}`)
  } else {
    console.log('📋 .env 配置已存在；未识别到环境/地址字段，不输出配置值。')
  }
}

// 解析命令行参数
const command = process.argv[2]

switch (command) {
  case 'dev':
    switchEnv('dev')
    break
  case 'prod':
    switchEnv('prod')
    break
  case 'status':
  case undefined:
    showCurrentEnv()
    break
  default:
    console.log('🚀 环境管理工具')
    console.log('')
    console.log('用法:')
    console.log('  node scripts/env-manager.js dev     # 切换到开发环境')
    console.log('  node scripts/env-manager.js prod    # 切换到生产环境')
    console.log('  node scripts/env-manager.js status  # 显示当前环境')
    console.log('  node scripts/env-manager.js         # 显示当前环境')
}
