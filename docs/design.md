# AI 宠物拼豆图纸生成 - Design System

## 1. Design Direction

## 视觉风格

**Playful Geometric（趣味几何风格）**

产品整体视觉希望传递：

* Friendly（友好）
* Creative（创造力）
* Handmade（手作感）
* Playful（趣味）
* Modern（现代）
* Approachable（易使用）

视觉参考：

* DIY 手工创作工具
* Pixel Art 像素艺术
* Sticker 贴纸设计
* 儿童创意工具
* 现代 AI 创作产品

---

## 核心设计理念

### Stable Grid, Playful Decoration

**稳定的功能网格 + 活泼的装饰元素**

功能区域：

* 保持清晰
* 保持结构化
* 优先保证可用性

装饰区域：

* 使用几何图形
* 使用彩色元素
* 增加趣味性

避免：

* 装饰干扰主要操作
* 过度视觉复杂
* 降低工具效率

---

# 2. Product Design Principles

## 2.1 Creation First（创作优先）

产品核心任务：

> 将用户宠物照片转换为可制作的拼豆图纸。

因此视觉优先级：

1. 图纸 Preview
2. 宠物生成结果
3. 拼豆颜色信息
4. 编辑工具
5. 装饰元素

任何 UI 设计不能影响用户查看和制作图纸。

---

## 2.2 Friendly AI Assistant（友好的 AI 助手）

产品不是专业设计软件，而是：

> 一个帮助用户完成创作的 AI 工具。

避免：

* 复杂专业软件感
* 过多参数设置
* 冷冰冰的工业化界面

强调：

* 引导
* 反馈
* 创作乐趣

---

## 2.3 Bead Color Accuracy（拼豆颜色准确性）

拼豆颜色属于真实生产数据。

规则：

* UI 主题颜色不能替代拼豆颜色；
* 装饰颜色不能干扰颜色识别；
* 图纸 Preview 必须保证颜色准确。

---

# 3. Design Tokens

## 3.1 Color Tokens

### Background

```css
background: #FFFDF5;
```

暖白色背景。

用途：

* 页面背景
* 空状态
* 首页区域

---

### Foreground

```css
foreground: #1E293B;
```

深灰色。

用途：

* 主文字
* 边框
* Icon

---

## Brand Colors

### Primary

```css
primary: #8B5CF6;
```

Vivid Violet。

用途：

* AI生成按钮
* 核心操作
* 选中状态

---

### Secondary

```css
secondary: #F472B6;
```

Hot Pink。

用途：

* 装饰
* Highlight
* 创意元素

---

### Accent Colors

```css
yellow: #FBBF24;

mint: #34D399;
```

用途：

* 状态提示
* 装饰元素
* 功能强调

---

## Neutral Colors

```css
card: #FFFFFF;

muted: #F1F5F9;

border: #E2E8F0;

input: #FFFFFF;
```

---

# 4. Typography

## Heading Font

```text
Outfit
```

Fallback：

```text
system-ui, sans-serif
```

用途：

* 页面标题
* 模块标题
* 重要信息

字体权重：

* Bold 700
* ExtraBold 800

---

## Body Font

```text
Plus Jakarta Sans
```

Fallback：

```text
system-ui, sans-serif
```

用途：

* 普通文本
* 描述信息
* 表单内容

字体权重：

* Regular 400
* Medium 500

---

# 5. Shape System

## Border Radius

```css
radius-sm: 8px;

radius-md: 16px;

radius-lg: 24px;

radius-full: 9999px;
```

---

## Border Style

默认：

```css
border:
2px solid #1E293B;
```

设计特点：

* 明显轮廓
* 贴纸感
* 手工感

避免：

* 过细边框
* 模糊边界

---

# 6. Shadow System

## Hard Shadow（硬阴影）

主要组件：

```css
box-shadow:
4px 4px 0px #1E293B;
```

Hover：

```css
box-shadow:
6px 6px 0px #1E293B;
```

Active：

```css
box-shadow:
2px 2px 0px #1E293B;
```

