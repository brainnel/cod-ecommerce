import React from 'react';
import { 
  FaMoneyBillWave,
  FaUndo, 
  FaTruck,
  FaGift
} from 'react-icons/fa';
import './ServiceInfo.css';

const ServiceInfo = () => {
  const services = [
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
      title: 'Livraison en 3 jours'
    },
    {
      id: 4,
      icon: FaGift,
      title: 'Livraison gratuite'
    }
  ];

  return (
    <div className="service-info">
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ServiceInfo;