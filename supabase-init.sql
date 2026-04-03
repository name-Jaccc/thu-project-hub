-- ═══════════════════════════════════════════
-- THU Project Hub — Supabase 数据库初始化脚本
-- ═══════════════════════════════════════════
--
-- 使用方法：
-- 1. 登录 Supabase Dashboard (https://supabase.com/dashboard)
-- 2. 选择你的项目
-- 3. 点击左侧 "SQL Editor"
-- 4. 新建查询，粘贴此脚本，点击 "Run"
--
-- 注意：当前采用单行 JSON 存储方案（简单高效）
-- 未来如需多人协作或复杂查询，可拆分为多张表

-- 创建 app_state 表，存储整个应用状态为单条 JSON 记录
CREATE TABLE IF NOT EXISTS app_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 启用 RLS（行级安全策略）
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;

-- 允许匿名读取（anon key）
CREATE POLICY "Allow anonymous read" ON app_state
  FOR SELECT USING (true);

-- 允许匿名插入（首次初始化时需要）
CREATE POLICY "Allow anonymous insert" ON app_state
  FOR INSERT WITH CHECK (true);

-- 允许匿名更新（日常保存数据）
CREATE POLICY "Allow anonymous update" ON app_state
  FOR UPDATE USING (true);

-- 创建更新时间自动触发器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_state_updated_at ON app_state;
CREATE TRIGGER app_state_updated_at
  BEFORE UPDATE ON app_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