规则：

使用硬阴影体现：

* Sticker 贴纸感
* 手工制作感
* 点击反馈

避免：

* Blur Shadow
* Glassmorphism

---

# 7. Component Guidelines

# Button

## Primary Button

用途：

* Generate Pattern
* Start Creation
* Export

样式：

```text
Background:
primary

Text:
white

Border:
2px solid foreground

Radius:
rounded-full

Shadow:
hard shadow
```

交互：

Hover：

* 向上移动
* 阴影增加

Active：

* 向下移动
* 阴影减少

---

## Secondary Button

用途：

* Cancel
* Back
* Secondary Action

样式：

```text
Background:
transparent

Border:
2px solid foreground

Radius:
rounded-full
```

---

# Card

## Sticker Card

样式：

```text
Background:
white

Border:
2px solid foreground

Radius:
16px-24px

Shadow:
8px 8px 0px
```

用途：

* 图片上传区域
* 参数设置
* 结果展示
* 功能介绍

Hover：

轻微：

```css
rotate(-1deg);

scale(1.02);
```

---

# Input

样式：

```text
Background:
white

Border:
2px solid #CBD5E1

Radius:
16px
```

Focus：

```text
Border:
primary

Shadow:
4px 4px 0 primary
```

---

# 8. Page Layout Guidelines

## General Layout

Container:

```css
max-width: 1200px;
```

页面间距：

推荐：

```text
64px - 96px
```

保持：

* 留白
* 呼吸感
* 清晰层级

---

# 9. Product Specific UI

## 9.1 Landing Page

Playful 强度：

100%

允许：

* 大型几何装饰
* 宠物插画
* 彩色元素
* Sticker 元素

Hero Layout:

```text
左侧：
产品介绍

右侧：
宠物图片 / 拼豆作品展示
```

---

## 9.2 Creation Workflow

Playful 强度：

50%

核心流程：

```text
上传宠物图片

↓

AI生成

↓

查看图纸

↓

导出制作
```

要求：

* 操作流程明确
* 主按钮突出
* 减少视觉干扰

---

## 9.3 Pattern Editor

Playful 强度：

30%

优先级：

1. Bead Grid
2. Color Palette
3. Editing Tools
4. Export

规则：

编辑区域禁止：

* 大面积装饰图案
* 浮动元素
* 强动画

原因：

保证拼豆图纸准确性。

---

# 10. Icon System

使用：

```text
Lucide React
```

风格：

* Round line cap
* Round line join
* Stroke Width: 2.5px

规则：

Icon 推荐放置于：

* 圆形背景
* 彩色容器
* Button 内部

避免：

单独悬浮 Icon。

---

# 11. Motion System

整体感觉：

Bouncy + Friendly

## Hover

Duration:

```text
200-300ms
```

效果：

* 位移
* 缩放
* 阴影变化

---

## Entrance Animation

推荐：

* Pop
* Scale

避免：

只有简单 Fade。

---

## Accessibility

支持：

```css
prefers-reduced-motion
```

减少：

* Bounce
* Wiggle
* Continuous Animation

---

# 12. Responsive Rules

## Desktop

主要体验：

* 大面积 Preview
* 控制面板
* 双栏布局

---

## Mobile

规则：

* 垂直排列
* 减少装饰
* 保留核心功能

触控区域：

```text
minimum 48px
```

---

# 13. Development Rules

开发 UI 时必须：

1. 遵循当前 Design System。
2. 优先复用已有 Component。
3. 使用 Design Token，不直接硬编码颜色。
4. 不随意新增颜色、阴影、圆角规则。
5. 编辑器页面优先保证功能清晰。
6. 不改变真实拼豆颜色数据。
7. 新增视觉规范前，需要先更新 Design System。

---

# Final Vision

产品整体感觉：

> 一个帮助用户将宠物照片转化为手工拼豆作品的 AI 创作助手。

视觉关键词：

* Pixel Art
* Handmade
* Playful
* Creative
* Friendly AI
* Geometric
* Sticker Style
