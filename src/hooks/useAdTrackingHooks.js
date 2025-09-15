/**
 * 广告追踪便捷Hooks
 * 从AdTrackingContext分离出来以解决Fast Refresh警告
 */

import { useContext } from 'react'
import AdTrackingContext from '../contexts/AdTrackingContext.jsx'

/**
 * 使用广告追踪Context的基础Hook
 * @returns {object} 广告追踪相关的数据和方法
 */
export const useAdTrackingContext = () => {
  const context = useContext(AdTrackingContext)
  
  if (context === null) {
    throw new Error(
      'useAdTrackingContext必须在AdTrackingProvider内部使用。\n' +
      '请确保你的组件被AdTrackingProvider包裹。'
    )
  }
  
  return context
}

/**
 * 便捷Hook：直接获取广告ID
 * @returns {string|null} 当前的广告ID
 */
export const useAdId = () => {
  const { adId } = useAdTrackingContext()
  return adId
}

/**
 * 便捷Hook：检查是否有广告ID
 * @returns {boolean} 是否有广告ID
 */
export const useHasAdId = () => {
  const { hasAdId } = useAdTrackingContext()
  return hasAdId
}

/**
 * 便捷Hook：获取完整的追踪信息
 * @returns {object|null} 完整的追踪信息
 */
export const useTrackingInfo = () => {
  const { trackingInfo, getCurrentTrackingInfo } = useAdTrackingContext()
  
  return {
    trackingInfo,
    getCurrentInfo: getCurrentTrackingInfo
  }
}