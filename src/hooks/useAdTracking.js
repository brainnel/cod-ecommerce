import { useState, useEffect, useCallback } from 'react'
import { getAdIdFromUrl, getAdTrackingInfo } from '../utils/urlParams'

// LocalStorage key for ad ID persistence
const AD_ID_STORAGE_KEY = 'facebook_ad_id'
const AD_TRACKING_INFO_KEY = 'ad_tracking_info'

/**
 * 广告ID追踪Hook
 * 自动从URL提取广告ID并进行持久化存储
 */
export const useAdTracking = () => {
  const [adId, setAdId] = useState(null)
  const [trackingInfo, setTrackingInfo] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  /**
   * 从localStorage读取广告ID
   */
  const loadAdIdFromStorage = useCallback(() => {
    try {
      const storedAdId = localStorage.getItem(AD_ID_STORAGE_KEY)
      const storedTrackingInfo = localStorage.getItem(AD_TRACKING_INFO_KEY)
      
      if (storedTrackingInfo) {
        const parsedInfo = JSON.parse(storedTrackingInfo)
        setTrackingInfo(parsedInfo)
        
        if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
          console.log('📥 从localStorage恢复广告追踪信息:', parsedInfo)
        }
      }
      
      if (storedAdId) {
        setAdId(storedAdId)
        
        if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
          console.log('📥 从localStorage恢复广告ID:', storedAdId)
        }
        
        return storedAdId
      }
    } catch (error) {
      console.error('从localStorage读取广告ID失败:', error)
    }
    
    return null
  }, [])

  /**
   * 保存广告ID到localStorage
   */
  const saveAdIdToStorage = useCallback((newAdId, newTrackingInfo = null) => {
    try {
      if (newAdId) {
        localStorage.setItem(AD_ID_STORAGE_KEY, newAdId)
        
        if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
          console.log('💾 广告ID已保存到localStorage:', newAdId)
        }
      }
      
      if (newTrackingInfo) {
        localStorage.setItem(AD_TRACKING_INFO_KEY, JSON.stringify(newTrackingInfo))
        
        if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
          console.log('💾 广告追踪信息已保存到localStorage:', newTrackingInfo)
        }
      }
    } catch (error) {
      console.error('保存广告ID到localStorage失败:', error)
    }
  }, [])

  /**
   * 清除广告ID和相关信息
   */
  const clearAdId = useCallback(() => {
    try {
      localStorage.removeItem(AD_ID_STORAGE_KEY)
      localStorage.removeItem(AD_TRACKING_INFO_KEY)
      setAdId(null)
      setTrackingInfo(null)
      
      if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
        console.log('🗑️ 广告ID和追踪信息已清除')
      }
    } catch (error) {
      console.error('清除广告ID失败:', error)
    }
  }, [])

  /**
   * 手动设置广告ID（用于测试或特殊情况）
   */
  const setAdIdManually = useCallback((newAdId) => {
    if (newAdId) {
      setAdId(newAdId)
      saveAdIdToStorage(newAdId)
      
      if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
        console.log('✋ 手动设置广告ID:', newAdId)
      }
    }
  }, [saveAdIdToStorage])

  /**
   * 获取当前的广告追踪信息（包含更多详细信息）
   */
  const getCurrentTrackingInfo = useCallback(() => {
    return {
      ad_id: adId,
      tracking_info: trackingInfo,
      has_ad_id: !!adId,
      storage_key: AD_ID_STORAGE_KEY,
      captured_at: trackingInfo?.captured_at || null
    }
  }, [adId, trackingInfo])

  // 初始化：优先从URL获取，其次从localStorage恢复
  useEffect(() => {
    const initializeAdTracking = async () => {
      setIsLoading(true)
      
      try {
        // 1. 优先从URL提取广告ID
        const urlAdId = getAdIdFromUrl()
        
        if (urlAdId) {
          // URL中有广告ID，获取完整追踪信息
          const fullTrackingInfo = getAdTrackingInfo()
          setAdId(urlAdId)
          setTrackingInfo(fullTrackingInfo)
          saveAdIdToStorage(urlAdId, fullTrackingInfo)
          
          if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
            console.log('🎯 从URL成功获取广告ID:', urlAdId)
            console.log('📊 完整追踪信息:', fullTrackingInfo)
          }
        } else {
          // URL中没有广告ID，尝试从localStorage恢复
          const storedAdId = loadAdIdFromStorage()
          
          if (!storedAdId && import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true') {
            console.log('ℹ️ 未找到广告ID（URL或localStorage中都没有）')
          }
        }
      } catch (error) {
        console.error('初始化广告追踪失败:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initializeAdTracking()
  }, [loadAdIdFromStorage, saveAdIdToStorage])

  // 在开发环境中，将调试函数挂载到window对象
  useEffect(() => {
    if (import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true' && typeof window !== 'undefined') {
      window.debugAdTracking = () => {
        console.log('=== 广告追踪调试信息 ===')
        console.log('当前广告ID:', adId)
        console.log('是否加载中:', isLoading)
        console.log('完整追踪信息:', trackingInfo)
        console.log('localStorage中的广告ID:', localStorage.getItem(AD_ID_STORAGE_KEY))
        console.log('localStorage中的追踪信息:', localStorage.getItem(AD_TRACKING_INFO_KEY))
        console.log('当前URL:', window.location.href)
        console.log('======================')
        
        return getCurrentTrackingInfo()
      }
      
      // 清理函数
      return () => {
        if (window.debugAdTracking) {
          delete window.debugAdTracking
        }
      }
    }
  }, [adId, isLoading, trackingInfo, getCurrentTrackingInfo])

  return {
    adId,
    trackingInfo,
    isLoading,
    hasAdId: !!adId,
    setAdId: setAdIdManually,
    clearAdId,
    getCurrentTrackingInfo
  }
}

export default useAdTracking