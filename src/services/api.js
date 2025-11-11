import axios from 'axios'
import { getCurrentConfig, API_ENDPOINTS } from '../config/api.config.js'

// 获取当前环境配置
const config = getCurrentConfig()

// 创建axios实例
const api = axios.create({
  baseURL: config.BASE_URL,
  timeout: config.TIMEOUT,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器 - 根据环境配置决定是否记录日志
api.interceptors.request.use(
  (requestConfig) => {
    if (config.LOG_REQUESTS) {
      console.log('🚀 发送请求:', {
        method: requestConfig.method?.toUpperCase(),
        url: requestConfig.url,
        baseURL: requestConfig.baseURL,
        fullURL: `${requestConfig.baseURL}${requestConfig.url}`,
        data: requestConfig.data,
        timeout: requestConfig.timeout
      })
    }
    return requestConfig
  },
  (error) => {
    if (config.LOG_REQUESTS) {
      console.error('❌ 请求拦截器错误:', error)
    }
    return Promise.reject(error)
  }
)

// 响应拦截器 - 根据环境配置决定是否记录日志
api.interceptors.response.use(
  (response) => {
    if (config.LOG_RESPONSES) {
      console.log('✅ 收到响应:', {
        status: response.status,
        statusText: response.statusText,
        url: response.config.url,
        data: response.data
      })
    }
    return response
  },
  (error) => {
    if (config.LOG_RESPONSES) {
      console.error('❌ 响应错误:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        fullURL: error.config ? `${error.config.baseURL}${error.config.url}` : 'unknown',
        responseData: error.response?.data
      })
    }
    return Promise.reject(error)
  }
)

// 产品相关接口
export const productAPI = {
  // 获取产品列表
  getProductList: async (params = {}) => {
    const { page = 1, page_size = 20, category_id } = params
    const queryParams = new URLSearchParams({
      page: page.toString(),
      page_size: page_size.toString()
    })
    
    if (category_id) {
      queryParams.append('category_id', category_id.toString())
    }
    
    try {
      const response = await api.get(`${API_ENDPOINTS.PRODUCTS}/?${queryParams}`)
      return response.data
    } catch (error) {
      console.error('获取产品列表失败:', error)
      throw error
    }
  },

  // 获取单个产品详情
  getProductDetail: async (productId) => {
    try {
      const response = await api.get(`${API_ENDPOINTS.PRODUCT_DETAIL(productId)}`)
      return response.data
    } catch (error) {
      console.error('获取产品详情失败:', error)
      throw error
    }
  },

  // 获取产品变体列表
  getProductVariants: async (productId) => {
    try {
      const response = await api.get(`${API_ENDPOINTS.PRODUCTS}/products/${productId}/variants/`)
      return response.data
    } catch (error) {
      console.error('获取产品变体失败:', error)
      return []
    }
  }
}

// 分类相关接口
export const categoryAPI = {
  // 获取一级分类列表
  getLevel1Categories: async () => {
    try {
      const response = await api.get(`${API_ENDPOINTS.CATEGORIES}/`)
      return response.data
    } catch (error) {
      console.error('获取分类列表失败:', error)
      throw error
    }
  }
}

// 取货点相关接口
export const pickupAPI = {
  // 获取取货点列表
  getPickupLocations: async () => {
    try {
      const response = await api.get(`${API_ENDPOINTS.PICKUP_LOCATIONS}/`)
      return response.data
    } catch (error) {
      console.error('获取取货点列表失败:', error)
      throw error
    }
  }
}

// 大区相关接口
export const districtAPI = {
  // 获取城市和大区列表
  getCitiesAndDistricts: async () => {
    try {
      const response = await api.get('/api/flash-local/cities-and-districts/')
      return response.data
    } catch (error) {
      console.error('获取城市和大区列表失败:', error)
      throw error
    }
  },
  
  // 获取所有城市（包含大区和坐标）
  getAllDistricts: async () => {
    try {
      const response = await api.get('/api/flash-local/cities-and-districts/')
      // 直接返回城市数据，保留districts结构
      return response.data
    } catch (error) {
      console.error('获取城市列表失败:', error)
      throw error
    }
  }
}

// 订单相关接口
export const orderAPI = {
  // 创建订单
  createOrder: async (orderData) => {
    try {
      // 确保orderData包含必要的字段，包括ad_id
      const requestData = {
        ...orderData,
        // 如果没有提供ad_id，确保字段存在但值为null
        ad_id: orderData.ad_id || null
      }
      
      // 调试日志 - 记录包含ad_id的完整请求数据
      if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
        console.log('=== 创建订单请求数据 ===')
        console.log('广告ID (ad_id):', requestData.ad_id)
        console.log('完整订单数据:', JSON.stringify(requestData, null, 2))
        console.log('==========================')
      }
      
      const response = await api.post(`${API_ENDPOINTS.ORDERS}/`, requestData)
      // 返回完整的响应对象，而不只是data
      return response
    } catch (error) {
      console.error('创建订单失败:', error)
      throw error
    }
  }
}

// 创建 Facebook API 专用客户端
const createFacebookAPIClient = () => {
  const config = getCurrentConfig()
  return axios.create({
    baseURL: config.FACEBOOK_API_URL,
    timeout: config.TIMEOUT,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

// Facebook 转化 API 相关接口
export const facebookAPI = {
  // 发送转化事件到你的服务器（服务器再转发到Facebook）
  sendConversionEvent: async (eventData) => {
    try {
      const facebookClient = createFacebookAPIClient()
      const response = await facebookClient.post(`${API_ENDPOINTS.FACEBOOK_CONVERSIONS}`, eventData)
      return response.data
    } catch (error) {
      console.error('发送Facebook转化事件失败:', error)
      // 不抛出错误，因为转化事件失败不应该影响主要业务流程
      return { success: false, error: error.message }
    }
  }
}

export default api
