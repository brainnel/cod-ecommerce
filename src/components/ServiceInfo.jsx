import React from 'react';
import { 
  FiCreditCard,
  FiRefreshCcw,
  FiTruck,
  FiGift,
  FiClock
} from 'react-icons/fi';
import './ServiceInfo.css';

const ServiceInfo = ({ variant = 'classic', compact = false }) => {
  const isBenefitVariant = variant === 'benefits';
  const isCodTrustVariant = variant === 'cod_trust';
  const classicServices = [
    {
      id: 1,
      icon: FiGift,
      title: 'Livraison gratuite',
      subtitle: 'à Abidjan'
    },
    {
      id: 2,
      icon: FiTruck,
      title: 'Livraison 24h',
      subtitle: 'à Abidjan'
    },
    {
      id: 3,
      icon: FiCreditCard,
      title: 'Paiement à réception',
      subtitle: 'cash ou Wave'
    },
    {
      id: 4,
      icon: FiRefreshCcw,
      title: 'Retour possible',
      subtitle: 'si problème'
    }
  ];
  const benefitServices = [
    {
      id: 1,
      icon: FiGift,
      title: 'Livraison gratuite',
      subtitle: 'à Abidjan',
      tone: 'delivery'
    },
    {
      id: 2,
      icon: FiClock,
      title: 'Livraison 24h',
      subtitle: 'à Abidjan',
      tone: 'payment'
    },
    {
      id: 3,
      icon: FiCreditCard,
      title: 'Paiement à réception',
      subtitle: 'cash ou Wave',
      tone: 'assurance'
    },
    {
      id: 4,
      icon: FiRefreshCcw,
      title: 'Retour possible',
      subtitle: 'si problème',
      tone: 'support'
    }
  ];
  const codTrustServices = [
    {
      id: 1,
      icon: FiGift,
      title: 'Livraison gratuite',
      subtitle: 'à Abidjan',
      tone: 'delivery'
    },
    {
      id: 2,
      icon: FiClock,
      title: 'Livré sous 24h',
      subtitle: 'Abidjan',
      tone: 'payment'
    },
    {
      id: 3,
      icon: FiCreditCard,
      title: 'Payez à réception',
      subtitle: 'cash ou Wave',
      tone: 'assurance'
    },
    {
      id: 4,
      icon: FiRefreshCcw,
      title: 'Retour possible',
      subtitle: 'si problème',
      tone: 'support'
    }
  ];
  const services = isCodTrustVariant ? codTrustServices : (isBenefitVariant ? benefitServices : classicServices);
  const hasBenefitStyle = isBenefitVariant || isCodTrustVariant;

  return (
    <div className={`service-info ${hasBenefitStyle ? 'benefit-style' : ''} ${isCodTrustVariant ? 'cod-trust-style' : ''} ${compact ? 'compact-benefits' : ''}`}>
      {hasBenefitStyle && (
        <div className="service-benefit-header">
          <span className="service-benefit-kicker">Inclus avec votre commande</span>
          <h3>{isCodTrustVariant ? 'Recevez d’abord, payez après' : 'Vos avantages avec cette commande'}</h3>
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
