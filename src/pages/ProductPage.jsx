import { useParams, useLocation } from 'react-router-dom'
import ProductDetail from '../components/ProductDetail'

const ProductPage = () => {
  const { productId } = useParams()
  const location = useLocation()
  const productFromState = location.state?.product
  
  return <ProductDetail productId={productId} initialProduct={productFromState} />
}

export default ProductPage
