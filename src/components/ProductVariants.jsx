import './ProductVariants.css';

const ProductVariants = ({ variants, currentProductId, onVariantSelect }) => {
  if (!variants || variants.length === 0) return null;

  return (
    <div className="product-variants">
      <h3>Choisir la capacité</h3>
      <div className="variant-buttons">
        {variants.map(variant => (
          <button
            key={variant.product_id}
            className={`variant-btn ${variant.product_id === currentProductId ? 'active' : ''}`}
            onClick={() => onVariantSelect(variant.product_id)}
            type="button"
          >
            <span className="variant-name">{variant.variant_name}</span>
            {variant.price && (
              <span className="variant-price">{Math.ceil(variant.price)} FCFA</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ProductVariants;
