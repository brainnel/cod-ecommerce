# 地图功能修改说明

## 修改日期
2025-10-15

## 修改内容

### 1. 后端API数据结构变更
后端现在返回城市级别的数据，包含该城市下所有district的坐标：

```json
[
  {
    "id": 1,
    "name": "Abidjan",
    "districts": [
      {
        "id": 1,
        "name": "Cocody",
        "latitude": 5.380583,
        "longitude": -3.960493
      },
      ...
    ]
  }
]
```

### 2. 地图功能增强

#### 2.1 MapSelector组件 (`src/components/MapSelector.jsx`)
- ✅ 新增 `districtCenter` prop - 接收大区中心点坐标
- ✅ 显示两个标记点：
  - **蓝色标记**：大区中心点（根据所有districts坐标计算平均值）
  - **红色标记**：用户选择的位置

#### 2.2 PaymentPage组件 (`src/pages/PaymentPage.jsx`)
- ✅ 改为显示"城市"而不是"大区"列表
- ✅ 新增 `calculateDistrictCenter()` 函数：
  - 计算城市内所有districts的中心点
  - 算法：所有latitude和longitude的平均值
- ✅ 地图聚焦到计算出的中心点
- ✅ 显示城市名称和包含的district数量

#### 2.3 API服务 (`src/services/api.js`)
- ✅ 修改 `getAllDistricts()` 方法：
  - 不再扁平化数据
  - 直接返回城市级别数据（保留districts嵌套结构）

### 3. 用户流程

1. **选择城市**：用户看到城市列表（如"Abidjan - 4 districts"）
2. **查看地图**：
   - 地图自动聚焦到该城市的中心点（蓝色标记）
   - 用户点击地图设置自己的位置（红色标记）
3. **提交订单**：使用选中城市的第一个district的ID

### 4. 关键代码

#### 计算中心点
```javascript
const calculateDistrictCenter = (cityData) => {
  const districts = cityData.districts
  const totalLat = districts.reduce((sum, d) => sum + parseFloat(d.latitude), 0)
  const totalLng = districts.reduce((sum, d) => sum + parseFloat(d.longitude), 0)
  
  return {
    lat: totalLat / districts.length,
    lng: totalLng / districts.length
  }
}
```

#### 地图标记
```jsx
{/* 大区中心点标记（蓝色） */}
<Marker position={districtCenter} icon={blueDot} title="Centre du district" />

{/* 用户位置标记（红色） */}
<Marker position={customMarker} icon={redDot} title="Votre position" />
```

## 测试要点

- [x] 城市列表正确显示
- [x] 地图自动聚焦到城市中心
- [x] 蓝色标记显示在正确位置
- [x] 用户可以点击地图设置红色标记
- [x] 两个标记同时显示
- [x] 订单提交使用正确的district_id

## 相关文件

- `src/components/MapSelector.jsx`
- `src/pages/PaymentPage.jsx`
- `src/services/api.js`
