# COD 单页优化维护记录

更新时间：2026-05-22 CST

这个文档用于维护 COD ecommerce 单页优化的历史轨迹。后续如果对下单页、商品详情页、地图定位、埋点、后台漏斗分析、大区排序等做了重要调整，先把关键结论追加到这里。上下文压缩后，优先读这个文件恢复背景。

## 2026-05-22 当前预览

- 新增本地预览分支 `checkout_quantity_variant=single_page` / `g`，用于验证 G 组“渐进式单页 checkout”：点击下单后同页完成大区、地址描述和个人信息；地图标点只作为地址字段下方的可选入口。
- `single_page` 分支仍保留 B 组的默认数量 1 和页内改数量逻辑；如果本机没有上次大区，用户先看大区列表，点击大区后同页展开地址和个人信息表单；如果本机已有上次大区，则进入 checkout 后直接恢复该大区和大区中心坐标，跳过大区列表，直接展示个人信息，并保留“Changer”按钮供用户换区。
- `single_page` 分支默认把定位完成为所选大区中心点，埋点 `location_method = district_center_auto_skip`；如果用户点“Optionnel : marquer sur la carte”并真正标点，则沿用现有地图页、地图搜索和手动标点缓存逻辑。
- E 组地图可选标点页已补齐搜索框，搜索/候选/落点逻辑和 G 组对齐；区别仍是 E 组先重新点大区再进入信息页，G 组有本机大区缓存时可直接进入信息页。
- G 组信息页 UI 降低橙色背景和边框密度：商品数量卡、大区卡、WhatsApp 勾选和输入框改成更中性的白底/灰边，橙色只保留在价格、定位图标和主按钮上。
- G 组打开大区列表时不再显示底部下单按钮；个人信息页底部左按钮改为 `Voir le produit`，切换大区只保留顶部大区卡里的 `Changer`，避免同一页面出现两个换区入口。
- 分流已切到 E/G 各 50%：E 组 `address_first` 保留地址优先版；G 组 `single_page_checkout` 复用 E 组落地页权益表达，checkout 改为渐进式单页。A/B/C/D/F 只保留 URL 强制预览和历史数据识别，不再自然分配流量。
- 后台下单漏斗已兼容 G 组：`single_page_checkout` 不再落到 unknown；A/B/C/D/E/F/G 对比表、定位方式组内占比、E/G 地址优先补定位和 F/E/G 地图搜索明细都能分组展示。默认版本窗口切到“G组单页下单上线”（`2026-05-22 04:13:46 UTC` / 北京时间 05-22 12:13）。

## 2026-05-21 当前补丁

- checkout 页面新增 `sessionStorage` 页面状态兜底：商品/组合品、数量、分组、已选大区、地图标点和地图状态会在同一浏览器会话内保存 2 小时。用户刷新或浏览器恢复 checkout 页面时，不再因为 `location.state` 丢失直接回首页；成功创建订单后清理该兜底状态，降低重复下单风险。
- 落地页停留埋点修正：`visibility_hidden/pagehide/unmount` 仍只发送一次被动退出事件，但如果用户切后台后又回来点击下单，会额外补发一次 `landing_exit_reason = checkout_click`，保证“点下单前停留/滚动”口径不漏这类用户。后端按 `landing_session_id` 聚合取最大值，不会因为补发事件把同一落地页会话重复计入落地页访问。
- 当前定位按钮已经全量隐藏，本次把 checkout 主流程里旧的浏览器定位请求、蓝点渲染和相关状态清理掉；历史埋点口径仍保留，但当前 checkout 不再产生新的 `location_current_attempt/current_location`。
- 单主图商品/组合品把详情图提升到主图轮播时，提升图在主图区域按顶部裁切预览显示，避免长详情图被完整塞进方形主图框后显得过小或比例不协调；详情区仍完整重复展示原详情图，浏览器可复用同一图片 URL 缓存，不会按业务逻辑重复请求两份不同图片。
- 地图搜索分支选中候选点后，会和手动点地图走同一套缓存：立即写入当前 checkout `sessionStorage` 和同大区手动标点 `localStorage`，并保留候选点名称/`placeId`。刷新 Step 2 时如果当前页面状态没有 marker，或只有大区中心/兜底中心 marker，但同大区存在手动标点缓存，会自动恢复为 `manual_cached`；如果 session 里只有坐标没有地点名，会用长期缓存补回地点名。地图下方优先展示用户选中的地点名，例如 `Fun Hose`，下面再展示大区，避免用户以为刷新后又回到了大区中心。
- 地址标点教学弹层全量取消；地图搜索选点成功/恢复成功后的绿色提示只保留底部按钮区一条，搜索框下方不再重复展示同一句。

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
2. A 组旧流程进入 SKU/数量弹窗；B/C/D 组默认数量 1 并把数量控件放在大区页上方。
3. 大区选择。
4. 定位选择，所有浏览器环境都不再展示“使用当前定位”按钮，统一直接引导用户在地图上选择收货地址或走地址优先流程。
5. 个人信息填写：姓名、电话、WhatsApp、地址描述。
6. 点击最终下单，创建 COD 订单。

