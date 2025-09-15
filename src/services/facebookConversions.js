/**
 * Facebook 转化 API (Conversions API) 服务
 * 用于服务器端事件回传，提高转化跟踪准确性
 */

import { getCurrentConfig } from '../config/api.config.js'

// Facebook 转化 API 配置
const FACEBOOK_CONFIG = {
  // Facebook Pixel ID
  PIXEL_ID: '793391936977534',
  
  // 转化 API 基础 URL
  CONVERSION_API_BASE_URL: 'https://graph.facebook.com/v18.0',
  
  // 访问令牌 - 应该从环境变量获取
  ACCESS_TOKEN: import.meta.env.VITE_FACEBOOK_ACCESS_TOKEN || '',
  
  // 测试事件代码 - 用于测试环境
  TEST_EVENT_CODE: import.meta.env.VITE_FACEBOOK_TEST_EVENT_CODE || ''
}

/**
 * 生成用户数据哈希
 * Facebook 要求敏感数据必须进行 SHA-256 哈希处理
 */
const hashUserData = async (data) => {
  if (!data) return null
  
  // 标准化数据（去除空格，转小写）
  const normalized = data.toString().trim().toLowerCase()
  
  // 如果在浏览器环境中，使用 Web Crypto API
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder()
      const data = encoder.encode(normalized)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    } catch (error) {
      console.warn('浏览器端哈希处理失败，返回原始数据:', error)
      return normalized
    }
  }
  
  // 如果没有 crypto API，返回标准化数据（实际生产中应该在服务器端处理）
  return normalized
}

/**
 * 构建用户数据对象
 */
const buildUserData = async (userInfo, clientInfo = {}) => {
  const userData = {}
  
  // 用户基本信息（需要哈希处理）
  if (userInfo.email) {
    userData.em = [await hashUserData(userInfo.email)]
  }
  
  if (userInfo.phone) {
    // 电话号码格式化（去除非数字字符，添加国际区号）
    let phone = userInfo.phone.toString().replace(/\D/g, '')
    if (phone.startsWith('0')) {
      phone = '237' + phone.substring(1) // 喀麦隆国际区号
    } else if (!phone.startsWith('237')) {
      phone = '237' + phone
    }
    userData.ph = [await hashUserData(phone)]
  }
  
  if (userInfo.firstName) {
    userData.fn = [await hashUserData(userInfo.firstName)]
  }
  
  if (userInfo.lastName) {
    userData.ln = [await hashUserData(userInfo.lastName)]
  }
  
  if (userInfo.city) {
    userData.ct = [await hashUserData(userInfo.city)]
  }
  
  if (userInfo.country) {
    userData.country = [await hashUserData(userInfo.country)]
  }
  
  // 客户端信息（不需要哈希处理）
  if (clientInfo.userAgent) {
    userData.client_user_agent = clientInfo.userAgent
  }
  
  if (clientInfo.clientIpAddress) {
    userData.client_ip_address = clientInfo.clientIpAddress
  }
  
  if (clientInfo.fbc) {
    userData.fbc = clientInfo.fbc
  }
  
  if (clientInfo.fbp) {
    userData.fbp = clientInfo.fbp
  }
  
  return userData
}

/**
 * 发送转化事件到 Facebook
 */
