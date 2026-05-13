# COD 单页优化维护记录

更新时间：2026-05-13 13:18 CST

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

### 后台下单漏斗

- 管理端“下单漏斗”默认只统计带有效 `Ad ID` 的 checkout session，用来排除内部测试、自然刷新和无广告来源用户。
- 如果手动输入 `Ad ID` 筛选，口径是：同一个 checkout session 内任意 COD checkout 事件带这个 `Ad ID`，后续没重复携带 `Ad ID` 的步骤也仍算进该广告流量。
- 主漏斗里的“到达率”是相对第 1 步“点击下单”的整体到达率。
- 主漏斗右侧用带前置动作的业务句解释相邻步骤损耗，例如“34.5% 的人在完成大区选择后，未完成定位选择”“50.2% 的人在完成定位选择后，未进入个人信息填写”。不要只写“上步流失 / 未进入本步”这种需要二次理解的内部话术。
- 管理端版本筛选使用北京时间展示版本窗口，但传给后端时要按 UTC 时间查 `vite_analytics_events.created_at`。数据库当前 `created_at` 与 `NOW()` 都是 UTC。
- 主漏斗必须按 `checkout_start` cohort 统计：时间窗口先圈定窗口内点击下单的 checkout session，后续步骤只能统计这批 session。不能单纯按每一步事件发生时间过滤，否则窄版本窗口里会把上一个版本遗留到本窗口的后续事件算进来，出现到达率超过 100%。
- 管理端版本筛选对外只保留粗粒度版本：`v1 埋点上线` 与 `v2 下一步按钮固定`。中间定位、地图、布局等细节留在维护记录里，不放进后台筛选下拉。
- 订单成功预览页按钮点击率按 `order_create_success` 去重人数做分母，因为 App 下载和 WhatsApp 联系按钮只在下单成功后出现。两个事件分别是 `order_success_app_download_click` 和 `order_success_whatsapp_contact_click`，只进第一方 checkout 埋点，不发给 Meta Pixel。
- 2026-05-13 12:41 CST 后，管理端下单漏斗默认数据基线改为“当前稳定口径”：所有维度默认只统计 `2026-05-13 04:41:34 UTC` 之后的广告流量。旧数据保留在库里，但不再混入后台默认分析，避免新旧埋点字段不一致造成只有分母或只有分子的指标。

### 定位方式

- `location_selected` + `location_method = current_location`：最终使用当前定位成功落点。
- `location_selected` + `location_method = manual_map`：最终手动在地图上选择位置。
- `location_current_attempt`：用户明确点击过“使用当前定位”按钮。
- `location_current_failed`：浏览器定位失败或超时。2026-05-13 12:38 后，该事件代表单次低精度定位 6 秒内最终失败，不再混入第二次高精度定位失败。

如果用户先点“使用当前定位”，又手动点地图，最终定位方式按最后实际选择的位置判定；同时后台有“点过当前定位”维度，用来区分用户是否尝试过定位按钮。

### 定位失败

后台已经统计失败原因，包括：

- permission_denied：用户拒绝权限。
- position_unavailable：浏览器/设备拿不到位置。
- timeout：定位超时。
- unsupported：浏览器不支持定位。
- unknown_error：其他未知错误。

当前优化方向是：定位不能让用户一直干等，必须允许用户随时手动选地图。

当前前台策略：

- 点击“使用当前定位”后，只发起一次低精度浏览器定位：`enableHighAccuracy: false`，`timeout: 6000`，`maximumAge: 5min`。
- 4 秒还没返回时，页面提示用户可以手动在地图上选，不阻塞页面。
- 不再发起第二次 `enableHighAccuracy: true` 高精度定位请求；历史数据看高精度二次补救贡献很小，且会让失败口径变复杂。
- `location_selected` / `location_current_failed` 会记录 `geolocation_duration_ms`、`geolocation_timeout_ms`、`geolocation_enable_high_accuracy`；成功时记录 `geolocation_accuracy_m`，失败时记录 `error_code` 和截断后的 `error_message`。

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

### 2026-05-13

- 后台下单漏斗默认改为只统计带有效 `Ad ID` 的广告流量，排除测试流量、自然刷新和无广告来源 session。
- 后端 `ad_id` 筛选改为 session 级判断：只要同一次 checkout session 内有事件带该 `Ad ID`，后续步骤即使没有重复携带 `Ad ID`，也会计入该广告流量。
- 管理端主漏斗文案从“弃单”改成“上步流失”，明确这是相邻步骤流失，不是整体弃单率。
- 管理端日期筛选旁增加“大版本”筛选：
  - 默认仍为近 7 天。
  - 选择大版本后，查询窗口为该版本上线时间到下一个大版本上线时间。
  - 最后一个版本窗口结束时间为当前时间。
  - 后端 `parse_date_range` 支持精确 datetime / ISO 时间，避免一天内多个版本被混在同一个日期里。
- 修复窄版本窗口里到达率超过 100% 的问题：
  - 原因是每一步按事件发生时间独立过滤，用户可能在版本窗口开始前点击下单、窗口开始后才选大区或定位。
  - 后端改为先按窗口内 `checkout_start` 圈定 checkout session cohort，再统计这批 session 的后续步骤。