所有埋点都是旁路上报，不阻塞用户下单。订单按钮、页面跳转、订单 API 都不能等待埋点结果。

## 重要口径

### 后台下单漏斗

- 管理端“下单漏斗”默认只统计带纯数字 Meta `Ad ID` 的 checkout session，用来排除内部测试、自然刷新、TikTok 标记和无广告来源用户。
- 如果手动输入 `Ad ID` 筛选，口径是：同一个 checkout session 内任意 COD checkout 事件带这个纯数字 `Ad ID`，后续没重复携带 `Ad ID` 的步骤也仍算进该广告流量；非数字 `Ad ID` 不再进入默认有效数据。
- 主漏斗里的“到达率”是相对第 1 步“点击下单”的整体到达率。
- 主漏斗右侧用带前置动作的业务句解释相邻步骤损耗，例如“34.5% 的人在完成大区选择后，未完成定位选择”“50.2% 的人在完成定位选择后，未进入个人信息填写”。不要只写“上步流失 / 未进入本步”这种需要二次理解的内部话术。
- 管理端版本筛选使用北京时间展示版本窗口，但传给后端时要按 UTC 时间查 `vite_analytics_events.created_at`。数据库当前 `created_at` 与 `NOW()` 都是 UTC。
- 主漏斗必须按 `checkout_start` cohort 统计：时间窗口先圈定窗口内点击下单的 checkout session，后续步骤只能统计这批 session。不能单纯按每一步事件发生时间过滤，否则窄版本窗口里会把上一个版本遗留到本窗口的后续事件算进来，出现到达率超过 100%。
- 管理端版本筛选对外只保留粗粒度版本。当前保留“当前稳定口径”“FB排除获取定位按钮”“下单减摩擦A/B/C”和“自定义日期”；其中“FB排除获取定位按钮”从 `2026-05-14 01:27:30 UTC`（北京时间 05-14 09:27）开始。
- 订单成功预览页按钮点击率按 `order_create_success` 去重人数做分母，因为 App 下载和 WhatsApp 联系按钮只在下单成功后出现。两个事件分别是 `order_success_app_download_click` 和 `order_success_whatsapp_contact_click`，只进第一方 checkout 埋点，不发给 Meta Pixel。
- 2026-05-13 12:41 CST 后，管理端下单漏斗稳定基线改为“当前稳定口径”：所有维度不早于 `2026-05-13 04:41:34 UTC`。旧数据保留在库里，但不再混入后台默认分析，避免新旧埋点字段不一致造成只有分母或只有分子的指标。
- 2026-05-14 09:27 CST 后，管理端下单漏斗默认版本窗口改为“FB排除获取定位按钮”：所有维度默认只统计 `2026-05-14 01:27:30 UTC` 之后的广告流量，便于观察 FB / Instagram 内置浏览器隐藏当前定位按钮后的转化变化。
- 管理端主漏斗默认使用“异常重复点击清洗后口径”：
  - 原始 `vite_analytics_events` 不删除，方便后续追查。
  - 同一个 `device_id + product_id + ad_id`，在 10 分钟内连续触发多个 `checkout_start`，且这些 session 没有进入 `quantity_confirmed`，只保留前 3 次进入主漏斗。
  - 第 4 次及之后计入 `duplicate_checkout_excluded_sessions`，后台顶部显示“已排除重复点击”，不再污染商品/广告/主漏斗下单尝试数。
  - 这个规则只处理未完成 SKU 数量选择的重复点击；已经进入后续步骤的 session 不会被剔除。

### 下单减摩擦 A/B/C/D/E/F/G

