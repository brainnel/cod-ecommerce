import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import './UpdateAddress.css';

// RIDER使用本地，ADMIN使用生产环境
const ADMIN_API_URL = 'https://api.brainnel.com/admin';
const RIDER_API_URL = 'http://localhost:8000';

export default function UpdateAddress() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [orderInfo, setOrderInfo] = useState(null);
  const [districts, setDistricts] = useState([]);
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [selectedLat, setSelectedLat] = useState(null);
  const [selectedLng, setSelectedLng] = useState(null);
  const [addressDescription, setAddressDescription] = useState('');
  const [addressError, setAddressError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const mapRef = useRef(null);
  const googleMapRef = useRef(null);
  const customMarkerRef = useRef(null);
  const userLocationMarkerRef = useRef(null);

  useEffect(() => {
    if (!token) {
      setError('Lien invalide. Veuillez demander un nouveau lien au livreur.');
      setLoading(false);
      return;
    }
    
    initializePage();
  }, [token]);

  const initializePage = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // 验证token并获取订单信息
      const verifyResponse = await fetch(`${RIDER_API_URL}/api/address-update/verify?token=${token}`);
      
      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json();
        throw new Error(errorData.detail || 'Vérification échouée');
      }
      
      const orderData = await verifyResponse.json();
      setOrderInfo(orderData);
      
      // 加载大区列表
      const districtsResponse = await fetch(`${RIDER_API_URL}/api/address-update/districts`);
      if (!districtsResponse.ok) {
        throw new Error('Impossible de charger les districts');
      }
      
      const districtsData = await districtsResponse.json();
      setDistricts(districtsData.districts);
      
      // 显示步骤1
      setCurrentStep(1);
      setLoading(false);
      
    } catch (err) {
      console.error('Initialization error:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const selectDistrict = (district) => {
    setSelectedDistrict(district);
    setCurrentStep(2);
    
    // 延迟初始化地图
    setTimeout(() => {
      initMap(district);
    }, 100);
  };

  const initMap = (district) => {
    if (!window.google || !mapRef.current) {
      console.error('Google Maps not loaded or map container not ready');
      return;
    }
    
    const center = {
      lat: parseFloat(district.latitude),
      lng: parseFloat(district.longitude)
    };
    
    googleMapRef.current = new window.google.maps.Map(mapRef.current, {
      center: center,
      zoom: 14,
      zoomControl: true,
      mapTypeControl: false,
      scaleControl: false,
      streetViewControl: false,
      rotateControl: false,
      fullscreenControl: false,
      styles: [
        {
          featureType: 'poi',
          elementType: 'labels',
          stylers: [{ visibility: 'off' }]
        }
      ]
    });
    
    // 点击地图添加标记
    googleMapRef.current.addListener('click', (event) => {
      const lat = event.latLng.lat();
      const lng = event.latLng.lng();
      setCustomMarker(lat, lng);
    });
  };

  const setCustomMarker = (lat, lng) => {
    setSelectedLat(lat);
    setSelectedLng(lng);
    
    // 移除旧标记
    if (customMarkerRef.current) {
      customMarkerRef.current.setMap(null);
    }
    
    // 添加新标记
    customMarkerRef.current = new window.google.maps.Marker({
      position: { lat, lng },
      map: googleMapRef.current,
      icon: {
        url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
        scaledSize: new window.google.maps.Size(40, 40)
      },
      title: 'Position de livraison',
      animation: window.google.maps.Animation.DROP
    });
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('La géolocalisation n\'est pas supportée par votre navigateur');
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        // 显示用户位置标记（蓝色）
        if (userLocationMarkerRef.current) {
          userLocationMarkerRef.current.setMap(null);
        }
        
        userLocationMarkerRef.current = new window.google.maps.Marker({
          position: { lat, lng },
          map: googleMapRef.current,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#4285F4',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
          },
          title: 'Votre position actuelle'
        });
        
        // 设置为送货位置
        setCustomMarker(lat, lng);
        googleMapRef.current.setCenter({ lat, lng });
      },
      (error) => {
        console.error('Geolocation error:', error);
        alert('Impossible d\'obtenir votre position. Veuillez cliquer sur la carte.');
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  };

  const confirmMarker = () => {
    if (!selectedLat || !selectedLng) {
      alert('Veuillez sélectionner une position sur la carte');
      return;
    }
    
    setCurrentStep(3);
  };

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const submitAddress = async () => {
    const trimmedAddress = addressDescription.trim();
    
    // 验证
    if (!trimmedAddress) {
      setAddressError('La description de l\'adresse est requise');
      return;
    }
    
    if (trimmedAddress.length < 5) {
      setAddressError('Au moins 5 caractères requis');
      return;
    }
    
    if (trimmedAddress.length > 200) {
      setAddressError('Maximum 200 caractères');
      return;
    }
    
    setAddressError('');
    setSubmitting(true);
    
    try {
      // 调用admin后端接口
      const response = await fetch(`${ADMIN_API_URL}/api/v1/flash-local/update-order-address`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          order_no: orderInfo.order_no,
          longitude: selectedLng,
          latitude: selectedLat,
          receiver_address: trimmedAddress
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Échec de la mise à jour');
      }
      
      const result = await response.json();
      
      if (result.success) {
        // 新增: 通知 rider_backend
        try {
          await fetch(`${RIDER_API_URL}/api/address-update/notify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              order_no: orderInfo.order_no,
              new_address: trimmedAddress,
              new_latitude: selectedLat,
              new_longitude: selectedLng
            })
          });
          console.log('骑手通知已发送');
        } catch (notifyError) {
          // 静默处理通知失败,不影响主流程
          console.warn('通知骑手失败:', notifyError);
        }
        
        // 显示成功页面
        setCurrentStep(4);
      } else {
        throw new Error(result.message || 'Échec de la mise à jour');
      }
      
    } catch (err) {
      console.error('Submit error:', err);
      alert(`Erreur: ${err.message}\nVeuillez réessayer.`);
    } finally {
      setSubmitting(false);
    }
  };

  // 加载状态
  if (loading) {
    return (
      <div className="update-address-page">
        <div className="header">
          <h1 className="title">Modifier l'adresse</h1>
        </div>
        <div className="content">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Chargement...</p>
          </div>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="update-address-page">
        <div className="header">
          <h1 className="title">Modifier l'adresse</h1>
        </div>
        <div className="content">
          <div className="error-container">
            <div className="error-icon">⚠️</div>
            <h2 className="error-title">Erreur</h2>
            <p className="error-message">{error}</p>
            <button className="retry-btn" onClick={initializePage}>
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="update-address-page">
      <div className="header">
        <button 
          type="button" 
          className="back-btn" 
          onClick={goBack}
          style={{ visibility: currentStep > 1 && currentStep < 4 ? 'visible' : 'hidden' }}
        >
          ←
        </button>
        <h1 className="title">Modifier l'adresse</h1>
      </div>

      <div className="content">
        {currentStep < 4 && (
          <div className="steps-indicator">
            <div className={`step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
              <div className="step-icon">{currentStep > 1 ? '✓' : '1'}</div>
              <span className="step-label">District</span>
            </div>
            <div className="step-divider"></div>
            <div className={`step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
              <div className="step-icon">{currentStep > 2 ? '✓' : '2'}</div>
              <span className="step-label">Position</span>
            </div>
            <div className="step-divider"></div>
            <div className={`step ${currentStep >= 3 ? 'active' : ''}`}>
              <div className="step-icon">3</div>
              <span className="step-label">Confirmation</span>
            </div>
          </div>
        )}

        {/* 步骤1: 选择大区 */}
        {currentStep === 1 && (
          <div className="section">
            <h2 className="section-title">Sélectionnez votre district</h2>
            <div className="district-list">
              {districts.map((district) => (
                <div
                  key={district.id}
                  className="district-card"
                  onClick={() => selectDistrict(district)}
                >
                  <div className="district-icon">📍</div>
                  <div className="district-info">
                    <div className="district-name">{district.name}</div>
                    <div className="district-city">{district.city_name}</div>
                  </div>
                  <div className="district-arrow">›</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 步骤2: 地图标记 */}
        {currentStep === 2 && (
          <div className="section">
            <div className="location-hint">
              <div className="hint-content">
                <span className="hint-text">
                  Cliquez sur la carte pour marquer votre adresse de livraison
                </span>
              </div>
              <button 
                className="use-location-btn" 
                onClick={useCurrentLocation}
                type="button"
                title="Utiliser ma position actuelle"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="12" cy="12" r="3"/>
                  <line x1="12" y1="2" x2="12" y2="4"/>
                  <line x1="12" y1="20" x2="12" y2="22"/>
                  <line x1="2" y1="12" x2="4" y2="12"/>
                  <line x1="20" y1="12" x2="22" y2="12"/>
                </svg>
              </button>
            </div>
            
            {selectedDistrict && (
              <div className="district-info-badge">
                <span className="badge-icon">📍</span>
                <span className="badge-text">{selectedDistrict.name}, {selectedDistrict.city_name}</span>
              </div>
            )}

            <div className="map-container">
              <div ref={mapRef} id="map" style={{ width: '100%', height: '100%' }}></div>
            </div>

            <button className="confirm-marker-btn" onClick={confirmMarker}>
              Confirmer la position
            </button>
          </div>
        )}

        {/* 步骤3: 填写地址描述 */}
        {currentStep === 3 && (
          <div className="section">
            <h2 className="section-title">Détails de l'adresse</h2>
            
            <div className="info-card">
              <div className="info-row">
                <span className="info-label">District:</span>
                <span className="info-value">{selectedDistrict?.name}, {selectedDistrict?.city_name}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Position:</span>
                <span className="info-value">{selectedLat?.toFixed(6)}, {selectedLng?.toFixed(6)}</span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="addressDescription">Description de l'adresse *</label>
              <textarea 
                id="addressDescription"
                value={addressDescription}
                onChange={(e) => setAddressDescription(e.target.value)}
                placeholder="Ex: Immeuble 3, 2ème étage, porte bleue..."
                maxLength="200"
                rows="4"
              />
              <div className="char-counter">
                <span>{addressDescription.length}</span>/200
              </div>
              {addressError && (
                <div className="error-text">{addressError}</div>
              )}
            </div>

            <button 
              className="submit-btn" 
              onClick={submitAddress}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="loading-spinner-small"></span>
                  Envoi en cours...
                </>
              ) : (
                'Confirmer la modification'
              )}
            </button>
          </div>
        )}

        {/* 成功页面 */}
        {currentStep === 4 && (
          <div className="section success-section">
            <div className="success-icon">✓</div>
            <h2 className="success-title">Adresse modifiée avec succès!</h2>
            <p className="success-message">
              Votre nouvelle adresse de livraison a été enregistrée.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
