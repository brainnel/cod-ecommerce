/**
 * 广告追踪工具函数
 * 分离自AdTrackingContext以解决Fast Refresh警告
 */

/**
 * 便捷函数：直接获取广告ID
 * @param {object} context - AdTrackingContext值
 * @returns {string|null} 当前的广告ID
 */
export const getAdIdFromContext = (context) => {
  if (!context) {
    throw new Error(
      'getAdIdFromContext必须在AdTrackingProvider内部使用。\n' +
      '请确保你的组件被AdTrackingProvider包裹。'
    )
  }
  return context.adId
}

/**
 * 便捷函数：检查是否有广告ID
 * @param {object} context - AdTrackingContext值
 * @returns {boolean} 是否有广告ID
 */
export const hasAdIdFromContext = (context) => {
  if (!context) {
    throw new Error(
      'hasAdIdFromContext必须在AdTrackingProvider内部使用。\n' +
      '请确保你的组件被AdTrackingProvider包裹。'
    )
  }
  return context.hasAdId
}

/**
 * 便捷函数：获取完整的追踪信息
 * @param {object} context - AdTrackingContext值
 * @returns {object|null} 完整的追踪信息
 */
export const getTrackingInfoFromContext = (context) => {
  if (!context) {
    throw new Error(
      'getTrackingInfoFromContext必须在AdTrackingProvider内部使用。\n' +
      '请确保你的组件被AdTrackingProvider包裹。'
    )
  }
  
  return {
    trackingInfo: context.trackingInfo,
    getCurrentInfo: context.getCurrentTrackingInfo
  }
}