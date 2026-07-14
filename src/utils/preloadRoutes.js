let paymentPagePreloadPromise = null

export const preloadPaymentPage = () => {
  if (typeof window === 'undefined') return null
  if (paymentPagePreloadPromise) return paymentPagePreloadPromise

  paymentPagePreloadPromise = import('../pages/PaymentPage').catch((error) => {
    paymentPagePreloadPromise = null
    console.warn('预加载 checkout 页面失败:', error)
    return null
  })

  return paymentPagePreloadPromise
}

export const schedulePaymentPagePreload = () => {
  if (typeof window === 'undefined') return undefined

  let idleId
  const timerId = window.setTimeout(() => {
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(preloadPaymentPage, { timeout: 800 })
      return
    }
    preloadPaymentPage()
  }, 1200)

  return () => {
    window.clearTimeout(timerId)
    if (idleId !== undefined && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleId)
    }
  }
}