- A/B/C/D/E/F/G 分组不是每次打开页面重新随机，而是设备级固定分流：首次生成 `device_id` 后，对 `device_id` 做 hash。当前准备自然分流只进入 E/G：E 组 `address_first` 占 50%；G 组 `single_page_checkout` 占 50%。A 组 `quantity_modal`、B 组 `inline_quantity`、C 组 `cod_trust`、D 组 `cod_trust_landing`、F 组 `inline_quantity_map_search` 保留为 URL 强制预览和历史数据识别，不再自然分配流量。
- 本地调试可以用 URL 参数强制分组：`checkout_quantity_variant=quantity_modal`、`checkout_quantity_variant=inline_quantity`、`checkout_quantity_variant=cod_trust`、`checkout_quantity_variant=cod_trust_landing`、`checkout_quantity_variant=address_first`、`checkout_quantity_variant=map_search` 或 `checkout_quantity_variant=single_page` / `g`。
- B 组里“数量已定”和“已选大区”不是同一个动作：点击商品页下单按钮时会默认确认数量 1 件并记录 `quantity_confirmed`；进入大区页后，只有用户点击大区卡片才记录 `district_selected`。
- 判断默认数量 1 是否值得保留时，不能只看转化率，还要看平均件数。后台 A/B/C/D/E 表的“单均件数”主值来自 `order_create_success` 的成功订单平均数量；灰字“确认”来自 `quantity_confirmed` 的数量确认平均值。
- B/C/D 组兜底按钮事件是 `location_fallback_used`。点击兜底按钮后会同步记录 `location_selected`，且 `location_method = district_center_fallback`，所以在主漏斗里计入“完成定位”；E 组默认跳过地图页，使用 `district_center_auto_skip` 单独区分。
- 定位方式需要同时看整体和 A/B/C/D/E 组内占比：整体“定位方式”会混入不同组，只适合看大盘；判断兜底按钮或地址优先是否过度使用时，应看组内 `district_center_fallback / district_center_auto_skip / manual_map / current_location` 分布。
- E 组地址优先版需要额外看“补定位”拆解：`location_selected` 代表完成定位；`location_method = district_center_auto_skip` 且没有 `location_auto_skip_map_requested` 代表没进地图直接用大区中心；`location_auto_skip_map_requested` 代表点过“可选：地图标点”；点过后最终 `manual_map/current_location` 代表真的补了坐标；点过后最终仍是 `district_center_auto_skip` 代表进地图但没标点，最后还是大区中心。
- 地图选择引导层保留，但只在同一浏览器本地第一次进入地图页时展示一次，状态写入 `localStorage`；清历史数据、换浏览器或无痕模式会重新展示。引导层自动关闭时间为 2.2 秒，避免长时间挡住地图和底部按钮。
- 商品主图自动轮播已从 C/D 扩展为全量商品页行为：只要主图超过 1 张，就 3.5 秒自动切换；用户手动滑动后停止自动轮播。该改动不改变 CTA 文案和 checkout 流程。
- 2026-05-21 起，如果商品主图只有 1 张，会把前 4 张详情图提升到主图轮播中；这些图片复用原详情图 URL，详情区仍完整展示全部详情图，避免用户下滑看详情时缺图。
- 2026-05-21 起，组合品页同步单品页主轮播逻辑：组合品主图只有 1 张时，把前 4 张 `detail_images` 提升到主图轮播，详情区仍重复展示全部详情图；组合品页同时增加前端派生折扣展示、倒计时，以及“Produits inclus”子商品点击跳转到对应单品页。
- 落地页新增 `product_landing_engagement` 停留时长埋点：页面隐藏、离开、进入 checkout 或组件卸载时通过 `sendBeacon/fetch keepalive` 旁路上报 `landing_duration_ms`、`landing_max_scroll_percent` 和退出原因，不等待结果，不影响点击下单。
- 管理端落地页模块除全体平均滚动外，也展示“下单前停留 / 点下单平均滚动”。2026-05-20 起，这两个点击前指标只统计 `landing_exit_reason = checkout_click` 的 `product_landing_engagement`，避免页面隐藏、切后台或组件卸载事件混入口径；全体平均停留和未下单停留仍看所有 engagement 原因。
- 分析落地页停留和滚动时，不要只看平均值：
  - 只分析点下单前行为时，先筛 `event_name = product_landing_engagement`、`landing_exit_reason = checkout_click`、纯数字 Meta `ad_id`，按 `landing_session_id` 去重。
  - 停留时间要同时看平均值、中位数、P75、P90 和分桶；少量用户停留几分钟会明显拉高平均值，中位数更接近普通用户。
  - 滚动比例是 `scrollY / (documentHeight - viewportHeight)`，代表滚动条进度，不等于“看过了多少内容”。用户首屏不滚动时仍可能已经看见主图、价格、权益、SKU 和底部 CTA。
  - 重点拆四类人：低滚动快速下单（广告种草/价格合适直接买）、低滚动长停留（首屏犹豫或看轮播）、高滚动快速下单（快速扫详情）、高滚动长停留（认真看详情后买）。
  - 结论判断：如果低滚动快速下单占比高，关键承诺和价格必须放首屏；如果高滚动长停留占比高，详情图和详情文案仍有说服作用；如果低滚动长停留异常升高，优先排查首屏信息是否太密、CTA 是否不清楚、图片/页面是否加载慢。
