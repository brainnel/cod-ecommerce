import React from 'react';
import { 
  FaMoneyBillWave,
  FaUndo, 
  FaTruck,
  FaGift
} from 'react-icons/fa';
import './ServiceInfo.css';

const ServiceInfo = ({ variant = 'classic' }) => {
  const isBenefitVariant = variant === 'benefits';
  const classicServices = [
    {
      id: 1,
      icon: FaMoneyBillWave,
      title: 'Paiement à la livraison'
    },
    {
      id: 2,
      icon: FaUndo,
      title: 'Garantie de retour'
    },
    {
      id: 3,
      icon: FaTruck,
      title: 'Livraison en 24 heures'
    },
    {
      id: 4,
      icon: FaGift,
      title: 'Livraison gratuite'
    }
  ];
  const benefitServices = [
    {
      id: 1,
      icon: FaGift,
      title: 'Livraison offerte',
      subtitle: 'à Abidjan'
    },
    {
      id: 2,
      icon: FaTruck,
      title: 'Livré en 24h',
      subtitle: 'rapide et local'
    },
    {
      id: 3,
      icon: FaMoneyBillWave,
      title: 'Payez à la réception',
      subtitle: 'rien à payer maintenant'
    },
    {
      id: 4,
      icon: FaUndo,
      title: 'Retour possible',
      subtitle: 'si problème'
    }
  ];
  const services = isBenefitVariant ? benefitServices : classicServices;

  return (
    <div className={`service-info ${isBenefitVariant ? 'benefit-style' : ''}`}>
      {isBenefitVariant && (
        <div className="service-benefit-header">
          <span className="service-benefit-kicker">Inclus aujourd’hui</span>
          <h3>Vos avantages avec cette commande</h3>
        </div>
      )}
      <div className="service-grid">
        {services.map((service) => {
          const Icon = service.icon;
          return (
            <div key={service.id} className="service-item">
              <div className="service-icon">
                <Icon />
              </div>
              <div className="service-content">
                <h4 className="service-title">{service.title}</h4>
                {service.subtitle && <p className="service-subtitle">{service.subtitle}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ServiceInfo;
