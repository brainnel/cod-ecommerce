import { useState, useEffect, useRef } from 'react'
import { categoryAPI } from '../services/api'
import './CategoryTabs.css'

const CategoryTabs = ({ onCategoryChange, selectedCategoryId }) => {
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
        
        // 调试日志
        console.log('=== 分类数据 ===')
        console.log('分类列表:', allCategories)
        console.log('===============')
      } catch (err) {
        setError('Échec de récupération des catégories')
        console.error('Error fetching categories:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchCategories()
  }, [])

  const handleCategoryClick = (categoryId) => {
    onCategoryChange(categoryId)
    
    // 滚动到选中的分类（可选的用户体验优化）
    const selectedTab = document.querySelector(`[data-category-id="${categoryId}"]`)
    if (selectedTab && scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const tabRect = selectedTab.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      
      if (tabRect.left < containerRect.left || tabRect.right > containerRect.right) {
        selectedTab.scrollIntoView({ behavior: 'smooth', inline: 'center' })
      }
    }
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
          <button
            key={category.category_id || 'all'}
            type="button"
            className={`category-tab ${selectedCategoryId === category.category_id ? 'active' : ''}`}
            onClick={() => handleCategoryClick(category.category_id)}
            data-category-id={category.category_id}
          >
            {category.name_fr}
          </button>
        ))}
      </div>
    </div>
  )
}

export default CategoryTabs