- 管理端版本筛选从细粒度版本收敛为两个对外阶段：`v1 埋点上线`、`v2 下一步按钮固定`。
- 优化 checkout cohort 查询性能：
  - 原实现为了保证 cohort 口径，在每个统计 SQL 里重复计算窗口内 `checkout_start` session，导致后台查询明显变慢。
  - 后端改为每次请求先查询一次 cohort session 列表，后续统计复用这批 session。
- 管理端漏斗文案继续业务化：
  - 表单数据不全卡片中，“修正后下单”和“放弃”人数后面补百分比。
  - 主漏斗右侧从“上步流失 X% / Y 人未进入本步”改为“X% 的人未完成某个具体步骤 / Y 人流失”。
- 订单成功预览页新增两个按钮点击埋点：
  - App 下载按钮：`order_success_app_download_click`。
  - WhatsApp 联系按钮：`order_success_whatsapp_contact_click`。
  - 后台 summary 展示两个点击人数和占下单成功人数的点击率。
- 当前定位策略调整：
  - 取消 4 秒快速定位失败后的第二次高精度定位请求。
  - 低精度定位总等待从 4 秒提高到 6 秒，但 4 秒时仍提示用户可手动选择地图位置。
  - 成功和失败埋点补充定位耗时、超时阈值、是否高精度、成功精度和失败消息，便于后续判断是权限、设备不可用还是实际超时。
- 管理端下单漏斗默认查询窗口改为“当前稳定口径”：
  - 开始时间固定为 `2026-05-13 04:41:34 UTC`（北京时间 05-13 12:41）。
  - 版本下拉只保留“当前稳定口径”和“自定义日期”。
  - 自定义日期的开始时间也会被限制为不早于该基线，确保商品、广告、大区、定位、字段等所有维度使用同一套稳定口径。
- 下架商品详情页新增类目兜底跳转：
  - 商品详情接口仍返回 HTTP 404，让外部平台能识别这是不可售商品。
  - 404 JSON 额外返回 `category_id` 和 `product_id`，前端用 `category_id` 判断对应类目。
  - 下架页“Voir d'autres produits”按钮旁显示 3 秒倒计时；用户不操作时自动跳到 `/?category_id=...`，如果拿不到类目则回首页。
  - 首页支持读取 `category_id` URL 参数并自动选中对应类目 tab。
- 管理端“接口失败”展示改为“接口异常”：
  - 后端按同一个 checkout session 内的事件顺序拆分 `order_create_failed`。
  - 如果后续出现 `order_create_success`，计入“重试后成功”。
  - 如果后续没有成功事件，计入“未成功”。
  - 管理端顶部卡片展示异常总人数、占最终点下单比例、重试后成功人数和未成功人数，避免把短暂接口异常误读成最终失败订单。
- 新增“落地页转下单”独立模块：
  - 前端商品落地页加载成功后发 `product_landing_view`，下架 404 页不计入。
  - 每次落地页访问生成 `landing_session_id`；后续 `checkout_start` 继续用 `checkout_session_id`，但属性里带同一个 `landing_session_id`。
  - 后端按 `landing_session_id` 去重统计落地页访问、点击下单和落地页到下单率。
  - 管理端把该模块放在主漏斗上方，商品/广告维度展示落地页访问、点击下单和下单率；该模块不参与 checkout 主漏斗，也不受 District ID 筛选影响。

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
curl -s "https://www.brainnel.com$asset" | rg 'geolocation_duration_ms|location_current_attempt|Recherche de position'
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

## 事故记录

### 2026-05-13 定位后进个人信息页转化下滑

现象：2026-05-12 晚最后一版前台代码上线后，下单率明显下降。按小时拆 checkout 漏斗发现，主要断点不是订单接口，而是 `location_selected -> info_step_view`。

定位：

- `9d050ea` 为了让 Google Maps 手机端支持单指拖动，加入 `gestureHandling: 'greedy'`。
- 手机端 Step 2 地图高度接近半屏，`Précédent / Suivant` 在地图下方。
- 用户点完地图后，想继续往下滑找 `Suivant`，但单指滑动会被 Google Maps 捕获为拖地图，页面不容易继续滚动。
- 这导致用户已经完成定位埋点，但没有进入个人信息页。

修复：

- 手机端 Step 2 将 `Précédent / Suivant` 固定在屏幕底部。
- 手机端地图高度从 400px 压到 `min(340px, 46vh)`。
- 保留地图单指拖动体验，同时保证下一步按钮始终可见。

后续视觉优化：

- 进一步压缩 Step 2 顶部流程条、橙色定位说明和大区徽章。
- 法语说明保留完整含义但控制长度：“Si vous êtes à l’adresse de livraison, appuyez sur « Utiliser ma position ». Sinon, choisissez l’adresse sur la carte.”
- 地图高度改为移动端视口自适应，并在地图下方预留固定按钮高度，避免按钮遮住地图底部 10%-20%。
- 针对 720px 以下的小高度手机追加压缩规则：收紧顶部流程条、定位提示、按钮高度，并把地图高度按 `100dvh` 动态下调，保证小屏也能同时看到地图和“Suivant”按钮。
- 继续压缩小屏定位页非核心区域：移动端标题栏和 3 步流程条变薄，`Cocody - Abidjan` 从独立卡片改成地图下方轻量信息行，避免浮层遮挡地图道路信息。
