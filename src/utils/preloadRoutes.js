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

  const run = () => {
    preloadPaymentPage()
  }

  if (typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(run, { timeout: 1200 })
    return () => {
      if (typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId)
      }
    }
  }

  const timerId = window.setTimeout(run, 500)
  return () => window.clearTimeout(timerId)
}
