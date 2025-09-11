import axios from 'axios'

const BASE_URL = 'https://api.brainnel.com/test'

// 创建axios实例
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

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
      const response = await api.get(`/api/flash-local/?${queryParams}`)
      return response.data
    } catch (error) {
      console.error('获取产品列表失败:', error)
      throw error
    }
  },

  // 获取单个产品详情
  getProductDetail: async (productId) => {
    try {
      const response = await api.get(`/api/flash-local/${productId}`)
      return response.data
    } catch (error) {
      console.error('获取产品详情失败:', error)
      throw error
    }
  }
}

// 分类相关接口
export const categoryAPI = {
  // 获取一级分类列表
  getLevel1Categories: async () => {
    try {
      const response = await api.get('/api/flash-local/categories/level1/')
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
      const response = await api.get('/api/flash-local/pickup-locations/')
      return response.data
    } catch (error) {
      console.error('获取取货点列表失败:', error)
      throw error
    }
  }
}

// 订单相关接口
export const orderAPI = {
  // 创建订单
  createOrder: async (orderData) => {
    try {
      const response = await api.post('/api/flash-local/orders/', orderData)
      // 返回完整的响应对象，而不只是data
      return response
    } catch (error) {
      console.error('创建订单失败:', error)
      throw error
    }
  }
}

export default api
