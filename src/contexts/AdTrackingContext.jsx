import React, { createContext, useContext } from 'react'
import useAdTracking from '../hooks/useAdTracking'

// 创建广告追踪Context
const AdTrackingContext = createContext(null)

/**
 * 广告追踪Context Provider
 * 将广告ID管理功能提供给整个应用
 */
export const AdTrackingProvider = ({ children }) => {
  const adTrackingData = useAdTracking()

  // 在开发环境中输出初始化日志
  React.useEffect(() => {
    if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true' && !adTrackingData.isLoading) {
      console.log('🚀 广告追踪Context已初始化')
      console.log('广告ID:', adTrackingData.adId || '未设置')
      console.log('是否来自Facebook广告:', adTrackingData.hasAdId)
      
      if (adTrackingData.trackingInfo) {
        console.log('追踪详情:', adTrackingData.trackingInfo)
      }
    }
  }, [adTrackingData.isLoading, adTrackingData.adId, adTrackingData.hasAdId, adTrackingData.trackingInfo])

  return (
    <AdTrackingContext.Provider value={adTrackingData}>
      {children}
    </AdTrackingContext.Provider>
  )
}

/**
 * 使用广告追踪Context的Hook
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

// 默认导出Context，供其他需要的组件使用
export default AdTrackingContext