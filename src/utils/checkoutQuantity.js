export const MAX_CHECKOUT_QUANTITY = 5

export const getCheckoutQuantityLimit = (product) => {
  const stock = Number(product?.stock)
  // Preserve checkout's existing fallback when no positive stock is supplied.
  const stockLimit = Number.isFinite(stock) && stock > 0
    ? Math.max(1, Math.floor(stock))
    : MAX_CHECKOUT_QUANTITY
  return Math.min(MAX_CHECKOUT_QUANTITY, stockLimit)
}

export const clampCheckoutQuantity = (value, product) => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 1
  return Math.min(Math.max(parsed, 1), getCheckoutQuantityLimit(product))
}
