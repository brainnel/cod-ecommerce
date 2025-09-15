import { useNavigate } from 'react-router-dom'
import logoImage from '../assets/logo.png'
import './DownloadPage.css'

const DownloadPage = () => {
  const navigate = useNavigate()

  // 下载链接 - 已更新为正确的应用商店链接
  const downloadLinks = {
    appStore: 'https://apps.apple.com/fr/app/brainnel/id1613055347', // iOS App Store链接
    googlePlay: 'https://play.google.com/store/apps/details?id=uni.UNIC87CC93', // Google Play链接
    apk: 'https://api.brainnel.com/static/app/brainnel.apk' // APK直接下载链接
  }

  const handleDownload = (platform) => {
    const link = downloadLinks[platform]
    if (link) {
      window.open(link, '_blank', 'noopener,noreferrer')
      
      // 添加下载追踪统计
      console.log(`📱 用户点击下载: ${platform}`)
    }
  }

  return (
    <div className="download-page">
      {/* 顶部导航 */}
      <div className="download-header">
        <button 
          type="button" 
          className="back-btn" 
          onClick={() => navigate('/')}
          aria-label="返回首页"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19L5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className="header-title">Download</h1>
      </div>

      {/* 主要内容 */}
      <div className="download-content">
        {/* 应用介绍部分 */}
        <div className="app-intro">
          <div className="app-icon">
            <img src={logoImage} alt="Brainnel App" className="app-icon-image" />
          </div>
          <h1 className="app-title">Brainnel</h1>
          <p className="app-subtitle">Votre application de shopping préférée</p>
          <p className="app-description">
            Découvrez des milliers de produits, profitez de prix avantageux et 
            bénéficiez d'un paiement à la livraison sécurisé. Téléchargez l'application 
            Brainnel pour une expérience shopping optimisée sur mobile.
          </p>
        </div>

        {/* 特性列表 */}
        <div className="app-features">
          <div className="feature">
            <div className="feature-icon">🛒</div>
            <div className="feature-text">Shopping facile et rapide</div>
          </div>
          <div className="feature">
            <div className="feature-icon">💰</div>
            <div className="feature-text">Paiement à la livraison</div>
          </div>
          <div className="feature">
            <div className="feature-icon">🚚</div>
            <div className="feature-text">Livraison gratuite</div>
          </div>
          <div className="feature">
            <div className="feature-icon">📱</div>
            <div className="feature-text">Interface optimisée mobile</div>
          </div>
        </div>

        {/* 下载按钮区域 */}
        <div className="download-buttons">
          <h2 className="download-title">Téléchargez l'application</h2>
          
          {/* App Store 按钮 */}
          <button 
            className="download-btn app-store"
            onClick={() => handleDownload('appStore')}
            type="button"
          >
            <div className="btn-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 21.99 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09997 21.99C7.78997 22.03 6.79997 20.68 5.95997 19.47C4.24997 17 2.93997 12.45 4.69997 9.39C5.56997 7.87 7.13997 6.91 8.85997 6.88C10.15 6.85 11.36 7.72 12.11 7.72C12.86 7.72 14.3 6.68 15.85 6.84C16.5 6.87 18.29 7.13 19.56 8.91C19.47 8.97 17.39 10.16 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z" fill="currentColor"/>
              </svg>
            </div>
            <div className="btn-content">
              <div className="btn-title">App Store</div>
            </div>
          </button>

          {/* Google Play 按钮 */}
          <button 
            className="download-btn google-play"
            onClick={() => handleDownload('googlePlay')}
            type="button"
          >
            <div className="btn-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.61 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z" fill="currentColor"/>
              </svg>
            </div>
            <div className="btn-content">
              <div className="btn-title">Google Play</div>
            </div>
          </button>

          {/* APK 直接下载按钮 */}
          <button 
            className="download-btn apk-download"
            onClick={() => handleDownload('apk')}
            type="button"
          >
            <div className="btn-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" fill="currentColor"/>
                <path d="M12 15L9 12H11V8H13V12H15L12 15Z" fill="currentColor"/>
              </svg>
            </div>
            <div className="btn-content">
              <div className="btn-title">Fichier APK</div>
            </div>
          </button>
        </div>


        {/* 支持信息 */}
        <div className="support-info">
          <p className="support-text">
            Besoin d'aide ? Contactez notre équipe de support à 
            <a href="mailto:support@brainnel.com" className="support-link">support@brainnel.com</a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default DownloadPage