import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BundleList from '../components/BundleList'
import CategoryTabs from '../components/CategoryTabs'
import ProductList from '../components/ProductList'
import logoImage from '../assets/logo.png'
import './HomePage.css'

const parseCategoryId = (value) => {
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const HomePage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const categoryIdParam = searchParams.get('category_id')
  const selectedSpecialView = searchParams.get('view') === 'packs' ? 'packs' : null
  const [selectedCategoryId, setSelectedCategoryId] = useState(() => parseCategoryId(searchParams.get('category_id'))) // null表示"全部"
  const navigate = useNavigate()

  useEffect(() => {
    if (selectedSpecialView) {
      setSelectedCategoryId(null)
      return
    }
    setSelectedCategoryId(parseCategoryId(categoryIdParam))
  }, [categoryIdParam, selectedSpecialView])

  const handleCategoryChange = (categoryId) => {
    setSelectedCategoryId(categoryId)
    if (categoryId) {
      setSearchParams({ category_id: categoryId.toString() })
    } else {
      setSearchParams({})
    }
  }

  const handleSpecialViewChange = (view) => {
    if (view === 'packs') {
      setSelectedCategoryId(null)
      setSearchParams({ view: 'packs' })
    }
  }

  return (
    <div className="homepage">
      {/* 顶部标题栏 */}
      <div className="homepage-header">
        <div 
          className="logo" 
          onClick={() => navigate('/')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/')}
          role="button"
          tabIndex={0}
          title="Retour à l'accueil"
        >
          <img src={logoImage} alt="Brainnel" className="logo-image" />
        </div>
      </div>

      {/* 分类标签 */}
      <CategoryTabs 
        onCategoryChange={handleCategoryChange}
        onSpecialViewChange={handleSpecialViewChange}
        selectedCategoryId={selectedCategoryId}
        selectedSpecialView={selectedSpecialView}
      />

      {/* 产品列表 */}
      {selectedSpecialView === 'packs' ? (
        <BundleList />
      ) : (
        <ProductList categoryId={selectedCategoryId} />
      )}
    </div>
  )
}

export default HomePage