- 首屏加载优化：商品页保留为主路径同步加载；支付页、订单成功页、组合品页、下载页和地址更新页做路由懒加载；地图组件在进入地图步骤时才加载；非首屏商品/描述图片使用懒加载和异步解码。
- 2026-05-20 为降低点击下单后的 checkout 页面冷加载风险，保留路由拆包，但商品详情页和组合包详情页在产品加载完成后的 idle 时间预加载 `PaymentPage` chunk；点击下单时也会立即触发一次预加载。这个改动只暖包，不改变 B/E 分组、checkout 业务逻辑或埋点口径。
- 2026-05-20 起，个人信息页全量启用本机浏览器缓存：姓名、电话、WhatsApp、地址描述只保存在当前浏览器 `localStorage`，同机同浏览器下次进入个人信息页会自动带出。只保存有效字段，字段级覆盖；不上传真实个人信息到埋点。清浏览器数据、换浏览器或换设备后缓存失效。
- 2026-05-20 本地已测：大区和真实手动地图标点也走本机浏览器缓存。大区列表会把上次选择的大区置顶并标记 `Choisi la dernière fois`；只有 `manual_map` 真正在地图上标过点才保存坐标，兜底按钮和 E 组默认大区中心不写入坐标缓存。B 组再次选择同一大区时仍进入地图页，只是默认带出上次手动标点并允许修改；E 组只有用户点击“可选：地图标点”进入地图页时才带出上次手动标点，不在地址优先主流程里偷偷使用旧坐标。Attécoubé 已由后端作为真实大区返回，前端不再做 Yopougon alias。
- 2026-05-21 预览版：从 B 组当前稳定流程里拆出 `inline_quantity_map_search` 分支，整体自然流量计划为 B 组 45%、地图搜索分支 20%、E 组地址优先 35%。地图搜索分支在地图标点页增加 Yango 风格的顶部搜索浮层；搜索只作为地图页辅助工具，不进入 E 组地址优先主流程。当前版本输入停顿后用 Google Places Autocomplete 返回最多 5 条候选，`OK` 只是手动触发兜底；输入联想不再把 `Abidjan, Côte d’Ivoire` 强行拼到 query 后面，只用 CI 国家限制和已选大区中心做轻微排序偏置，避免过度限制用户搜索；当候选过少时补一次 Query Autocomplete 兜底。城市级泛结果如 `Abidjan` 会被过滤，避免用户误点后把城市中心当作收货点缓存。同一个输入只自动查询一次，返回结果后不因状态变化重复查询；选中候选后输入框保留用户点的候选文案，避免 Google place detail 回填 `9X6Q+...` 这类 plus code。选中搜索结果后地图移动并落点，用户仍可手动调整。埋点记录 `location_search_submit/results/selected/failed`，只记录 query 长度和结果数量，不记录用户输入的真实地址文本。
- E 组地址优先版的商品页/组合品页首屏权益从 4 个短卡片改为 3 条完整承诺：24-48h 免费送货且不额外收费、付款前可检查包裹且骑手到前电话联系、产品不合适或有问题可退。B/D 等其它组继续保留原权益展示，避免影响稳定组。
- 管理端“兜底地址订单质量”用于观察兜底坐标是否影响后续配送结果。统计范围固定从兜底按钮上线时间 `2026-05-15 03:42:42 UTC`（北京时间 05-15 11:42）开始，到当前查询窗口结束；A 组旧流程作为无兜底按钮对照，B/C/D 组拆分“使用兜底按钮 / 未使用兜底按钮”。该模块按真实派送口径统计：`order_status=3` 为已签收，`order_status=7` 为拒收或配送失败，其他未完成派送状态归入待履约；`order_status IN (4,5,6)` 已取消订单不展示、不进分母，因为没有尝试派送。“已出结果签收率”会排除待履约订单，避免新订单未配送完成时误伤签收率。测试品订单按订单内商品全部 `is_test=1` 判定，会从签收率和待履约分母里排除，并单独展示排除数量。

### 定位方式

- `location_selected` + `location_method = current_location`：最终使用当前定位成功落点。
- `location_selected` + `location_method = manual_map`：最终手动在地图上选择位置。
- `location_selected` + `location_method = district_center_fallback`：用户没有点地图坐标，点击兜底按钮后用所选大区中心点继续。
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

- 2026-05-20 起，Step 2 全量隐藏“Utiliser ma position”按钮，提示统一为“Veuillez choisir votre adresse de livraison sur la carte.”。不再按 FB / Instagram 内置浏览器和普通浏览器分体验，因为普通浏览器的当前定位成功率也偏低。
- `browser_context` / `is_meta_in_app_browser` 仍作为被动埋点字段保留，用于事后分析来源环境，但不再决定定位页 UI。
- 历史“使用当前定位”低精度 6 秒逻辑保留在代码里但不再出现在当前 checkout UI；除非未来重新打开入口，否则不再产生新的当前定位按钮尝试数据。
- 本地 `browser_context=facebook_in_app` / `instagram_in_app` 预览参数可继续用于回放历史内置浏览器样式，但当前全量 UI 已一致，不再依赖该参数切换定位页体验。
- 手机端地图页必须防止“单指拖地图后页面滑不下去”的旧问题复发：关键继续按钮必须固定在地图下方的底部操作区，不能依赖用户继续向下滚动才能看到。
- checkout 埋点属性会携带 `browser_context` 和 `is_meta_in_app_browser`，方便后续拆分内置浏览器和普通浏览器的定位/下单表现。
- `location_selected` / `location_current_failed` 会记录 `geolocation_duration_ms`、`geolocation_timeout_ms`、`geolocation_enable_high_accuracy`；成功时记录 `geolocation_accuracy_m`，失败时记录 `error_code` 和截断后的 `error_message`。

