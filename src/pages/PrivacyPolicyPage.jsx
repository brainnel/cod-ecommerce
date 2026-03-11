import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import './LegalPage.css'

const PrivacyPolicyPage = () => {
  const navigate = useNavigate()
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchContent = async () => {
    setLoading(true)
    setError(false)
    try {
      const response = await api.get('/api/content/privacy-policy/')
      const data = response.data
      // Prefer French content, fallback to English
      setContent(data.info_fr || data.info_en || '')
    } catch (err) {
      console.error('Failed to fetch privacy policy:', err)
      setError(true)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchContent()
  }, [])

  return (
    <div className="legal-page">
      <div className="legal-header">
        <button
          type="button"
          className="back-btn"
          onClick={() => navigate('/')}
          aria-label="Retour"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19L5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className="header-title">Politique de confidentialité</h1>
      </div>

      <div className="legal-content">
        {loading && (
          <div className="legal-loading">
            <div className="legal-spinner" />
            <p>Chargement...</p>
          </div>
        )}

        {error && (
          <div className="legal-error">
            <p>Impossible de charger la politique de confidentialité.</p>
            <button type="button" className="legal-retry-btn" onClick={fetchContent}>
              Réessayer
            </button>
          </div>
        )}

        {!loading && !error && content && (
          <div
            className="legal-body"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </div>
    </div>
  )
}

export default PrivacyPolicyPage
