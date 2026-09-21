
## 项目说明 / About This Project

### 文件结构 / Layout

```
index.html                  入口，重定向到 classic-standard.html
classic-standard.html       首页（Classic 主题）
novel-reader.html           小说阅读器（主应用）
api-config.html             API 密钥配置
apikey-login.html           API 密钥配置（旧入口，功能相同，保留兼容旧链接）
about.html                  项目与许可说明
classic-ultra.html          ┐
lower-decks.html            │ Classic / Lower Decks / Lower Decks PADD /
lower-decks-padd.html       │ Nemesis Blue 主题的官方模板示例页，
nemesis-blue-standard.html  │ 未做定制，仅随模板更新
nemesis-blue-ultra.html     ┘
assets/
  classic.css               ┐
  lower-decks.css           │ 四个主题样式表
  lower-decks-padd.css      │
  nemesis-blue.css          ┘
  lcars-ui.js               本站新增：共享界面逻辑（时钟/设备/网络等读数、
                            提示音与跳转、滚动到顶、署名页脚、文本转义）
  lcars.js                  模板基础行为（提示音包装、手风琴）
  lcars-responsive.js       小屏适配（数据瀑布行数、按钮换行）
  novel-api.js              FimTale API 客户端
  Antonio-*.woff            LCARS 使用的 Antonio 字体
  beep1-4.mp3               LCARS 按键音
legacy/                     早期测试页（test / simple / full-test / test-api），
                            已从站点根目录移出，不再参与导航
```

### 架构说明 / Architecture note

时钟、设备、网络、电量、内存、运行时长等界面读数原先在 `about.html`、
`api-config.html`、`classic-standard.html`、`novel-reader.html` 四个页面里各复制了一份，
共约 140 行 ×4，且各副本已经出现差异和缺陷。现在统一由 `assets/lcars-ui.js` 提供；
每个页面通过在数据瀑布容器上声明 `data-lcars-readout="<前缀>"` 指定自己使用哪一组元素
（例如阅读器用 `dc-time`，关于页用 `about-time`）。新增页面时只需加载该脚本并声明前缀。

### 1. 项目目的
本网站是基于 **LCARS Inspired Website Template** 构建的一个非商业演示项目。  
主要目标是：
- 展示 LCARS 风格的视觉界面；
- 通过调用 [FiMTale（https://fimtale.com）](https://fimtale.com) 提供的公开 API，实现动态数据展示或交互效果；
- 作为个人技术学习与兴趣实践，不涉及任何营利行为。

### 2. 模板来源与署名
本网站使用的视觉模板来自：
> **LCARS Inspired Website Template** – Jim Robertus  
> 官方网站：[https://www.thelcars.com](https://www.thelcars.com)

根据原作者发布的最终用户许可协议（EULA），本人已：
- 在网站页脚（或显著位置）提供指向 `https://www.thelcars.com` 的可点击链接；
- 注明本网站对原始模板进行了修改（包括样式适配、页面结构调整及 API 集成）；
- 严格遵守“仅限非商业个人使用”的规定。

**署名示例（已置于本网站底部）：**  
> LCARS Inspired Website Template by [www.TheLCARS.com](https://www.thelcars.com), with modifications.

### 3. 外部 API 使用说明
本网站会调用 [FiMTale](https://fimtale.com) 提供的公开 API。  
调用目的仅为获取特定数据（例如作品信息、用户公开内容等），用于在 LCARS 风格界面中展示。  
- 所有 API 调用均遵循 FiMTale 的使用条款；
- 本网站不存储、转发或商用 API 返回的任何数据；
- 若 FiMTale 官方调整 API 策略或要求停止调用，本人将立即配合修改。

### 4. 非商业声明
本网站 **不包含任何形式的商业内容**，包括但不限于：
- 广告（Google AdSense、联盟广告等）；
- 商品或服务销售；
- 付费会员/订阅；
- 捐赠或打赏按钮；
- 为本人或第三方的商业业务引流。

本网站完全为个人兴趣、技术学习与 LCARS 风格爱好者交流而创建。

### 5. 版权与许可声明
- **LCARS 视觉风格** 属于《星际迷航》CBS Studios Inc. 的商标/设计，原作者 Jim Robertus 已声明其网站与 CBS 无关联。本网站仅作非商业爱好者展示，不主张任何相关权利。
- **原始模板代码** 版权归 Jim Robertus 所有，使用行为遵守其 EULA。
- **本网站中由本人编写的修改代码**（包括 API 集成、页面布局调整等）遵循与原模板相同的许可条款（即 EULA 规定的衍生作品同样受本协议约束）。
- **FiMTale 网站及其 API** 的相关权利归其运营方所有。

### 6. 联系方式
若对本网站的使用有任何疑问（例如是否违反模板许可或 API 使用规范），请通过以下方式联系本人：  
[suran_chanxi@outlook.com]

---

**最后更新：** 2026 年 4 月  

> ⚠️ 本网站仅为个人非商业项目。若原作者 Jim Robertus 或 FiMTale 运营方认为本网站有任何不妥，本人将根据要求立即调整或关闭网站。

---