### 大区排序

大区接口本身会按 `local_pallet.districts.sort_order` 返回。2026-05-12 已按历史 COD 网页订单量固定排序，不在页面加载时实时计算。2026-05-22 起，Attécoubé 已由后端作为真实大区返回，前端不再插入 alias 或重排，展示顺序完全跟随后端。

当前后端返回顺序：

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
14. Attécoubé（后端真实大区，点击、地图中心、提交订单、后台统计都按 Attécoubé 自己的数据处理）

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
- 管理端商品/广告明细折叠展示：
  - 落地页商品、落地页广告、checkout 商品、checkout 广告四个明细表默认只展示前 5 条。
  - 点击“展开剩余”后展示后端返回的全部明细，避免默认页面被长表格撑得太深。
- `BRPE000139` 异常拆分记录：
  - 2026-05-13 16:30 CST 左右查询当前稳定口径时，该商品的低转化主要集中在 `Ad ID = 120243984981390004`。
  - 该广告下 `BRPE000139 / product_id 946101641067` 大量 session 停在“点击下单后未完成 SKU 数量选择”，不是订单接口失败或表单校验失败造成。
- 异常重复点击治理：
  - 后端 checkout funnel 统计默认剔除“同设备、同商品、同广告、10 分钟内重复点击下单但未完成 SKU 数量选择”的异常 session，后台展示原始下单尝试数和已排除数量。
  - 前端 `beginCheckoutFunnel` 会在 10 分钟内复用同一个未完成数量选择的 checkout session，避免用户/异常点击连续制造新的 `checkout_start`。
- 个人信息填写页按钮固定：
  - 手机端第 3 步 `Informations de livraison` 的“Précédent / Passer la commande”固定在屏幕底部显示。
  - `info-section` 增加底部留白，避免固定按钮遮住地址描述、订单摘要或校验错误。
- 个人信息填写页 WhatsApp 减摩擦：
  - WhatsApp 默认勾选 `WhatsApp identique au téléphone`，用户只填电话即可自动复用为 WhatsApp。
  - 默认勾选时不展示额外号码摘要，减少页面复杂度；用户取消勾选后才展开独立 WhatsApp 输入框。
  - 提交、表单校验、购买事件和订单成功页都使用最终有效 WhatsApp。
  - checkout 埋点在字段完成、提交、成功/失败等关键事件中携带 `whatsapp_same_as_phone`，后续可评估该便捷项使用率和对表单流失的影响。
- Checkout 浏览器返回体验优化：
  - 下单页每一步写入 URL：`/payment?step=1/2/3`。
  - 手机浏览器返回键在第 3 步回定位、第 2 步回大区、第 1 步才回商品落地页。
  - 页面底部 `Précédent` 使用同一套浏览器历史逻辑，避免和系统返回行为不一致。
  - 用户返回大区页重新选择区域时，会清掉旧定位点，避免换了大区仍沿用上一个地图点。
- 管理端下单漏斗版本筛选新增“FB排除获取定位按钮”：
  - 窗口开始时间为 `2026-05-14 01:27:30 UTC`（北京时间 05-14 09:27），对应 `cod-ecommerce` commit `e8b6eb7`。
  - 后台默认选中该版本窗口，用来观察 FB / Instagram 内置浏览器隐藏获取定位按钮后的全链路数据。
  - WhatsApp 同电话属于小改动，不单独作为大版本筛选入口。
- 2026-05-15 “FB排除获取定位按钮”后续观察：
  - 统计窗口：`2026-05-14 01:27 UTC` 到 `2026-05-15 02:05 UTC`，仅看带 Ad ID 的 COD checkout session。
  - 主漏斗：`checkout_start 1716 -> quantity_confirmed 1319 -> district_selected 1160 -> location_selected 854 -> info_step_view 771 -> submit_order_click/order_create_success 642`，下单成功率约 `37.4%`。
  - 最大剩余损耗为 `checkout_start -> quantity_confirmed`（23.1%）和 `district_selected -> location_selected`（26.4%）。
  - 最终定位方式基本转为手动地图：`manual_map 831`，`current_location 23`；当前定位失败仍有少量，但已不是主漏斗核心问题。
  - 表单校验失败主要来自地址描述缺失：首次失败字段中 `addressDescription 208`，但多数用户会修正后下单。
