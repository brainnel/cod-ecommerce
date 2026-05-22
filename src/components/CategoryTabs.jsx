import { Fragment, useState, useEffect, useRef } from 'react'
import { categoryAPI } from '../services/api'
import './CategoryTabs.css'

const CategoryTabs = ({ onCategoryChange, onSpecialViewChange, selectedCategoryId, selectedSpecialView }) => {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const scrollContainerRef = useRef(null)

  // 获取分类数据
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true)
        const data = await categoryAPI.getLevel1Categories()
        
        // 添加"全部"选项
        const allCategories = [
          { category_id: null, name_fr: 'Tout', name: '全部' },
          ...data
        ]
        setCategories(allCategories)
      } catch (err) {
        setError('Échec de récupération des catégories')
        console.error('Error fetching categories:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchCategories()
  }, [])

  const scrollSelectedTabIntoView = (tabKey) => {
    const selectedTab = document.querySelector(`[data-category-key="${tabKey}"]`)
    if (selectedTab && scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const tabRect = selectedTab.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      
      if (tabRect.left < containerRect.left || tabRect.right > containerRect.right) {
        selectedTab.scrollIntoView({ behavior: 'smooth', inline: 'center' })
      }
    }
  }

  const handleCategoryClick = (categoryId) => {
    onCategoryChange(categoryId)
    
    // 滚动到选中的分类（可选的用户体验优化）
    scrollSelectedTabIntoView(categoryId ?? 'all')
  }

  const handleSpecialViewClick = (view) => {
    onSpecialViewChange?.(view)
    scrollSelectedTabIntoView(view)
  }

  if (loading) {
    return (
      <div className="category-tabs-container">
        <div className="category-tabs-loading">
          <div className="loading-skeleton"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="category-tabs-container">
        <div className="category-tabs-error">
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="category-tabs-container">
      <div className="category-tabs" ref={scrollContainerRef}>
        {categories.map((category) => (
          <Fragment key={category.category_id || 'all'}>
            <button
              type="button"
              className={`category-tab ${!selectedSpecialView && selectedCategoryId === category.category_id ? 'active' : ''}`}
              onClick={() => handleCategoryClick(category.category_id)}
              data-category-id={category.category_id}
              data-category-key={category.category_id ?? 'all'}
            >
              {category.name_fr}
            </button>
            {category.category_id === null && (
              <button
                type="button"
                className={`category-tab category-tab-pack ${selectedSpecialView === 'packs' ? 'active' : ''}`}
                onClick={() => handleSpecialViewClick('packs')}
                data-category-id="packs"
                data-category-key="packs"
              >
                Packs promo
              </button>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

export default CategoryTabs
