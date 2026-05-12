# COD 单页优化维护记录

更新时间：2026-05-13 00:20 CST

这个文档用于维护 COD ecommerce 单页优化的历史轨迹。后续如果对下单页、商品详情页、地图定位、埋点、后台漏斗分析、大区排序等做了重要调整，先把关键结论追加到这里。上下文压缩后，优先读这个文件恢复背景。

## 项目边界

- 主前端：`/Users/jushenxiaoshan/projects/brainnel/cod-ecommerce`
- 主下单页：`src/pages/PaymentPage.jsx`
- 地图组件：`src/components/MapSelector.jsx`
- 后端下单与大区接口：`app_backend/product_api/app/api/endpoints/flash_local.py`
- 后端漏斗统计：`app_backend/product_api/app/models/vite_analytics.py`
- 管理端漏斗页：`app_admin_web`

本窗口后续默认聚焦 COD 单页体验和转化优化，不扩散到无关业务。

## 当前下单流程

1. 商品详情页点击下单，进入 checkout。
2. SKU/数量选择。
3. 大区选择。
4. 定位选择，可以手动点地图，也可以点击“使用当前定位”。
5. 个人信息填写：姓名、电话、WhatsApp、地址描述。
6. 点击最终下单，创建 COD 订单。

所有埋点都是旁路上报，不阻塞用户下单。订单按钮、页面跳转、订单 API 都不能等待埋点结果。

## 重要口径

### 定位方式

- `location_selected` + `location_method = current_location`：最终使用当前定位成功落点。
- `location_selected` + `location_method = manual_map`：最终手动在地图上选择位置。
- `location_current_attempt`：用户明确点击过“使用当前定位”按钮。
- `location_current_failed`：浏览器定位失败或超时。

如果用户先点“使用当前定位”，又手动点地图，最终定位方式按最后实际选择的位置判定；同时后台有“点过当前定位”维度，用来区分用户是否尝试过定位按钮。

### 定位失败

后台已经统计失败原因，包括：

- permission_denied：用户拒绝权限。
- position_unavailable：浏览器/设备拿不到位置。
- timeout：定位超时。
- unsupported：浏览器不支持定位。
- unknown_error：其他未知错误。

当前优化方向是：定位不能让用户一直干等，必须允许用户随时手动选地图。

### 大区排序

大区接口本身会按 `local_pallet.districts.sort_order` 返回。2026-05-12 已按历史 COD 网页订单量固定排序，不在页面加载时实时计算。

当前固定顺序：

1. Cocody
2. Yopougon
3. Marcory
4. Abobo
5. Koumassi
6. Bingerville
7. Adjamé
8. Treichville
9. Port-Bouet
10. Le Plateau
11. Anyama
12. Grand-Bassam
13. Songon

### 表单校验失败

后台“表单校验失败”来自 `submit_validation_failed`，表示用户在个人信息页点击了最终下单按钮，但前端校验未通过，所以订单接口没有被调用。

当前校验条件：

- 姓名不能为空。
- 电话必须是 10 位。
- WhatsApp 必须是 10 位。
- 地址描述不能为空，且至少 5 个字符。

这个指标按 `checkout_session_id` 去重，但不是和“最终点下单”互斥的漏斗步骤。一个用户可能先点下单时校验失败，补全信息后再次点击并成功下单；这种 session 会同时计入“表单校验失败”和“最终点下单/下单成功”。

因此：

- “个人信息填写 - 最终点下单”才是这一段的最终流失人数。
- “表单校验失败”更适合作为辅助诊断指标，说明有多少用户在提交前遇到过信息不完整或格式不对。
- 如果要看真正因为表单校验卡住的人，应看 `submit_validation_failed` 且没有后续 `submit_order_click/order_create_success` 的 session。

后台已拆分成：

- 已修正下单：同一个 checkout session 先触发 `submit_validation_failed`，之后又触发 `submit_order_click`。
- 未修正流失：同一个 checkout session 触发过 `submit_validation_failed`，但之后没有触发 `submit_order_click`。

管理端展示时不要只写“已修正下单 / 未修正流失”，需要写清楚业务含义：因姓名、电话、WhatsApp 或地址描述不完整拦截多少人，其中多少人修正后下单、多少人放弃。

2026-05-13 00:08 CST 查询近 7 天时，信息不完整拦截 47 个 session，其中已修正下单 42，未修正流失 5。

## 已完成改动

### 2026-05-12