- 2026-05-15 checkout 减摩擦 A/B 实验包：
  - 分流方式：设备级固定 50% / 50%，A 组保持旧落地页 + 旧数量弹窗，B 组进入“落地页福利化 + checkout 减摩擦”完整优化包。落地页优化和 checkout 流程优化暂时使用同一套 A/B，不拆成两个实验，便于最快观察整体下单率变化。
  - B 组落地页把四个服务点从“功能说明”改成“今日下单包含的福利”：阿比让免运费、24 小时内派送、货到付款（cash 或 Wave）、可退货。权益文案当前为 `Livraison gratuite / à Abidjan`、`Livraison 24h / à Abidjan`、`Paiement à réception / cash ou Wave`、`Retour possible / si problème`。
  - 倒计时不要放在页面最顶部，否则和价格/权益割裂；放在价格行右侧，桌面可显示 `Offre du jour · HH:MM:SS`，手机端只显示 `HH:MM:SS` 小胶囊，不重复四个权益文案，也不单独占一行。倒计时按设备生成 2-8 小时随机值并写入 localStorage，刷新不重新抽，避免看起来假。
  - CTA 附近展示“现在不用付款，收到再付”的信任文案。
  - B 组商品详情页点击下单后默认数量 1，直接进入大区选择；数量控件放在大区选择页上方，用户仍可加减数量。
  - B 组定位页增加兜底按钮，但文案必须带前置条件“Je n’arrive pas à choisir sur la carte”，避免用户误以为可以直接跳过地图点选。
  - 兜底按钮使用二级按钮样式，仍然清楚可点，但不能比地图点选后的“Suivant”更像主路径。用户如果找不到精确地图位置，可以用所选大区中心点先继续到信息页。
  - 兜底按钮必须在手机端固定在底部操作区，避免 Google Maps 单指拖动捕获页面滚动后用户找不到继续入口。
  - 兜底按钮只在用户尚未点过地图时展示；一旦用户在地图上点了坐标，兜底按钮隐藏，只保留“Suivant”。这样避免“用户已经给了自己的坐标，又被引导走大区中心兜底”的冲突。
  - B 组前端提交订单时按定位来源取坐标：未点地图而使用兜底按钮时提交所选大区中心点；用户点过地图时提交用户最后选择的地图坐标。
  - 注意：订单创建后 `app_backend` 会在后台异步调用 `app_admin` 的 `/address-tool/auto-check-and-fix-orders`。只要订单带经纬度，这个流程就会用 Google 反查 + Gemini 判断地址/大区/坐标是否一致；如果 AI 认为需要修正，会二次更新 `flash_order.latitude` / `flash_order.longitude` 和 `location_status`。因此排查“前端到底提交了哪个坐标”时，要看订单请求体或创建瞬间坐标；最终 DB 坐标可能已经是后端 AI 地址修正后的结果。
  - B 组表单页地址描述文案改成“Adresse détaillée et repère”，因为兜底路径可能没有精确坐标，不能只要求用户写参考物；placeholder 必须引导用户填写“地址范围 + 参照物”，例如区域/街道或小区 + 门口颜色/附近药店，避免用户只写一个参照物。校验失败时自动滚到第一个缺失字段。
  - 这组实验的埋点统一带 `checkout_quantity_experiment=checkout_quantity_flow_v1` 和 `checkout_quantity_variant=inline_quantity/quantity_modal`，后续后台按 variant 拆结果。`product_landing_view` 也会带同一组 variant，因此可以看落地页到点击下单率，也可以看 checkout 后续转化率。
  - 管理端下单漏斗新增版本窗口“下单减摩擦AB”，开始时间为 `2026-05-15 03:42:42 UTC`（北京时间 05-15 11:42）。后台新增 `A/B 分组`筛选和 A/B 对比表，可在同一版本窗口里分别查看 A 组旧流程、B 组优化包，以及整体对比。
  - 管理端 A/B 表新增“兜底按钮”列，后端字段为 `location_fallback_sessions`；比例默认看占已选大区人数，因为兜底按钮出现在大区之后、定位完成之前。
  - A/B 表头改成“数量已定 / 已选大区 / 完成定位”，避免误解 B 组同页里的不同事件。
  - 管理端新增“定位方式 A/B 对比”，每组内部单独计算最终定位方式占比，避免 B 组兜底按钮比例被 A 组流量稀释。
  - 管理端 A/B 表新增“单均件数”，用来观察 B 组默认数量 1 是否压低平均购买件数；主值为成功订单平均件数，灰字为数量确认平均件数。
  - 2026-05-16 抽查 B 组兜底按钮成功单：纯数字 Meta Ad ID 口径下，`location_fallback_used` 109 个 session，其中 88 个成功下单。成功单里地址描述平均约 33 字符，中位数约 31 字符；约 77% 地址描述可用，约 15% 中等，约 8% 太短或过泛。后台地址修正后约 65% 仍停留在大区中心附近，约 35% 被移动到离大区中心 80m 以上的位置，约 9% 最终大区发生变化。风险点：少量用户只写外地城市或非常泛的地址时，Google/Gemini 修正可能把订单带到错误或服务范围外的位置；兜底按钮要继续看配送异常和取消率，不能只看下单成功率。
  - 后续涉及 COD 单页上线前，必须先在线上环境走一个正式订单验证下单链路，再用取消订单接口取消该测试订单，避免再次出现“前端可点但订单接口失败”的事故。
  - COD 测试订单姓名固定使用 `Codex Test`，方便后台筛查和取消；不要临时起其它测试名。
