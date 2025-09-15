/**
 * URL参数解析工具
 * 用于从URL中提取各种参数，特别是Facebook广告追踪参数
 */

/**
 * 从当前URL中获取指定的查询参数
 * @param {string} paramName - 参数名称
 * @returns {string|null} 参数值，不存在时返回null
 */
export const getUrlParam = (paramName) => {
  try {
    const urlParams = new URLSearchParams(window.location.search)
    const value = urlParams.get(paramName)
    
    // 调试日志
    if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
      console.log(`🔍 获取URL参数 ${paramName}:`, value)
    }
    
    return value
  } catch (error) {
    console.error('获取URL参数失败:', error)
    return null
  }
}

/**
 * 从URL中提取所有UTM参数
 * @returns {object} UTM参数对象
 */
export const getUtmParams = () => {
  const utmParams = {
    utm_source: getUrlParam('utm_source'),
    utm_medium: getUrlParam('utm_medium'), 
    utm_campaign: getUrlParam('utm_campaign'),
    utm_content: getUrlParam('utm_content'),
    utm_term: getUrlParam('utm_term'),
    utm_id: getUrlParam('utm_id'),
    fbclid: getUrlParam('fbclid')
  }
  
  // 调试日志
  if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
    console.log('=== UTM参数提取结果 ===')
    console.log('完整UTM参数:', utmParams)
    console.log('===================')
  }
  
  return utmParams
}

/**
 * 从utm_content参数中提取Facebook广告ID
 * 根据你提供的示例: utm_content=120234195461580432
 * @returns {string|null} 广告ID，不存在时返回null
 */
export const getAdIdFromUrl = () => {
  const utmContent = getUrlParam('utm_content')
  
  if (!utmContent) {
    if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
      console.log('❌ 未找到utm_content参数，无法提取广告ID')
    }
    return null
  }
  
  // 验证utm_content是否为纯数字（Facebook广告ID格式）
  const adId = utmContent.trim()
  const isValidAdId = /^\d+$/.test(adId)
  
  if (!isValidAdId) {
    if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
      console.warn('⚠️ utm_content不是有效的广告ID格式:', adId)
    }
    return null
  }
  
  // 调试日志
  if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
    console.log('✅ 成功提取Facebook广告ID:', adId)
  }
  
  return adId
}

/**
 * 检查当前页面是否来自Facebook广告
 * @returns {boolean} 是否来自Facebook广告
 */
export const isFromFacebookAd = () => {
  const utmSource = getUrlParam('utm_source')
  const utmMedium = getUrlParam('utm_medium')
  const fbclid = getUrlParam('fbclid')
  
  return (utmSource === 'fb' || utmSource === 'facebook') && 
         (utmMedium === 'paid' || utmMedium === 'cpc') ||
         !!fbclid
}

/**
 * 获取完整的广告追踪信息
 * @returns {object} 包含广告ID和相关追踪信息的对象
 */
export const getAdTrackingInfo = () => {
  const adId = getAdIdFromUrl()
  const utmParams = getUtmParams()
  const isFromFb = isFromFacebookAd()
  
  const trackingInfo = {
    ad_id: adId,
    utm_params: utmParams,
    is_from_facebook: isFromFb,
    captured_at: new Date().toISOString(),
    url: window.location.href
  }
  
  // 调试日志
  if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
    console.log('=== 广告追踪信息 ===')
    console.log('广告ID:', adId)
    console.log('是否来自Facebook:', isFromFb)
    console.log('完整追踪信息:', trackingInfo)
    console.log('==================')
  }
  
  return trackingInfo
}