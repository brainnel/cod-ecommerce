import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './DownloadPage.css'

const DOWNLOAD_API = 'https://api.brainnel.com/test/api/vite/app/download-links'

// Fallback URLs in case API fails
const FALLBACK_LINKS = {
  ios: { url: 'https://apps.apple.com/app/id6760172301', version: '' },
  android: { url: 'https://play.google.com/store/apps/details?id=com.brainnel.vite', version: '' },
  apk: { url: 'https://api.brainnel.com/static/app/brainnel.apk', version: '' },
}

const DownloadPage = () => {
  const navigate = useNavigate()
  const [links, setLinks] = useState(FALLBACK_LINKS)

  useEffect(() => {
    fetch(DOWNLOAD_API)
      .then(res => res.json())
      .then(data => {
        if (data && data.ios && data.android && data.apk) {
          setLinks(data)
        }
      })
      .catch(() => {
        // Use fallback links on error
      })
  }, [])

  return (
    <div className="dl-page">
      {/* Hero Gradient Header */}
      <div className="dl-hero">
        <div className="dl-nav">
          <div className="dl-brand">
            <img src="/vite-logo.png?v=2" alt="Brainnel" className="dl-brand-logo" />
            <span className="dl-brand-name">Brainnel Vite</span>
          </div>
          <a href="mailto:support@brainnel.com" className="dl-nav-link">Support</a>
        </div>
        <h1 className="dl-hero-title">
          L'experience shopping<br />
          reinventee pour la<br />
          Cote d'Ivoire
        </h1>
        <p className="dl-hero-sub">
          Des milliers de produits a portee de main. Paiement a la livraison. Livraison gratuite partout.
        </p>
        <a
          href={links.apk.url}
          className="dl-hero-cta"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg width="18" height="18" fill="white" viewBox="0 0 24 24">
            <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/>
          </svg>
          Telecharger maintenant
        </a>
      </div>

      <div className="dl-body">
        {/* Features Section */}
        <div className="dl-section-head">
          <div className="dl-line" />
          <h2>Pourquoi Brainnel ?</h2>
          <div className="dl-line" />
        </div>
        <div className="dl-feat-grid">
          <div className="dl-feat-card">
            <div className="dl-feat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="#E56012" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
            </div>
            <div className="dl-feat-name">Shopping rapide</div>
            <div className="dl-feat-desc">Trouvez tout en quelques clics</div>
          </div>
          <div className="dl-feat-card">
            <div className="dl-feat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="#E56012" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
            </div>
            <div className="dl-feat-name">Paiement COD</div>
            <div className="dl-feat-desc">Payez a la reception</div>
          </div>
          <div className="dl-feat-card">
            <div className="dl-feat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="#E56012" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="15" height="13"/>
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
                <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
              </svg>
            </div>
            <div className="dl-feat-name">Livraison gratuite</div>
            <div className="dl-feat-desc">Partout en Cote d'Ivoire</div>
          </div>
          <div className="dl-feat-card">
            <div className="dl-feat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="#E56012" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                <line x1="12" y1="18" x2="12.01" y2="18"/>
              </svg>
            </div>
            <div className="dl-feat-name">Interface intuitive</div>
            <div className="dl-feat-desc">Optimisee pour mobile</div>
          </div>
        </div>

        {/* Download Section */}
        <div className="dl-section-head">
          <div className="dl-line" />
          <h2>Telecharger</h2>
          <div className="dl-line" />
        </div>
        <div className="dl-list">
          <a
            href={links.ios.url}
            className="dl-item ios"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="dl-icon-circle">
              <svg width="22" height="22" fill="white" viewBox="0 0 24 24">
                <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 21.99 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 21.99C7.79 22.03 6.8 20.68 5.96 19.47C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.14 6.91 8.86 6.88C10.15 6.85 11.36 7.72 12.11 7.72C12.86 7.72 14.3 6.68 15.85 6.84C16.5 6.87 18.29 7.13 19.56 8.91C19.47 8.97 17.39 10.16 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"/>
              </svg>
            </div>
            <div className="dl-info">
              <div className="dl-name">App Store</div>
              <div className="dl-sub">iPhone & iPad</div>
            </div>
            <svg className="dl-chevron" width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
            </svg>
          </a>
          <a
            href={links.android.url}
            className="dl-item gplay"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="dl-icon-circle">
              <svg width="22" height="22" fill="white" viewBox="0 0 24 24">
                <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.61 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/>
              </svg>
            </div>
            <div className="dl-info">
              <div className="dl-name">Google Play</div>
              <div className="dl-sub">Android</div>
            </div>
            <svg className="dl-chevron" width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
            </svg>
          </a>
          <a
            href={links.apk.url}
            className="dl-item apk"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="dl-icon-circle">
              <svg width="22" height="22" fill="white" viewBox="0 0 24 24">
                <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/>
              </svg>
            </div>
            <div className="dl-info">
              <div className="dl-name">Fichier APK</div>
              <div className="dl-sub">Telechargement direct</div>
            </div>
            <svg className="dl-chevron" width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
            </svg>
          </a>
        </div>

        {/* Testimonial */}
        <div className="dl-testi">
          <div className="dl-quote-icon">
            <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/>
            </svg>
          </div>
          <p className="dl-testi-text">
            Tres bonne application ! J'ai commande des vetements et j'ai recu en 2 jours. Le paiement a la livraison c'est top !
          </p>
          <div className="dl-author">
            <div className="dl-avatar">A</div>
            <div>
              <div className="dl-author-name">Adjoua K.</div>
              <div className="dl-author-loc">Abidjan, Cote d'Ivoire</div>
              <div className="dl-stars">★★★★★</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="dl-footer">
          <p>Besoin d'aide ? <a href="mailto:support@brainnel.com">support@brainnel.com</a></p>
          <p>&copy; 2024 Brainnel. Tous droits reserves.</p>
        </div>
      </div>
    </div>
  )
}

export default DownloadPage