- 2026-05-16 下单减摩擦实验升级为 A/B/C：
  - 新分流为 A 组旧流程 10%，B 组当前稳定版 45%，C 组 COD 承诺版 45%；设备级 hash 固定，localStorage 不清时用户不跳组。
  - C 组在 B 组基础上加强“无风险 COD”表达：商品页权益卡标题为 `Recevez d’abord, payez après`，CTA 附近强调 `Aucun paiement maintenant. Recevez le produit, puis payez en cash ou Wave.`。不要再额外加迷你流程条，因为下单页顶部已有 3 步流程指示。
  - C 组权益里的免运费必须直白写 `Livraison gratuite / à Abidjan`，不要改成 `Livraison offerte`，避免“免运费”利益点不够清楚。
  - C 组个人信息页地址描述 placeholder 改为引导用户写街区、附近药店、门口颜色、楼房/店铺旁边等配送员能用的地标；摘要区强调 `Aucun paiement maintenant. Cash ou Wave à la livraison.`
  - `BundleDetail` 同步补上 `quantity_confirmed`，否则组合品在 B/C 组会出现“点击下单后数量已定缺失”的漏斗假损耗。
  - 后台分组支持 `cod_trust`，管理端筛选和对比表改为 A/B/C；B 组文案从“优化包”改为“当前稳定版”，C 组显示“COD承诺版”。
  - `app_admin` Gemini 地址修正加保护：地址描述过泛、建议大区无法匹配后台有效大区、正向搜索/备用搜索无法通过反向大区验证时，不自动改经纬度，只把 `location_status` 标为 2 等人工确认，避免兜底订单被修到错误城市或错误大区。
  - C 组视觉层去 emoji 化：权益卡、支付提醒、大区图标、订单完成页和 App 下载弹窗统一换成 `react-icons` 线性图标；不使用固定生成图替代权益区，避免增加加载、降低文案灵活性和不同商品适配能力。
  - C 组商品主图开启轻量自动轮播：仅多图商品生效，3.5 秒切换一次，用户手动滑动/点击后停止自动切换；A/B 组保持原来的手动轮播。
  - 订单完成页不改流程和埋点，只做视觉升级：成功状态、履约承诺、配送信息、App 下载和 WhatsApp 联系按钮统一成更干净的卡片风格；重复的 `Rendez-vous de livraison` 提醒卡已删除，因为顶部文案已经说明会在 24 小时内通过电话或 WhatsApp 联系。
  - C 组信息页地址描述 helper 使用“téléphone ou WhatsApp”双通道表达，不要只写 WhatsApp。
  - 管理端下单漏斗版本窗口新增 `COD承诺版上线`，起点为 2026-05-16 09:21 北京时间；`下单减摩擦A/B/C` 窗口自然截止到该时间，后台默认查看最新 COD 承诺版上线后的数据。
  - 管理端新增“兜底地址订单质量”模块：不只看当前 C 组窗口，而是从 2026-05-15 11:42 北京时间兜底按钮上线开始累计到当前查询结束时间；A 组作为对照，B/C 组拆分是否点击兜底按钮，用真实派送口径观察签收率、已出结果签收率、拒收/配送失败和待履约。测试品订单会直接取消且不派送，已取消订单也没有尝试派送，两者都从该模块签收率计算中排除。
  - 修复 Step 2 地图页底部按钮窄屏挤压：A 组旧流程在用户点完地图后没有 `with-location-fallback` class，绿色“Position marquée”提示会和 `Précédent / Suivant` 同行竞争宽度，部分手机上按钮被挤窄。现在只要已选地图点，底部固定栏统一改成两行布局：第一行提示，第二行两个按钮各占一半；B/C 组也沿用同一保护。清浏览器历史能暂时恢复，通常是因为清掉 localStorage/sessionStorage 后重新分组或重新拿静态资源，但这不是可靠修复。
  - 本地开发可用 `/order-success?preview_order_success=1` 预览订单完成页视觉；该入口仅 `DEV` 环境生效，线上无订单 state 仍会回首页。

- 2026-05-18 checkout 实验进入 B/D 版本：
  - A 组旧数量弹窗和 C 组完整 COD 承诺 checkout 不再自然分配流量；保留 `quantity_modal` / `cod_trust` 仅用于历史数据和本地强制预览。
  - 新增 D 组 `cod_trust_landing`：落地页沿用 C 组 COD 承诺表达、权益区和多图自动轮播；进入 checkout 后完全走 B 组稳定流程，不再使用 C 组信息页额外 helper 和订单摘要支付文案。
  - 新随机 key 改为 `cod_checkout_quantity_flow_variant_v3`，避免老设备 localStorage 继续停留在 A/C；自然分流为 B 65% / D 35%。
  - 订单完成页视觉升级是全量页面，不按 A/B/C/D 分组区分，因为它发生在下单成功之后，不参与下单前转化率对比。
  - 管理端 A/B/C/D 对比表新增两列广告校正指标：`校正落地页率` 和 `校正成功率`。口径为只看有足够样本分组共同出现的广告，在广告内部先算转化率，再按共同广告流量加权，减少广告质量差异对 B/D 判断的影响。