const sendConversionEvent = async (eventData) => {
  const config = getCurrentConfig()
  
  if (!FACEBOOK_CONFIG.ACCESS_TOKEN) {
    console.warn('⚠️ Facebook Access Token 未配置，跳过服务器端事件发送')
    return { success: false, error: 'Access token not configured' }
  }
  
  const url = `${FACEBOOK_CONFIG.CONVERSION_API_BASE_URL}/${FACEBOOK_CONFIG.PIXEL_ID}/events`
  
  const requestData = {
    data: [eventData],
    // 测试环境使用测试事件代码
    ...(FACEBOOK_CONFIG.TEST_EVENT_CODE && {
      test_event_code: FACEBOOK_CONFIG.TEST_EVENT_CODE
    })
  }
  
  try {
    // 如果在浏览器环境，我们实际上需要通过后端发送这个请求
    // 这里只是示例代码，实际应该发送到你的后端API
    if (config.LOG_REQUESTS) {
      console.log('📊 Facebook 转化事件数据:', {
        url,
        data: JSON.stringify(requestData, null, 2)
      })
    }
    
    // 通过后端API发送Facebook转化事件
    // 使用现有的API服务
    const { facebookAPI } = await import('./api.js')
    const response = await facebookAPI.sendConversionEvent({
      pixel_id: FACEBOOK_CONFIG.PIXEL_ID,
      access_token: FACEBOOK_CONFIG.ACCESS_TOKEN,
      test_event_code: FACEBOOK_CONFIG.TEST_EVENT_CODE,
      event_data: eventData
    })
    
    if (response && response.success !== false) {
      if (config.LOG_RESPONSES) {
        console.log('✅ Facebook 转化事件发送成功:', response)
      }
      return { success: true, data: response }
    } else {
      console.error('❌ Facebook 转化事件发送失败:', response?.error)
      return { success: false, error: response?.error }
    }
    
  } catch (error) {
    console.error('❌ 发送 Facebook 转化事件时出错:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 跟踪购买事件
 */
export const trackPurchaseEvent = async (orderData, userInfo, clientInfo = {}) => {
  try {
    const userData = await buildUserData(userInfo, clientInfo)
    
    // 生成事件时间戳（Unix时间戳）
    const eventTime = Math.floor(Date.now() / 1000)
    
    // 构建自定义数据
    const customData = {
      currency: 'XAF', // 中非金融合作法郎
      value: parseFloat(orderData.totalPrice || 0),
      content_type: 'product',
      content_ids: [orderData.productId?.toString()],
      contents: [{
        id: orderData.productId?.toString(),
        quantity: parseInt(orderData.quantity || 1),
        price: parseFloat(orderData.unitPrice || 0)
      }],
      num_items: parseInt(orderData.quantity || 1)
    }
    
    // 如果有订单号，添加到自定义数据
    if (orderData.orderNo) {
      customData.order_id = orderData.orderNo
    }
    
    const eventData = {
      event_name: 'Purchase',
      event_time: eventTime,
      user_data: userData,
      custom_data: customData,
      event_source_url: window.location.href,
      action_source: 'website'
    }
    
    // 添加事件ID，用于去重
    if (orderData.orderNo) {
      eventData.event_id = `purchase_${orderData.orderNo}`
    }
    
    return await sendConversionEvent(eventData)
    
  } catch (error) {
    console.error('❌ 跟踪购买事件失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 跟踪添加支付信息事件
 */
export const trackAddPaymentInfoEvent = async (orderData, userInfo, clientInfo = {}) => {
  try {
    const userData = await buildUserData(userInfo, clientInfo)
    const eventTime = Math.floor(Date.now() / 1000)
    
    const customData = {
      currency: 'XAF',
      value: parseFloat(orderData.totalPrice || 0),
      content_type: 'product',
      content_ids: [orderData.productId?.toString()]
    }
    
    const eventData = {
      event_name: 'AddPaymentInfo',
      event_time: eventTime,
      user_data: userData,
      custom_data: customData,
      event_source_url: window.location.href,
      action_source: 'website'
    }
    
    return await sendConversionEvent(eventData)
    
  } catch (error) {
    console.error('❌ 跟踪添加支付信息事件失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 跟踪初始化结账事件
 */
export const trackInitiateCheckoutEvent = async (orderData, userInfo, clientInfo = {}) => {
  try {
    const userData = await buildUserData(userInfo, clientInfo)
    const eventTime = Math.floor(Date.now() / 1000)
    
    const customData = {
      currency: 'XAF',
      value: parseFloat(orderData.totalPrice || 0),
      content_type: 'product',
      content_ids: [orderData.productId?.toString()],
      num_items: parseInt(orderData.quantity || 1)
    }
    
    const eventData = {
      event_name: 'InitiateCheckout',
      event_time: eventTime,
      user_data: userData,
      custom_data: customData,
      event_source_url: window.location.href,
      action_source: 'website'
    }
    
    return await sendConversionEvent(eventData)
    
  } catch (error) {
    console.error('❌ 跟踪初始化结账事件失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 获取客户端信息
 * 用于增强用户数据匹配
 */
export const getClientInfo = () => {
  const clientInfo = {
    userAgent: navigator.userAgent,
    // 客户端IP地址需要从服务器获取
    clientIpAddress: null
  }
  
  // 尝试获取Facebook点击ID和浏览器ID
  try {
    // 从URL参数或Cookie获取fbclid
    const urlParams = new URLSearchParams(window.location.search)
    const fbclid = urlParams.get('fbclid') || getCookie('_fbc')
    if (fbclid) {
      clientInfo.fbc = fbclid.startsWith('fb.') ? fbclid : `fb.1.${Date.now()}.${fbclid}`
    }
    
    // 从Cookie获取Facebook浏览器ID
    const fbp = getCookie('_fbp')
    if (fbp) {
      clientInfo.fbp = fbp
    }
    
  } catch (error) {
    console.warn('获取客户端信息时出错:', error)
  }
  
  return clientInfo
}

/**
 * 获取Cookie值
 */
const getCookie = (name) => {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop().split(';').shift()
  return null
}

/**
 * 设置Facebook点击ID到Cookie
 */
export const setFacebookClickId = (fbclid) => {
  if (fbclid) {
    const fbc = fbclid.startsWith('fb.') ? fbclid : `fb.1.${Date.now()}.${fbclid}`
    // 设置Cookie，有效期7天
    document.cookie = `_fbc=${fbc}; max-age=604800; path=/`
  }
}

export default {
  trackPurchaseEvent,
  trackAddPaymentInfoEvent,
  trackInitiateCheckoutEvent,
  getClientInfo,
  setFacebookClickId
}