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



// 默认导出Context，供其他需要的组件使用
export default AdTrackingContext