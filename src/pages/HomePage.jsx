import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CategoryTabs from '../components/CategoryTabs'
import ProductList from '../components/ProductList'
import logoImage from '../assets/logo.png'
import './HomePage.css'

const HomePage = () => {
  const [selectedCategoryId, setSelectedCategoryId] = useState(null) // null表示"全部"
  const navigate = useNavigate()

  const handleCategoryChange = (categoryId) => {
    setSelectedCategoryId(categoryId)
    
    // 调试日志
    console.log('=== 分类切换 ===')
    console.log('选择的分类ID:', categoryId)
    console.log('===============')
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
        selectedCategoryId={selectedCategoryId}
      />

      {/* 产品列表 */}
      <ProductList categoryId={selectedCategoryId} />
    </div>
  )
}

export default HomePage