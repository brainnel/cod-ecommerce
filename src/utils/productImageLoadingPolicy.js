const CONSTRAINED_EFFECTIVE_TYPES = new Set(['slow-2g', '2g', '3g']);

export const getProductImageLoadingPolicy = () => {
  if (typeof navigator === 'undefined') {
    return {
      isConstrainedNetwork: false,
      promotedDetailImageLimit: 4,
      autoplayEnabled: true
    };
  }

  const connection = navigator.connection
    || navigator.mozConnection
    || navigator.webkitConnection;
  const effectiveType = String(connection?.effectiveType || '').toLowerCase();
  const isConstrainedNetwork = Boolean(connection?.saveData)
    || CONSTRAINED_EFFECTIVE_TYPES.has(effectiveType);

  return {
    isConstrainedNetwork,
    promotedDetailImageLimit: isConstrainedNetwork ? 1 : 4,
    autoplayEnabled: !isConstrainedNetwork
  };
};
