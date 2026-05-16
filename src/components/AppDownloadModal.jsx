import { FiCheckCircle } from 'react-icons/fi'
import './AppDownloadModal.css'

const AppDownloadModal = ({ isOpen, onClose, onConfirm, whatsappNumber }) => {
  if (!isOpen) return null

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div 
      className="modal-overlay" 
      onClick={handleOverlayClick}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <div className="modal-content">
        <div className="modal-header">
          <div className="download-modal-success-icon"><FiCheckCircle aria-hidden="true" /></div>
          <h2 className="modal-title">Félicitations !</h2>
          <button 
            type="button"
            className="modal-close" 
            onClick={onClose}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
        
        <div className="modal-body">
          <p className="success-message">
            Votre compte a été créé avec succès.
          </p>
          
          <div className="instruction-box">
            <div className="instruction-text">
              <p>
                Après avoir téléchargé l'application, connectez-vous avec 
                <strong> WhatsApp</strong> pour voir vos informations de commande.
              </p>
              <div className="whatsapp-number">
                <span className="number">{whatsappNumber}</span>
                <button 
                  type="button"
                  className="copy-button"
                  onClick={(e) => {
                    navigator.clipboard.writeText(whatsappNumber).then(() => {
                      // 复制成功反馈
                      const button = e.target
                      button.textContent = 'Copié'
                      button.style.color = '#28a745'
                      button.style.background = '#f8fff8'
                      button.disabled = true
                      setTimeout(() => {
                        button.textContent = 'Copier'
                        button.style.color = ''
                        button.style.background = ''
                        button.disabled = false
                      }, 2000)
                    }).catch(() => {
                      // 复制失败时的备用方案
                      alert('Numéro copié: ' + whatsappNumber)
                    })
                  }}
                  title="Copier le numéro"
                >
                  Copier
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            type="button"
            className="btn-confirm" 
            onClick={onConfirm}
          >
            J'ai compris, télécharger
          </button>
        </div>
      </div>
    </div>
  )
}

export default AppDownloadModal
