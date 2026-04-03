# THU Project Hub — 清华大学项目管理面板

面向清华大学学生的个人项目管理 Web 应用，统一管理科研、课程、课外三条主线的项目和任务。

## 技术栈

- React 19 + TypeScript
- Vite 8
- Tailwind CSS 4
- lucide-react
- date-fns
- Supabase（可选云端同步）

## 三条主线

| 主线 | 说明 | 颜色 |
|---|---|---|
| 科研 | 科研项目与学术研究管理 | 靛蓝 |
| 课程 | 课程学习与作业项目管理 | 蓝色 |
| 课外 | 社团、竞赛、活动等课外项目 | 琥珀 |

## 院系

- 清华大学计算机系
- 清华大学电子工程系
- 清华大学机械工程系

## 功能

- 总览页（统计卡片 + 主线卡片 + 紧急任务）
- 全部项目视图（按主线分组）
- 全部任务视图（列表/看板，支持本周待完成/高优先级/即将到期筛选）
- 项目详情页（项目信息 + 任务列表/看板）
- 完整 CRUD（新建、编辑、删除项目和任务）
- 搜索 + 多维筛选
- 一键完成/状态切换
- 可选 Supabase 云端同步

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## Supabase 配置（可选）

1. 在 [supabase.com](https://supabase.com) 注册并创建项目
2. 在 SQL Editor 中运行 `supabase-init.sql`
3. 创建 `.env.local` 文件：
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```
4. 重启开发服务器