- 2026-05-19 地址优先 E 组本地预览：
  - 新增分组 `address_first` / `e`。初始阶段仅强制预览，确认后进入自然分流：B 组当前稳定版 80%，E 组地址优先版 20%。
  - 新随机 key 改为 `cod_checkout_quantity_flow_variant_v4`，避免老设备 localStorage 继续停留在 B/D 旧分流。
  - 逻辑：大区选择后不进入地图页，自动使用所选大区中心坐标并直接进入个人信息页；信息页强化“Adresse détaillée et repère”，要求用户填写“地址范围 + 参照物”。
  - 信息页的地图入口必须弱化为地址输入框下方的可选项，不能做成顶部大卡片；主路径是填写详细地址和参照物，地图标点只是“想标也可以”的补充入口。
  - 可选地图入口只展示一个轻量胶囊按钮；如果用户此前已经手动标过点或用当前定位拿到真实坐标，再从信息页回到地图页时必须保留该坐标，不能重置成大区中心。只有默认大区中心占位点才允许在进入地图页时清空。
  - 埋点区分为 `location_method = district_center_auto_skip`，不要和现有兜底按钮 `district_center_fallback` 混在一起。

- 2026-05-20 E 组入口提升：
  - 自然分流调整为 B 组当前稳定版 65%，E 组地址优先版 35%，继续保留 A/C/D 仅用于历史识别和强制预览。
  - 新随机 key 改为 `cod_checkout_quantity_flow_variant_v5`，避免老设备继续停留在 80/20 的旧分流。
  - 管理端新增“E组提升到35%”版本窗口，并在落地页转化模块和 A/B/C/D/E 表中展示落地页平均停留、下单前停留、未下单停留和平均滚动比例。

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

### 2026-05-21 零星订单接口异常

现象：后台“接口异常”在 2026-05-20/21 仍有少量未恢复 session。按 checkout session 去重后，异常主要不是 checkout A/B 流程问题，而是后端订单创建的边界问题。

根因拆分：

- 部分 `ERR_NETWORK` / `ECONNABORTED` 是客户端超时或网络中断；订单库里已经能看到实际订单，属于前端没收到成功响应或未补发成功埋点。
- 组合包订单有 `order_no` 重复风险：`BD-` 前缀订单号生成曾按用户所有订单取最后序号，遇到同一用户既有 `FL-` 又有 `BD-` 订单时可能生成已存在的 `BD-xxxxx-00002`。
- 普通商品订单有超长姓名风险：`flash_order.receiver_name` 是 50 字符，用户把姓名重复填写时后端直接 500。
- 少量 404 来自商品下架或测试品 inactive，不能按失败订单恢复。

修复：

- `app_backend` 订单号生成改成按订单前缀取同用户最大序号；插入订单时如果遇到 `flash_order.PRIMARY` 或 `idx_order_no` 重复，最多重试 3 次。
- `app_backend` 写入 `receiver_name` 前压缩空白并截断到 50 字符，避免超长姓名导致 500。
- `cod-ecommerce` 个人信息页姓名输入框增加 `maxLength=50`，前端先减少超长输入概率；后端仍保留兜底。

### 2026-05-15 checkout A/B 字段误传导致下单 500

现象：下单减摩擦 A/B 上线后，后台看板显示 `submit_order_click` 有数据，但 `order_create_success` 为 0，`order_create_failed` 与最终点下单数接近一致。实测网页最终下单接口返回 500。

根因：

- 前端把 checkout 流程实验值 `checkout_quantity_variant=inline_quantity/quantity_modal` 传给订单接口的 `ab_group` 字段。
- 订单表里的 `ab_group` 是老预付款 A/B 字段，不适合存这类字符串流程标签。
- 后端插入订单时收到 `ab_group: "inline_quantity"` 会触发入库失败，导致订单创建接口返回 500。

修复：

- `cod-ecommerce` 不再向订单创建接口传 `ab_group`；checkout A/B 分组只保留在第一方埋点里。
- `app_backend` 增加兜底：如果旧页面缓存继续传非数字 `ab_group`，后端忽略该值，不阻塞下单。
- 线上验证：带旧 `ab_group: "inline_quantity"` 的最小订单 payload 已从 500 恢复为 201。
- 验证过程中创建的 `Codex Test` 测试订单已同步取消：`flash_order.order_status=5`，`admin_orders.status=10`。

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
