import { useParams, useLocation } from 'react-router-dom'
import BundleDetail from '../components/BundleDetail'

const BundlePage = () => {
  const { bundleId } = useParams()
  const location = useLocation()
  const bundleFromState = location.state?.bundle

  return <BundleDetail bundleId={bundleId} initialBundle={bundleFromState} />
}

export default BundlePage
