/**
 * API 配置文件
 * 统一管理所有API相关的配置
 */

// 环境配置
const ENV = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production'
}

// 当前环境 - 可以通过环境变量控制
const CURRENT_ENV = import.meta.env.VITE_API_ENV || 
                    (import.meta.env.PROD ? ENV.PRODUCTION : ENV.DEVELOPMENT)

// API 基础配置
const API_CONFIG = {
  [ENV.DEVELOPMENT]: {
    BASE_URL: 'https://api.brainnel.com/test', // 测试环境
    TIMEOUT: 30000, // 30秒
    LOG_REQUESTS: true, // 开发环境记录请求日志
    LOG_RESPONSES: true, // 开发环境记录响应日志
    FACEBOOK_API_URL: 'https://api.brainnel.com/test' // Facebook API 服务器
  },
  [ENV.PRODUCTION]: {
    BASE_URL: 'https://api.brainnel.com/backend', // 生产环境
    TIMEOUT: 30000, // 30秒
    LOG_REQUESTS: false, // 生产环境不记录请求日志
    LOG_RESPONSES: false, // 生产环境不记录响应日志
    FACEBOOK_API_URL: 'https://api.brainnel.com/backend' // Facebook API 服务器
  }
}

// 获取当前环境的配置
export const getCurrentConfig = () => {
  const baseConfig = API_CONFIG[CURRENT_ENV]
  
  // 允许环境变量覆盖默认配置
  const config = {
    ...baseConfig,
    BASE_URL: import.meta.env.VITE_API_BASE_URL || baseConfig.BASE_URL,
    LOG_REQUESTS: import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true' ? baseConfig.LOG_REQUESTS : false,
    LOG_RESPONSES: import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true' ? baseConfig.LOG_RESPONSES : false
  }
  
  if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
    console.log(`🌍 当前环境: ${CURRENT_ENV}`)
    console.log(`🔗 API基础地址: ${config.BASE_URL}`)
    console.log(`📝 请求日志: ${config.LOG_REQUESTS ? '开启' : '关闭'}`)
    console.log(`📝 响应日志: ${config.LOG_RESPONSES ? '开启' : '关闭'}`)
  }
  
  return config
}

// API 端点配置
export const API_ENDPOINTS = {
  // 产品相关
  PRODUCTS: '/api/flash-local',
  PRODUCT_DETAIL: (id) => `/api/flash-local/${id}`,
  CATEGORIES: '/api/flash-local/categories/level1',
  
  // 订单相关
  ORDERS: '/api/flash-local/orders',
  
  // 取货点相关
  PICKUP_LOCATIONS: '/api/flash-local/pickup-locations',
  
  // Facebook 转化 API
  FACEBOOK_CONVERSIONS: '/api/facebook-conversions'
}

// 构建完整的API URL
export const buildApiUrl = (endpoint) => {
  const config = getCurrentConfig()
  return `${config.BASE_URL}${endpoint}`
}

// 导出配置
export default getCurrentConfig()
