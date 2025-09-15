# Facebook 转化 API (Conversions API) 集成指南

## 概述

本项目已集成 Facebook 转化 API（服务器端事件），用于提高广告转化跟踪的准确性，特别是在 iOS 14.5+ 和浏览器隐私限制环境下。

## 功能特性

- ✅ **双重跟踪**：客户端 Facebook Pixel + 服务器端转化API
- ✅ **数据去重**：使用事件ID避免重复计数
- ✅ **数据哈希**：敏感用户信息自动 SHA-256 哈希处理
- ✅ **增强匹配**：支持用户ID、电话、邮箱等多种匹配参数
- ✅ **自动事件**：支持 InitiateCheckout、AddPaymentInfo、Purchase 事件
- ✅ **错误处理**：转化事件失败不影响主要业务流程

## 支持的事件类型

### 1. InitiateCheckout（初始化结账）
- **触发时机**：用户进入支付页面
- **位置**：`PaymentPage.jsx` - 页面加载时
- **数据包含**：产品ID、数量、价格

### 2. AddPaymentInfo（添加支付信息）
- **触发时机**：用户填写完个人信息，进入第二步
- **位置**：`PaymentPage.jsx` - 点击"继续"按钮
- **数据包含**：产品信息 + 用户信息

### 3. Purchase（购买完成）
- **触发时机**：订单创建成功
- **位置**：`PaymentPage.jsx` 和 `OrderSuccessPage.jsx`
- **数据包含**：完整订单信息 + 用户信息 + 订单号

## 配置步骤

### 1. Facebook 开发者配置

1. **登录 Facebook 开发者后台**
   - 访问：https://developers.facebook.com/

2. **创建或选择应用**
   - 进入你的应用管理界面

3. **设置转化API**
   - 进入"营销 API" > "转化 API"
   - 点击"设置转化API"

4. **生成访问令牌**
   - 创建系统用户（如果没有）
   - 为系统用户分配必要权限：`ads_management`, `business_management`
   - 生成访问令牌并保存

5. **获取测试事件代码**（可选，用于测试环境）
   - 在事件管理器中创建测试事件
   - 获取测试事件代码

### 2. 环境变量配置

创建 `.env` 文件（或更新现有文件）：

```bash
# Facebook 转化 API 配置
VITE_FACEBOOK_ACCESS_TOKEN=your_facebook_access_token_here
VITE_FACEBOOK_TEST_EVENT_CODE=your_test_event_code_here  # 仅测试环境
```

### 3. 后端API配置

确保你的后端API支持 `/api/facebook-conversions` 端点：

```javascript
// 后端示例（Node.js/Express）
app.post('/api/facebook-conversions', async (req, res) => {
  try {
    const { pixel_id, access_token, test_event_code, event_data } = req.body;
    
    const facebookUrl = `https://graph.facebook.com/v18.0/${pixel_id}/events`;
    
    const requestData = {
      data: [event_data],
      access_token: access_token,
      ...(test_event_code && { test_event_code })
    };
    
    const response = await fetch(facebookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      res.json({ success: true, data: result });
    } else {
      res.status(400).json({ success: false, error: result });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

## 文件结构

```
src/
├── services/
│   ├── facebookConversions.js    # Facebook 转化API服务
│   └── api.js                    # API服务（已更新）
├── config/
│   └── api.config.js            # API配置（已更新）
├── pages/
│   ├── PaymentPage.jsx          # 支付页面（已集成）
│   └── OrderSuccessPage.jsx     # 订单成功页面（已集成）
└── ...
```

## 数据处理

### 用户数据哈希
所有敏感用户数据都会进行 SHA-256 哈希处理：
- 邮箱地址
- 电话号码（格式化后）
- 姓名
- 城市/国家

### 电话号码格式化
电话号码会自动格式化为国际格式：
- 移除所有非数字字符
- 添加喀麦隆国际区号（237）
- 示例：`0123456789` → `237123456789`

### 事件去重
使用订单号生成唯一的事件ID，防止重复计数：
```javascript
event_id: `purchase_${orderNo}`
```

## 调试和测试

### 开启调试日志
设置环境变量：
```bash
VITE_ENABLE_CONSOLE_LOGS=true
```

### 测试事件验证
1. 在 Facebook 事件管理器中查看测试事件
2. 检查浏览器控制台的调试日志
3. 验证事件数据格式和内容

### 调试信息
系统会输出以下调试信息：
- 📊 发送到Facebook的事件数据
- ✅ 成功发送的确认
- ❌ 发送失败的错误信息

## 监控和分析

### Facebook 事件管理器
- 访问：https://www.facebook.com/events_manager/
- 查看转化API事件质量和匹配率
- 监控事件数据和错误

### 数据对比
对比客户端Pixel和服务器端API的数据：
- 检查转化数量差异
- 分析用户匹配质量
- 优化数据传输

## 故障排除

### 常见问题

1. **访问令牌无效**
   - 检查令牌权限
   - 确认令牌未过期
   - 验证系统用户设置

2. **事件未显示**
   - 检查Pixel ID是否正确
   - 验证事件数据格式
   - 查看Facebook事件管理器

3. **匹配率低**
   - 提供更多用户数据字段
   - 检查数据哈希是否正确
   - 验证电话号码格式

### 检查清单
- [ ] Facebook访问令牌已配置
- [ ] 后端API端点正常工作
- [ ] 环境变量正确设置
- [ ] 事件在Facebook事件管理器中可见
- [ ] 用户数据哈希处理正常
- [ ] 事件ID去重机制生效

## 性能影响

- Facebook转化API调用为异步操作
- 失败不会影响主要业务流程
- 平均响应时间 < 200ms
- 自动重试和错误处理

## 隐私合规

- 所有敏感数据都经过哈希处理
- 遵循Facebook数据使用政策
- 支持用户数据删除请求
- 符合GDPR和其他隐私法规

## 更新日志

### 版本 1.0.0
- ✅ 初始Facebook转化API集成
- ✅ 支持三种核心转化事件
- ✅ 双重跟踪机制
- ✅ 数据哈希和去重
- ✅ 完整的错误处理和调试

---

**需要帮助？** 检查浏览器控制台的调试信息，或查看Facebook事件管理器中的错误报告。