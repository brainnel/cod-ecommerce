/**
 * URL参数解析工具
 * 用于从URL中提取各种参数，特别是付费广告追踪参数
 */

const GOOGLE_SOURCE_VALUES = new Set(['google', 'google_ads', 'googleads', 'adwords'])

const cleanParamValue = (value) => {
  const text = String(value || '').trim()
  return text || null
}

const shortParamValue = (value, maxLength = 32) => {
  const text = cleanParamValue(value)
  if (!text) return null
  return text.slice(0, maxLength)
}

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
    fbclid: getUrlParam('fbclid'),
    gclid: getUrlParam('gclid'),
    gbraid: getUrlParam('gbraid'),
    wbraid: getUrlParam('wbraid'),
    gad_source: getUrlParam('gad_source'),
    google_campaign_id: getUrlParam('google_campaign_id') || getUrlParam('g_campaignid') || getUrlParam('campaignid'),
    google_adgroup_id: getUrlParam('google_adgroup_id') || getUrlParam('g_adgroupid') || getUrlParam('adgroupid'),
    google_creative_id: getUrlParam('google_creative_id') || getUrlParam('g_creative') || getUrlParam('creative')
  }
  
  // 调试日志
  if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
    console.log('=== UTM参数提取结果 ===')
    console.log('完整UTM参数:', utmParams)
    console.log('===================')
  }
  
  return utmParams
}

export const getGoogleAdsParams = () => {
  return {
    gclid: cleanParamValue(getUrlParam('gclid')),
    gbraid: cleanParamValue(getUrlParam('gbraid')),
    wbraid: cleanParamValue(getUrlParam('wbraid')),
    gad_source: cleanParamValue(getUrlParam('gad_source')),
    campaign_id: cleanParamValue(getUrlParam('google_campaign_id') || getUrlParam('g_campaignid') || getUrlParam('campaignid') || getUrlParam('utm_id')),
    adgroup_id: cleanParamValue(getUrlParam('google_adgroup_id') || getUrlParam('g_adgroupid') || getUrlParam('adgroupid')),
    creative_id: cleanParamValue(getUrlParam('google_creative_id') || getUrlParam('g_creative') || getUrlParam('creative')),
    keyword: cleanParamValue(getUrlParam('keyword') || getUrlParam('utm_term')),
    matchtype: cleanParamValue(getUrlParam('matchtype')),
    network: cleanParamValue(getUrlParam('network')),
    device: cleanParamValue(getUrlParam('device')),
    placement: cleanParamValue(getUrlParam('placement')),
    target_id: cleanParamValue(getUrlParam('targetid')),
    loc_interest_ms: cleanParamValue(getUrlParam('loc_interest_ms')),
    loc_physical_ms: cleanParamValue(getUrlParam('loc_physical_ms'))
  }
}

export const isFromGoogleAd = () => {
  const utmSource = cleanParamValue(getUrlParam('utm_source'))?.toLowerCase()
  const googleParams = getGoogleAdsParams()
  return GOOGLE_SOURCE_VALUES.has(utmSource) ||
    !!googleParams.gclid ||
    !!googleParams.gbraid ||
    !!googleParams.wbraid ||
    !!googleParams.gad_source
}

export const getGoogleAdIdFromUrl = () => {
  if (!isFromGoogleAd()) return null

  const googleParams = getGoogleAdsParams()
  const utmContent = cleanParamValue(getUrlParam('utm_content'))

  if (googleParams.creative_id) return `google:creative:${shortParamValue(googleParams.creative_id, 40)}`
  if (utmContent) return `google:content:${shortParamValue(utmContent, 40)}`
  if (googleParams.adgroup_id) return `google:adgroup:${shortParamValue(googleParams.adgroup_id, 40)}`
  if (googleParams.campaign_id) return `google:campaign:${shortParamValue(googleParams.campaign_id, 40)}`
  if (googleParams.gclid) return `google:gclid:${shortParamValue(googleParams.gclid, 24)}`
  if (googleParams.gbraid) return `google:gbraid:${shortParamValue(googleParams.gbraid, 24)}`
  if (googleParams.wbraid) return `google:wbraid:${shortParamValue(googleParams.wbraid, 24)}`

  return 'google'
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
 * 检查当前页面是否来自TikTok广告
 * @returns {boolean} 是否来自TikTok广告
 */
export const isFromTikTokAd = () => {
  const utmSource = getUrlParam('utm_source')
  return utmSource === 'tiktok' || utmSource === 'tt'
}

/**
 * 获取广告来源标识
 * 优先返回Facebook广告ID（纯数字），其次返回utm_source的值
 * @returns {string|null} 广告来源标识
 */
export const getAdSource = () => {
  // 1. Google 广告先识别，避免 Google creative 数字 ID 被误判成 Meta ad_id。
  const googleAdId = getGoogleAdIdFromUrl()
  if (googleAdId) {
    return googleAdId
  }

  // 2. 检查是否有Facebook广告ID（utm_content为纯数字）
  const fbAdId = getAdIdFromUrl()
  if (fbAdId) {
    return fbAdId
  }

  // 3. 返回utm_source的值（不管是什么都保存）
  const utmSource = getUrlParam('utm_source')
  if (utmSource) {
    if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
      console.log('✅ 识别广告来源:', utmSource)
    }
    return utmSource
  }

  return null
}

/**
 * 获取完整的广告追踪信息
 * @returns {object} 包含广告ID和相关追踪信息的对象
 */
export const getAdTrackingInfo = () => {
  const adSource = getAdSource()
  const utmParams = getUtmParams()
  const isFromFb = isFromFacebookAd()
  const isFromTt = isFromTikTokAd()
  const isFromGoogle = isFromGoogleAd()
  const googleAdsParams = getGoogleAdsParams()

  const trackingInfo = {
    ad_id: adSource,
    ad_source: isFromGoogle ? 'google' : isFromFb ? 'facebook' : isFromTt ? 'tiktok' : (utmParams.utm_source || null),
    traffic_source: isFromGoogle ? 'google_ads' : isFromFb ? 'meta_ads' : isFromTt ? 'tiktok_ads' : null,
    utm_params: utmParams,
    google_ads: googleAdsParams,
    is_from_facebook: isFromFb,
    is_from_tiktok: isFromTt,
    is_from_google: isFromGoogle,
    captured_at: new Date().toISOString(),
    url: window.location.href
  }

  // 调试日志
  if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
    console.log('=== 广告追踪信息 ===')
    console.log('广告来源:', adSource)
    console.log('是否来自Facebook:', isFromFb)
    console.log('是否来自TikTok:', isFromTt)
    console.log('完整追踪信息:', trackingInfo)
    console.log('==================')
  }

  return trackingInfo
}