- 做了 COD ecommerce 桌面端适配，原先主要只适配了手机端。
- 修复手机端商品详情页跳转后没有回到页面 top、主图顶部被遮挡的问题。
- 手机端大区选择改成双列布局。
- 定位选择文案改成法语，并增加“Utiliser ma position actuelle”按钮。
- 实现 checkout 漏斗埋点：
  - 生成 `device_id` 和 `checkout_session_id`。
  - 优先使用 `navigator.sendBeacon`，fallback 到 `fetch keepalive`。
  - 埋点失败只 `console.warn`，不弹窗、不阻塞、不改变页面状态。
  - 字段完成埋点只记录完成状态，不记录姓名、电话、WhatsApp、地址正文。
- 后端复用 `vite_analytics_events`，新增 checkout funnel 统计接口。
- 管理端新增“下单漏斗”页面，展示漏斗步骤、定位方式、当前定位按钮、失败原因、字段完成率、商品/广告/大区维度。
- 商品维度明细改成中文商品名 + 商品主图。
- 当前定位按钮统计改成显式按钮点击口径：
  - `app_backend` commit `13b7caa` 推送到 `main`。
  - 同步 cherry-pick 到 `test`，commit `dbe037a`。
- 当前定位体验优化：
  - 浏览器定位缓存从 1 分钟提升到 5 分钟。
  - 快速定位：`enableHighAccuracy: false`，`timeout: 4000`，`maximumAge: 5min`。
  - 高精度后台跟进：`enableHighAccuracy: true`，`timeout: 8000`，`maximumAge: 5min`。
  - 4 秒还没拿到时，用法语提示用户可以手动在地图上选择，不阻塞页面。
  - 如果用户已经手动点地图，后台定位结果不能覆盖手动选择。
  - `cod-ecommerce` commit `ac91663` 已部署。
- Google Maps 手机端手势改成单指拖动：
  - `src/components/MapSelector.jsx` 增加 `gestureHandling: 'greedy'`。
  - `cod-ecommerce` commit `9d050ea` 已推送 `main`。
- 大区卡片排序按历史 COD 网页订单量固定写入 `local_pallet.districts.sort_order`，无需代码部署。
- 后台“表单校验失败”拆成“已修正下单 / 未修正流失”：
  - 后端 checkout funnel summary 新增 `validation_fixed_submit_sessions`、`validation_fixed_success_sessions`、`validation_unresolved_sessions` 以及对应比例。
  - 管理端顶部卡片用“已修正下单”和“未修正流失”替换原先单个“表单校验失败”卡片。

## 验证方式

### 前端构建

```bash
cd /Users/jushenxiaoshan/projects/brainnel/cod-ecommerce
npm run build
```

### 线上静态包验证

```bash
html=$(curl -s 'https://www.brainnel.com/')
asset=$(printf '%s' "$html" | rg -o '/assets/index-[^" ]+\.js' | head -1)
curl -s "https://www.brainnel.com$asset" | rg 'gestureHandling:"greedy"|location_current_attempt|Recherche de position'
```

### 大区接口验证

```bash
curl -s 'https://api.brainnel.com/backend/api/flash-local/cities-and-districts/' | python3 -m json.tool
```

### 大区排序 SQL

```sql
SELECT d.id, d.name, d.sort_order, COUNT(o.order_id) AS order_count
FROM districts d
LEFT JOIN flash_order o
  ON o.district_id = d.id
 AND o.is_deleted = 0
 AND o.is_web = 1
WHERE d.is_active = 1
GROUP BY d.id, d.name, d.sort_order
ORDER BY CASE WHEN d.sort_order = 0 THEN 999999 ELSE d.sort_order END ASC, d.name ASC;
```

## 部署注意事项

- `cod-ecommerce` 前端改动通常推送 `main` 后由部署流程刷新 `https://www.brainnel.com/`。
- 验证线上是否生效，要看首页引用的 `/assets/index-*.js` 是否换成新包，并确认新包里包含目标代码。
- 推送 `app_backend` 时，需要同时推送 `main` 和 `test`。
- 文档更新本身不影响线上页面，但建议也提交进 repo，方便后续上下文和跨设备查看。

## 后续维护规则

- 每次完成 COD 单页相关重要修改后，在“已完成改动”里追加日期和要点。
- 如果改了统计口径，在“重要口径”里同步更新。
- 如果改了部署或验证方法，在“验证方式”或“部署注意事项”里同步更新。
- 避免在这里记录用户姓名、电话、WhatsApp、详细地址、数据库密码等敏感信息。
