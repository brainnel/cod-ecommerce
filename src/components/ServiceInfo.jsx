import React from 'react';
import { 
  FaMoneyBillWave,
  FaUndo, 
  FaTruck,
  FaGift
} from 'react-icons/fa';
import './ServiceInfo.css';

const ServiceInfo = ({ variant = 'classic', compact = false }) => {
  const isBenefitVariant = variant === 'benefits';
  const classicServices = [
    {
      id: 1,
      icon: FaGift,
      title: 'Livraison gratuite',
      subtitle: 'à Abidjan'
    },
    {
      id: 2,
      icon: FaTruck,
      title: 'Livraison 24h',
      subtitle: 'à Abidjan'
    },
    {
      id: 3,
      icon: FaMoneyBillWave,
      title: 'Paiement à réception',
      subtitle: 'cash ou Wave'
    },
    {
      id: 4,
      icon: FaUndo,
      title: 'Retour possible',
      subtitle: 'si problème'
    }
  ];
  const benefitServices = [
    {
      id: 1,
      icon: FaGift,
      title: 'Livraison gratuite',
      subtitle: 'à Abidjan',
      tone: 'delivery'
    },
    {
      id: 2,
      icon: FaTruck,
      title: 'Livraison 24h',
      subtitle: 'à Abidjan',
      tone: 'payment'
    },
    {
      id: 3,
      icon: FaMoneyBillWave,
      title: 'Paiement à réception',
      subtitle: 'cash ou Wave',
      tone: 'assurance'
    },
    {
      id: 4,
      icon: FaUndo,
      title: 'Retour possible',
      subtitle: 'si problème',
      tone: 'support'
    }
  ];
  const services = isBenefitVariant ? benefitServices : classicServices;

  return (
    <div className={`service-info ${isBenefitVariant ? 'benefit-style' : ''} ${compact ? 'compact-benefits' : ''}`}>
      {isBenefitVariant && (
        <div className="service-benefit-header">
          <span className="service-benefit-kicker">Inclus avec votre commande</span>
          <h3>Vos avantages avec cette commande</h3>
        </div>
      )}
      <div className="service-grid">
        {services.map((service) => {
          const Icon = service.icon;
          return (
            <div key={service.id} className={`service-item ${service.tone ? `service-tone-${service.tone}` : ''}`}>
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
