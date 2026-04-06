import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, LayoutDashboard, FolderKanban, CheckSquare, Calendar,
  Plus, X, ChevronRight, Edit3, Trash2, Clock,
  AlertTriangle, Filter, ChevronLeft, ExternalLink,
  GraduationCap, MoreHorizontal, Menu,
  ArrowUpRight, Inbox, List, Columns3,
  Save, RotateCcw, Cloud, CloudOff, Loader2, Settings,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { format, isAfter, isBefore, addDays, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import type {
  AppState, Lane, Project, Task, Tag,
  Priority, Status, ViewMode,
} from './types';
import {
  STATUS_LABELS, PRIORITY_LABELS, STATUS_COLORS, PRIORITY_COLORS, PRIORITY_DOT_COLORS,
} from './types';
import { initialData } from './data/initialData';
import { isSupabaseConfigured, loadFromSupabase, saveToSupabase, testConnection } from './lib/supabase';

// ── localStorage ──
const STORAGE_KEY = 'project-dashboard-thu-data';

function loadLocalState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return JSON.parse(JSON.stringify(initialData));
}

function saveLocalState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ── Icon mapping ──
function LaneIcon({ name, className }: { name: string; className?: string }) {
  const cls = className || 'w-4 h-4';
  switch (name) {
    case 'GraduationCap': return <GraduationCap className={cls} />;
    default: return <FolderKanban className={cls} />;
  }
}

// ═══════════════════════════════════════
//              MAIN APP
// ═══════════════════════════════════════
export default function App() {
  // ── Cloud sync state ──
  type SyncMode = 'local' | 'cloud';
  const [syncMode, setSyncMode] = useState<SyncMode>(() =>
    isSupabaseConfigured() ? 'cloud' : 'local'
  );
  const [cloudStatus, setCloudStatus] = useState<'disconnected' | 'loading' | 'connected' | 'error' | 'saving'>('disconnected');
  const [showSettings, setShowSettings] = useState(false);
  const initialLoadDone = useRef(false);

  const [state, setState] = useState<AppState>(loadLocalState);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<'overview' | 'all_projects' | 'all_tasks' | 'project_detail'>('overview');
  const [taskFilterMode, setTaskFilterMode] = useState<'all' | 'this_week' | 'high_priority' | 'urgent'>('all');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeLane, setActiveLane] = useState<string | null>(null); // null = all
  const [filterStatus, setFilterStatus] = useState<Status | ''>('');
  const [filterPriority, setFilterPriority] = useState<Priority | ''>('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [detailItem, setDetailItem] = useState<{ type: 'project' | 'task'; id: string } | null>(null);
  const [editingItem, setEditingItem] = useState<{ type: 'project' | 'task'; id: string } | null>(null);
  const [showNewModal, setShowNewModal] = useState<'project' | 'task' | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filterTag, setFilterTag] = useState('');

  // ── Save logic: always save locally, optionally sync to cloud ──
  useEffect(() => {
    if (!initialLoadDone.current) return; // Don't save during initial load
    saveLocalState(state);
    if (syncMode === 'cloud') {
      setCloudStatus('saving');
      saveToSupabase(state).then(ok => {
        setCloudStatus(ok ? 'connected' : 'error');
      });
    }
  }, [state, syncMode]);

  // ── Initial load from cloud if configured ──
  useEffect(() => {
    if (syncMode !== 'cloud' || initialLoadDone.current) return;
    initialLoadDone.current = true;
    setCloudStatus('loading');
    testConnection().then(ok => {
      if (!ok) {
        setCloudStatus('error');
        setSyncMode('local');
        return;
      }
      loadFromSupabase().then(cloudData => {
        if (cloudData) {
          setState(cloudData);
          saveLocalState(cloudData); // Also cache locally
        }
        setCloudStatus('connected');
      });
    });
  }, [syncMode]);

  // ── Switch sync mode ──
  const handleSyncModeChange = useCallback((mode: 'local' | 'cloud') => {
    if (mode === 'cloud' && isSupabaseConfigured()) {
      setCloudStatus('loading');
      testConnection().then(ok => {
        if (ok) {
          setSyncMode('cloud');
          // Upload local state to cloud
          saveToSupabase(state).then(success => {
            setCloudStatus(success ? 'connected' : 'error');
            if (!success) setSyncMode('local');
          });
        } else {
          setCloudStatus('error');
          alert('无法连接到 Supabase，请检查配置。');
        }
      });
    } else if (mode === 'local') {
      setSyncMode('local');
      setCloudStatus('disconnected');
    }
  }, [state]);

  const today = new Date();
  const endOfWeek = addDays(today, 7 - today.getDay());

  // ── Derived data ──
  const stats = useMemo(() => {
    const totalProjects = state.projects.length;
    const totalTasks = state.tasks.length;
    const thisWeekTasks = state.tasks.filter(t =>
      t.deadline && !isAfter(parseISO(t.deadline), endOfWeek) && isAfter(parseISO(t.deadline), today) && t.status !== 'completed'
    ).length;
    const highPriorityTasks = state.tasks.filter(t => t.priority === 'high' && t.status !== 'completed').length;
    const urgentTasks = state.tasks.filter(t =>
      t.deadline && !isAfter(parseISO(t.deadline), addDays(today, 3)) && t.status !== 'completed'
    ).length;
    return { totalProjects, totalTasks, thisWeekTasks, highPriorityTasks, urgentTasks };
  }, [state]);

  const preFilteredTasks = useMemo(() => {
    switch (taskFilterMode) {
      case 'this_week':
        return state.tasks.filter(t =>
          t.deadline && !isAfter(parseISO(t.deadline), endOfWeek) && isAfter(parseISO(t.deadline), today) && t.status !== 'completed'
        );
      case 'high_priority':
        return state.tasks.filter(t => t.priority === 'high' && t.status !== 'completed');
      case 'urgent':
        return state.tasks.filter(t =>
          t.deadline && !isAfter(parseISO(t.deadline), addDays(today, 3)) && t.status !== 'completed'
        );
      default:
        return state.tasks;
    }
  }, [state.tasks, taskFilterMode, today, endOfWeek]);

  const filteredProjects = useMemo(() => {
    return state.projects.filter(p => {
      if (activeLane && p.laneId !== activeLane) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterPriority && p.priority !== filterPriority) return false;
      if (filterTag && !p.tags.includes(filterTag)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [state.projects, activeLane, filterStatus, filterPriority, filterTag, searchQuery]);

  const filteredTasks = useMemo(() => {
    return state.tasks.filter(t => {
      if (activeLane && t.laneId !== activeLane) return false;
      if (filterStatus && t.status !== filterStatus) return false;
      if (filterPriority && t.priority !== filterPriority) return false;
      if (filterTag && !t.tags.includes(filterTag)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [state.tasks, activeLane, filterStatus, filterPriority, filterTag, searchQuery]);

  const kanbanGroups = useMemo(() => {
    const groups: Record<Status, Task[]> = {
      not_started: [], in_progress: [], blocked: [], completed: [],
    };
    filteredTasks.forEach(t => groups[t.status].push(t));
    return groups;
  }, [filteredTasks]);

  // ── Helpers ──
  const getLane = (id: string) => state.lanes.find(l => l.id === id);
  const getTag = (id: string) => state.tags.find(t => t.id === id);
  const getProject = (id: string) => state.projects.find(p => p.id === id);

  // ── CRUD operations ──
  const addProject = useCallback((project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString().split('T')[0];
    setState(prev => ({
      ...prev,
      projects: [...prev.projects, { ...project, id: uuidv4(), createdAt: now, updatedAt: now }],
    }));
    setShowNewModal(null);
  }, []);

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    setState(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString().split('T')[0] } : p),
    }));
    setEditingItem(null);
  }, []);

  const deleteProject = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      projects: prev.projects.filter(p => p.id !== id),
      tasks: prev.tasks.filter(t => t.projectId !== id),
    }));
    if (detailItem?.type === 'project' && detailItem.id === id) setDetailItem(null);
    if (editingItem?.type === 'project' && editingItem.id === id) setEditingItem(null);
  }, [detailItem, editingItem]);

  const addTask = useCallback((task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString().split('T')[0];
    setState(prev => ({
      ...prev,
      tasks: [...prev.tasks, { ...task, id: uuidv4(), createdAt: now, updatedAt: now }],
    }));
    setShowNewModal(null);
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<Task>) => {
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString().split('T')[0] } : t),
    }));
    setEditingItem(null);
  }, []);

  const deleteTask = useCallback((id: string) => {
    setState(prev => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== id) }));
    if (detailItem?.type === 'task' && detailItem.id === id) setDetailItem(null);
    if (editingItem?.type === 'task' && editingItem.id === id) setEditingItem(null);
  }, [detailItem, editingItem]);

  const quickUpdateTaskStatus = useCallback((id: string, status: Status) => {
    updateTask(id, { status });
  }, [updateTask]);

  const resetData = useCallback(() => {
    const confirmed = window.confirm('确定要重置所有数据为初始状态吗？这将清除所有修改。');
    if (!confirmed) return;
    const freshData = JSON.parse(JSON.stringify(initialData));
    setState(freshData);
    saveLocalState(freshData);
    // 重置所有 UI 状态
    setActiveView('overview');
    setSelectedProjectId(null);
    setActiveLane(null);
    setSearchQuery('');
    setFilterStatus('');
    setFilterPriority('');
    setFilterTag('');
    setTaskFilterMode('all');
    setDetailItem(null);
    setEditingItem(null);
    setShowNewModal(null);
    setViewMode('list');
    setShowFilters(false);
    if (syncMode === 'cloud') {
      saveToSupabase(freshData);
    }
  }, [syncMode]);

  const clearAllData = useCallback(() => {
    const confirmed = window.confirm('⚠️ 确定要删除所有数据吗？所有项目和任务将被永久清除，此操作不可恢复！');
    if (!confirmed) return;
    const emptyData: AppState = {
      lanes: JSON.parse(JSON.stringify(initialData.lanes)),
      tags: JSON.parse(JSON.stringify(initialData.tags)),
      projects: [],
      tasks: [],
    };
    setState(emptyData);
    saveLocalState(emptyData);
    // 重置所有 UI 状态
    setActiveView('overview');
    setSelectedProjectId(null);
    setActiveLane(null);
    setSearchQuery('');
    setFilterStatus('');
    setFilterPriority('');
    setFilterTag('');
    setTaskFilterMode('all');
    setDetailItem(null);
    setEditingItem(null);
    setShowNewModal(null);
    setViewMode('list');
    setShowFilters(false);
    if (syncMode === 'cloud') {
      saveToSupabase(emptyData);
    }
  }, [syncMode]);

  // ── Clear filters ──
  const clearFilters = () => {
    setActiveLane(null);
    setFilterStatus('');
    setFilterPriority('');
    setFilterTag('');
    setTaskFilterMode('all');
    setSearchQuery('');
  };

  const hasActiveFilters = activeLane || filterStatus || filterPriority || filterTag || searchQuery;

  // ═══════════════════════════════════════
  //              RENDER
  // ═══════════════════════════════════════
  return (
    <div className="h-screen flex bg-[#f8f9fb] text-slate-800 overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-white border-r border-slate-200 flex flex-col transition-all duration-200 flex-shrink-0`}>
        {/* Logo area */}
        <div className="h-14 flex items-center px-4 border-b border-slate-100">
          {sidebarOpen && <h1 className="text-lg font-bold text-slate-900 tracking-tight">Shijie Project</h1>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
          <SidebarItem
            icon={<LayoutDashboard className="w-4 h-4" />}
            label="总览"
            active={activeView === 'overview' && !activeLane}
            sidebarOpen={sidebarOpen}
            onClick={() => { setActiveView('overview'); setActiveLane(null); setSelectedProjectId(null); }}
          />
          <SidebarItem
            icon={<FolderKanban className="w-4 h-4" />}
            label="全部项目"
            active={activeView === 'all_projects'}
            sidebarOpen={sidebarOpen}
            count={state.projects.length}
            onClick={() => { setActiveView('all_projects'); setActiveLane(null); setSelectedProjectId(null); }}
          />
          <SidebarItem
            icon={<CheckSquare className="w-4 h-4" />}
            label="全部任务"
            active={activeView === 'all_tasks'}
            sidebarOpen={sidebarOpen}
            count={state.tasks.filter(t => t.status !== 'completed').length}
            onClick={() => { setActiveView('all_tasks'); setTaskFilterMode('all'); setActiveLane(null); setSelectedProjectId(null); }}
          />

          <div className="pt-4 pb-2 px-2">
            {sidebarOpen && <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">主线</span>}
          </div>

          {state.lanes.map(lane => (
            <div key={lane.id}>
              <SidebarItem
                icon={<LaneIcon name={lane.icon} />}
                label={lane.name}
                active={activeLane === lane.id && activeView !== 'all_projects' && activeView !== 'all_tasks'}
                sidebarOpen={sidebarOpen}
                color={lane.color}
                count={state.projects.filter(p => p.laneId === lane.id).length}
                onClick={() => { setActiveView('overview'); setActiveLane(lane.id); setSelectedProjectId(null); }}
              />
            </div>
          ))}

          <div className="pt-4 pb-2 px-2">
            {sidebarOpen && <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">操作</span>}
          </div>
          <SidebarItem
            icon={<Plus className="w-4 h-4" />}
            label="新建项目"
            sidebarOpen={sidebarOpen}
            onClick={() => setShowNewModal('project')}
          />
          <SidebarItem
            icon={<Plus className="w-4 h-4" />}
            label="新建任务"
            sidebarOpen={sidebarOpen}
            onClick={() => setShowNewModal('task')}
          />
          <SidebarItem
            icon={<RotateCcw className="w-4 h-4" />}
            label="重置数据"
            sidebarOpen={sidebarOpen}
            onClick={resetData}
          />
          <SidebarItem
            icon={<Trash2 className="w-4 h-4" />}
            label="删除所有数据"
            sidebarOpen={sidebarOpen}
            onClick={clearAllData}
          />
        </nav>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-6 gap-4 flex-shrink-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-slate-400">Dashboard</span>
            {activeView === 'all_projects' && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                <span className="font-medium text-slate-700">全部项目</span>
              </>
            )}
            {activeView === 'all_tasks' && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                <span className="font-medium text-slate-700">
                  {taskFilterMode === 'this_week' ? '本周待完成' : taskFilterMode === 'high_priority' ? '高优先级' : taskFilterMode === 'urgent' ? '即将到期' : '全部任务'}
                </span>
              </>
            )}
            {activeView === 'project_detail' && selectedProjectId && (() => {
              const p = state.projects.find(pr => pr.id === selectedProjectId);
              return p ? (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <span className="font-medium text-slate-700 truncate max-w-[200px]">{p.name}</span>
                </>
              ) : null;
            })()}
            {activeView === 'overview' && activeLane && getLane(activeLane) && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                <span style={{ color: getLane(activeLane)!.color }} className="font-medium">
                  {getLane(activeLane)!.name}
                </span>
              </>
            )}

          </div>

          {/* Search */}
          <div className="flex-1 max-w-md mx-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索项目或任务..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all"
              />
            </div>
          </div>

          {/* Filter toggle + View mode */}
          <div className="flex items-center gap-2">
            {/* Cloud sync status */}
            <div className="flex items-center gap-1 mr-1">
              {syncMode === 'cloud' ? (
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                  cloudStatus === 'connected' || cloudStatus === 'saving'
                    ? 'bg-emerald-50 text-emerald-700'
                    : cloudStatus === 'loading'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-red-50 text-red-700'
                }`}>
                  {cloudStatus === 'loading' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : cloudStatus === 'saving' ? (
                    <Cloud className="w-3 h-3" />
                  ) : cloudStatus === 'connected' ? (
                    <Cloud className="w-3 h-3" />
                  ) : (
                    <CloudOff className="w-3 h-3" />
                  )}
                  <span>{cloudStatus === 'connected' ? '已同步' : cloudStatus === 'saving' ? '同步中...' : cloudStatus === 'loading' ? '加载中...' : '连接失败'}</span>
                </div>
              ) : (
                <button onClick={() => setShowSettings(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                  <CloudOff className="w-3 h-3" />
                  <span>本地模式</span>
                </button>
              )}
              <button onClick={() => setShowSettings(true)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg border transition-colors ${showFilters ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
            >
              <Filter className="w-4 h-4" />
            </button>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                清除筛选
              </button>
            )}
            <div className="flex border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`p-2 transition-colors ${viewMode === 'kanban' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                <Columns3 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Filter bar */}
        {showFilters && (
          <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
            <span className="text-xs font-medium text-slate-400">筛选:</span>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as Status | '')}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
              <option value="">全部状态</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as Priority | '')}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
              <option value="">全部优先级</option>
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={filterTag} onChange={e => setFilterTag(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
              <option value="">全部标签</option>
              {state.tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">

          {/* ═══════════════════════════════════════════════════ */}
          {/*           VIEW: Project Detail Page                 */}
          {/* ═══════════════════════════════════════════════════ */}
          {activeView === 'project_detail' && selectedProjectId && (() => {
            const project = state.projects.find(p => p.id === selectedProjectId);
            if (!project) return null;
            const lane = getLane(project.laneId);
            const projectTags = project.tags.map(tid => getTag(tid)).filter(Boolean) as Tag[];
            const projectTasks = state.tasks.filter(t => t.projectId === project.id);
            const completedCount = projectTasks.filter(t => t.status === 'completed').length;
            const inProgressCount = projectTasks.filter(t => t.status === 'in_progress').length;
            const blockedCount = projectTasks.filter(t => t.status === 'blocked').length;

            return (
              <div className="p-6 max-w-5xl mx-auto">
                {/* Back button */}
                <button
                  onClick={() => { setActiveView('all_projects'); setSelectedProjectId(null); }}
                  className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  返回项目列表
                </button>

                {/* Project header card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {lane && (
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: lane.color + '15', color: lane.color }}>
                          <LaneIcon name={lane.icon} className="w-5 h-5" />
                        </div>
                      )}
                      <div>
                        <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
                        <div className="flex items-center gap-2 mt-1">
                          {lane && <span className="text-xs font-medium" style={{ color: lane.color }}>{lane.name}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingItem({ type: 'project', id: project.id })}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                        <Edit3 className="w-4 h-4" /> 编辑
                      </button>
                      <button onClick={() => setShowNewModal('task')}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 rounded-xl transition-colors">
                        <Plus className="w-4 h-4" /> 添加任务
                      </button>
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed mb-4">{project.description}</p>

                  {/* Meta info */}
                  <div className="flex items-center gap-3 mb-4">
                    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[project.status]}`}>
                      {STATUS_LABELS[project.status]}
                    </span>
                    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${PRIORITY_COLORS[project.priority]}`}>
                      {PRIORITY_LABELS[project.priority]}
                    </span>
                    {project.deadline && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> 截止 {format(parseISO(project.deadline), 'yyyy年M月d日')}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">创建于 {project.createdAt}</span>
                  </div>

                  {/* Tags */}
                  {projectTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {projectTags.map(tag => (
                        <span key={tag.id} className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: tag.color + '15', color: tag.color }}>
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Progress bar */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-slate-100 rounded-full h-2.5">
                      <div className="h-2.5 rounded-full transition-all" style={{
                        backgroundColor: project.status === 'completed' ? '#10b981' : lane?.color || '#6366f1',
                        width: `${project.progress}%`
                      }} />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">{project.progress}%</span>
                  </div>
                </div>

                {/* Project detail sections */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {/* Task stats */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">任务概览</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                        <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center">
                          <FolderKanban className="w-4 h-4 text-slate-600" />
                        </div>
                        <div>
                          <div className="text-lg font-bold text-slate-900">{projectTasks.length}</div>
                          <div className="text-[11px] text-slate-400">总任务</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl">
                        <div className="w-8 h-8 rounded-lg bg-emerald-200 flex items-center justify-center">
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                          <div className="text-lg font-bold text-emerald-700">{completedCount}</div>
                          <div className="text-[11px] text-emerald-500">已完成</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl">
                        <div className="w-8 h-8 rounded-lg bg-blue-200 flex items-center justify-center">
                          <Clock className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <div className="text-lg font-bold text-blue-700">{inProgressCount}</div>
                          <div className="text-[11px] text-blue-500">进行中</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl">
                        <div className="w-8 h-8 rounded-lg bg-amber-200 flex items-center justify-center">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                        </div>
                        <div>
                          <div className="text-lg font-bold text-amber-700">{blockedCount}</div>
                          <div className="text-[11px] text-amber-500">阻塞</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Extra project info */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">项目详情</h3>
                    <div className="space-y-3">
                      {project.background && (
                        <div>
                          <h4 className="text-xs font-medium text-slate-400 mb-1">背景说明</h4>
                          <p className="text-sm text-slate-600 leading-relaxed">{project.background}</p>
                        </div>
                      )}
                      {project.nextSteps && (
                        <div>
                          <h4 className="text-xs font-medium text-slate-400 mb-1">下一步计划</h4>
                          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{project.nextSteps}</p>
                        </div>
                      )}
                      {project.risks && (
                        <div>
                          <h4 className="text-xs font-medium text-slate-400 mb-1">风险点</h4>
                          <p className="text-sm text-slate-600 leading-relaxed">{project.risks}</p>
                        </div>
                      )}
                      {!project.background && !project.nextSteps && !project.risks && (
                        <p className="text-sm text-slate-400">暂无详细信息，点击"编辑"添加。</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Task list for this project */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-700">
                      所有任务 ({projectTasks.length})
                    </h3>
                    <div className="flex items-center gap-2">
                      <div className="flex border border-slate-200 rounded-lg overflow-hidden">
                        <button
                          onClick={() => setViewMode('list')}
                          className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
                        >
                          <List className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setViewMode('kanban')}
                          className={`p-1.5 transition-colors ${viewMode === 'kanban' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
                        >
                          <Columns3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {projectTasks.length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                      <Inbox className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm mb-3">暂无任务</p>
                      <button onClick={() => setShowNewModal('task')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 rounded-xl transition-colors">
                        <Plus className="w-4 h-4" /> 添加第一个任务
                      </button>
                    </div>
                  ) : viewMode === 'kanban' ? (
                    <div className="p-4 grid grid-cols-4 gap-4">
                      {(['not_started', 'in_progress', 'blocked', 'completed'] as Status[]).map(status => (
                        <KanbanColumn
                          key={status}
                          status={status}
                          tasks={projectTasks.filter(t => t.status === status)}
                          onTaskClick={(id) => setDetailItem({ type: 'task', id })}
                          onStatusChange={quickUpdateTaskStatus}
                          getProject={getProject}
                          getTag={getTag}
                          onEdit={(id) => setEditingItem({ type: 'task', id })}
                        />
                      ))}
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left text-xs font-medium text-slate-400 px-5 py-3 w-8"></th>
                          <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">任务</th>
                          <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">状态</th>
                          <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">优先级</th>
                          <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">截止日期</th>
                          <th className="text-left text-xs font-medium text-slate-400 px-4 py-3 w-16"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectTasks.map(task => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            project={project}
                            lane={lane}
                            tags={task.tags.map(tid => getTag(tid)).filter(Boolean) as Tag[]}
                            onClick={() => setDetailItem({ type: 'task', id: task.id })}
                            onStatusChange={(s) => quickUpdateTaskStatus(task.id, s)}
                            onEdit={() => setEditingItem({ type: 'task', id: task.id })}
                            onDelete={() => deleteTask(task.id)}
                          />
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════════════════ */}
          {/*           VIEW: All Projects                        */}
          {/* ═══════════════════════════════════════════════════ */}
          {activeView === 'all_projects' && !selectedProjectId && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">全部项目</h2>
                  <p className="text-sm text-slate-500 mt-1">共 {state.projects.length} 个项目</p>
                </div>
                <button onClick={() => setShowNewModal('project')} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 transition-colors">
                  <Plus className="w-4 h-4" /> 新建项目
                </button>
              </div>

              {/* Group by lane */}
              {state.lanes.map(lane => {
                const laneProjects = state.projects.filter(p => p.laneId === lane.id);
                if (laneProjects.length === 0) return null;
                return (
                  <div key={lane.id} className="mb-8">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: lane.color + '15', color: lane.color }}>
                        <LaneIcon name={lane.icon} className="w-3.5 h-3.5" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-700">{lane.name}</h3>
                      <span className="text-xs text-slate-400">{laneProjects.length} 个项目</span>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                      {laneProjects.map(project => (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          lane={lane}
                          tags={project.tags.map(tid => getTag(tid)).filter(Boolean) as Tag[]}
                          taskCount={state.tasks.filter(t => t.projectId === project.id).length}
                          completedTaskCount={state.tasks.filter(t => t.projectId === project.id && t.status === 'completed').length}
                          onClick={() => { setActiveView('project_detail'); setSelectedProjectId(project.id); }}
                          onEdit={() => setEditingItem({ type: 'project', id: project.id })}
                          onDelete={() => deleteProject(project.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════ */}
          {/*           VIEW: All Tasks                           */}
          {/* ═══════════════════════════════════════════════════ */}
          {activeView === 'all_tasks' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {taskFilterMode !== 'all' && (
                      <button onClick={() => setTaskFilterMode('all')} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    )}
                    <h2 className="text-2xl font-bold text-slate-900">
                      {taskFilterMode === 'this_week' ? '本周待完成' : taskFilterMode === 'high_priority' ? '高优先级' : taskFilterMode === 'urgent' ? '即将到期' : '全部任务'}
                    </h2>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    {preFilteredTasks.length} 个任务 · {preFilteredTasks.filter(t => t.status !== 'completed').length} 个进行中
                  </p>
                </div>
                <button onClick={() => setShowNewModal('task')} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 transition-colors">
                  <Plus className="w-4 h-4" /> 新建任务
                </button>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                    <CheckSquare className="w-4 h-4 text-slate-500" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-slate-900">{preFilteredTasks.filter(t => t.status === 'not_started').length}</div>
                    <div className="text-[11px] text-slate-400">未开始</div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-blue-700">{preFilteredTasks.filter(t => t.status === 'in_progress').length}</div>
                    <div className="text-[11px] text-blue-400">进行中</div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-amber-700">{preFilteredTasks.filter(t => t.status === 'blocked').length}</div>
                    <div className="text-[11px] text-amber-400">阻塞</div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <CheckSquare className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-emerald-700">{preFilteredTasks.filter(t => t.status === 'completed').length}</div>
                    <div className="text-[11px] text-emerald-400">已完成</div>
                  </div>
                </div>
              </div>

              {/* Task list */}
              {viewMode === 'kanban' ? (
                <div className="grid grid-cols-4 gap-4">
                  {(['not_started', 'in_progress', 'blocked', 'completed'] as Status[]).map(status => (
                    <KanbanColumn
                      key={status}
                      status={status}
                      tasks={preFilteredTasks.filter(t => t.status === status)}
                      onTaskClick={(id) => setDetailItem({ type: 'task', id })}
                      onStatusChange={quickUpdateTaskStatus}
                      getProject={getProject}
                      getTag={getTag}
                      onEdit={(id) => setEditingItem({ type: 'task', id })}
                    />
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left text-xs font-medium text-slate-400 px-4 py-3 w-8"></th>
                        <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">任务</th>
                        <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">项目</th>
                        <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">状态</th>
                        <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">优先级</th>
                        <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">截止日期</th>
                        <th className="text-left text-xs font-medium text-slate-400 px-4 py-3 w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {preFilteredTasks.map(task => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          project={getProject(task.projectId)}
                          lane={getLane(task.laneId)}
                          tags={task.tags.map(tid => getTag(tid)).filter(Boolean) as Tag[]}
                          onClick={() => setDetailItem({ type: 'task', id: task.id })}
                          onStatusChange={(s) => quickUpdateTaskStatus(task.id, s)}
                          onEdit={() => setEditingItem({ type: 'task', id: task.id })}
                          onDelete={() => deleteTask(task.id)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════ */}
          {/*           VIEW: Overview / Lane view (default)      */}
          {/* ═══════════════════════════════════════════════════ */}
          {activeView === 'overview' && !activeLane && (
            <div className="p-6">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900">总览</h2>
                <p className="text-sm text-slate-500 mt-1">{format(today, 'yyyy年M月d日 EEEE', { locale: zhCN })}</p>
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-5 gap-4 mb-8">
                <StatCard icon={<FolderKanban className="w-5 h-5" />} label="总项目数" value={stats.totalProjects} color="indigo"
                  onClick={() => { setActiveView('all_projects'); setActiveLane(null); setSelectedProjectId(null); }} />
                <StatCard icon={<CheckSquare className="w-5 h-5" />} label="总任务数" value={stats.totalTasks} color="blue"
                  onClick={() => { setActiveView('all_tasks'); setTaskFilterMode('all'); setActiveLane(null); setSelectedProjectId(null); }} />
                <StatCard icon={<Calendar className="w-5 h-5" />} label="本周待完成" value={stats.thisWeekTasks} color="emerald"
                  onClick={() => { setActiveView('all_tasks'); setTaskFilterMode('this_week'); setActiveLane(null); setSelectedProjectId(null); }} />
                <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="高优先级" value={stats.highPriorityTasks} color="amber"
                  onClick={() => { setActiveView('all_tasks'); setTaskFilterMode('high_priority'); setActiveLane(null); setSelectedProjectId(null); }} />
                <StatCard icon={<Clock className="w-5 h-5" />} label="即将到期" value={stats.urgentTasks} color="red"
                  onClick={() => { setActiveView('all_tasks'); setTaskFilterMode('urgent'); setActiveLane(null); setSelectedProjectId(null); }} />
              </div>

              {/* Lane cards */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                {state.lanes.map(lane => {
                  const laneProjects = state.projects.filter(p => p.laneId === lane.id);
                  const laneTasks = state.tasks.filter(t => t.laneId === lane.id && t.status !== 'completed');
                  const completedTasks = state.tasks.filter(t => t.laneId === lane.id && t.status === 'completed');
                  return (
                    <button
                      key={lane.id}
                      onClick={() => { setActiveView('overview'); setActiveLane(lane.id); setSelectedProjectId(null); }}
                      className="text-left p-5 bg-white rounded-2xl border border-slate-200 hover:shadow-lg hover:border-slate-300 transition-all group"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: lane.color + '15', color: lane.color }}>
                          <LaneIcon name={lane.icon} className="w-5 h-5" />
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                      </div>
                      <h3 className="font-semibold text-slate-900 text-lg mb-1">{lane.name}</h3>
                      <p className="text-xs text-slate-400 mb-4">{lane.description}</p>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-slate-600"><strong>{laneProjects.length}</strong> 项目</span>
                        <span className="text-slate-600"><strong>{laneTasks.length}</strong> 进行中</span>
                        <span className="text-emerald-600"><strong>{completedTasks.length}</strong> 已完成</span>
                      </div>
                      <div className="mt-3 w-full bg-slate-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full transition-all" style={{
                          backgroundColor: lane.color,
                          width: laneTasks.length + completedTasks.length > 0
                            ? `${(completedTasks.length / (laneTasks.length + completedTasks.length)) * 100}%`
                            : '0%'
                        }} />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Recent urgent tasks */}
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-slate-900 mb-3">⚡ 需要关注</h3>
                <div className="space-y-2">
                  {state.tasks
                    .filter(t => t.status !== 'completed' && t.deadline && !isAfter(parseISO(t.deadline), addDays(today, 3)))
                    .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))
                    .slice(0, 5)
                    .map(task => {
                      const project = getProject(task.projectId);
                      const lane = getLane(task.laneId);
                      const isOverdue = task.deadline && isBefore(parseISO(task.deadline), today);
                      return (
                        <div key={task.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT_COLORS[task.priority]}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-slate-800 truncate">{task.title}</span>
                              {isOverdue && <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">已过期</span>}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                              {project && <span>{project.name}</span>}
                              {lane && <span>·</span>}
                              {lane && <span style={{ color: lane.color }}>{lane.name}</span>}
                            </div>
                          </div>
                          {task.deadline && (
                            <span className={`text-xs font-medium flex-shrink-0 ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>
                              {format(parseISO(task.deadline), 'M月d日')}
                            </span>
                          )}
                          <button onClick={() => quickUpdateTaskStatus(task.id, 'completed')} className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors">
                            <CheckSquare className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* ── Lane view ── */}
          {activeView === 'overview' && activeLane && (
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    {getLane(activeLane!)?.name}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {filteredProjects.length} 个项目 · {filteredTasks.filter(t => t.status !== 'completed').length} 个进行中任务
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowNewModal('project')} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 transition-colors">
                    <Plus className="w-4 h-4" /> 新建项目
                  </button>
                  <button onClick={() => setShowNewModal('task')} className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors">
                    <Plus className="w-4 h-4" /> 新建任务
                  </button>
                </div>
              </div>

              {/* Projects section */}
              <div className="mb-8">
                <h3 className="text-base font-semibold text-slate-700 mb-3">项目</h3>
                {filteredProjects.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <FolderKanban className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">暂无项目</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredProjects.map(project => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        lane={getLane(project.laneId)}
                        tags={project.tags.map(tid => getTag(tid)).filter(Boolean) as Tag[]}
                        taskCount={state.tasks.filter(t => t.projectId === project.id).length}
                        completedTaskCount={state.tasks.filter(t => t.projectId === project.id && t.status === 'completed').length}
                        onClick={() => { setActiveView('project_detail'); setSelectedProjectId(project.id); }}
                        onEdit={() => setEditingItem({ type: 'project', id: project.id })}
                        onDelete={() => deleteProject(project.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Tasks section */}
              <div>
                <h3 className="text-base font-semibold text-slate-700 mb-3">
                  任务 ({filteredTasks.length})
                </h3>

                {viewMode === 'kanban' ? (
                  <div className="grid grid-cols-4 gap-4">
                    {(['not_started', 'in_progress', 'blocked', 'completed'] as Status[]).map(status => (
                      <KanbanColumn
                        key={status}
                        status={status}
                        tasks={kanbanGroups[status]}
                        onTaskClick={(id) => setDetailItem({ type: 'task', id })}
                        onStatusChange={quickUpdateTaskStatus}
                        getProject={getProject}
                        getTag={getTag}
                        onEdit={(id) => setEditingItem({ type: 'task', id })}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    {filteredTasks.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">
                        <Inbox className="w-10 h-10 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">暂无任务</p>
                      </div>
                    ) : (
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left text-xs font-medium text-slate-400 px-4 py-3 w-8"></th>
                            <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">任务</th>
                            <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">项目</th>
                            <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">状态</th>
                            <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">优先级</th>
                            <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">截止日期</th>
                            <th className="text-left text-xs font-medium text-slate-400 px-4 py-3 w-16"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredTasks.map(task => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              project={getProject(task.projectId)}
                              lane={getLane(task.laneId)}
                              tags={task.tags.map(tid => getTag(tid)).filter(Boolean) as Tag[]}
                              onClick={() => setDetailItem({ type: 'task', id: task.id })}
                              onStatusChange={(s) => quickUpdateTaskStatus(task.id, s)}
                              onEdit={() => setEditingItem({ type: 'task', id: task.id })}
                              onDelete={() => deleteTask(task.id)}
                            />
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Detail slide-over ── */}
      {detailItem && (
        <DetailPanel
          type={detailItem.type}
          item={detailItem.type === 'project'
            ? state.projects.find(p => p.id === detailItem.id)!
            : state.tasks.find(t => t.id === detailItem.id)!
          }
          lane={getLane(detailItem.type === 'project'
            ? (state.projects.find(p => p.id === detailItem.id) as Project)?.laneId
            : (state.tasks.find(t => t.id === detailItem.id) as Task)?.laneId
          )}
          tags={detailItem.type === 'project'
            ? ((state.projects.find(p => p.id === detailItem.id) as Project)?.tags || []).map(tid => getTag(tid)).filter(Boolean) as Tag[]
            : ((state.tasks.find(t => t.id === detailItem.id) as Task)?.tags || []).map(tid => getTag(tid)).filter(Boolean) as Tag[]
          }
          relatedTasks={detailItem.type === 'project'
            ? state.tasks.filter(t => t.projectId === detailItem.id)
            : []
          }
          project={detailItem.type === 'task'
            ? getProject((state.tasks.find(t => t.id === detailItem.id) as Task)!.projectId)
            : undefined
          }
          onClose={() => setDetailItem(null)}
          onEdit={() => { setEditingItem(detailItem); setDetailItem(null); }}
        />
      )}

      {/* ── Edit Modal ── */}
      {editingItem && (
        <EditModal
          type={editingItem.type}
          item={editingItem.type === 'project'
            ? state.projects.find(p => p.id === editingItem.id)!
            : state.tasks.find(t => t.id === editingItem.id)!
          }
          lanes={state.lanes}
          projects={state.projects}
          tags={state.tags}
          onClose={() => setEditingItem(null)}
          onSave={(data) => {
            if (editingItem.type === 'project') updateProject(editingItem.id, data as Partial<Project>);
            else updateTask(editingItem.id, data as Partial<Task>);
          }}
          onDelete={() => {
            if (editingItem.type === 'project') deleteProject(editingItem.id);
            else deleteTask(editingItem.id);
          }}
        />
      )}

      {/* ── New Item Modal ── */}
      {showNewModal && (
        <NewModal
          type={showNewModal}
          lanes={state.lanes}
          projects={state.projects}
          tags={state.tags}
          defaultLaneId={activeLane || undefined}
          defaultProjectId={activeView === 'project_detail' ? selectedProjectId || undefined : undefined}
          onClose={() => setShowNewModal(null)}
          onAdd={(data) => {
            if (showNewModal === 'project') addProject(data as Omit<Project, 'id' | 'createdAt' | 'updatedAt'>);
            else addTask(data as Omit<Task, 'id' | 'createdAt' | 'updatedAt'>);
          }}
        />
      )}

      {/* ── Settings Modal ── */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900">设置</h3>
              <button onClick={() => setShowSettings(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sync mode */}
            <div className="mb-6">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 block">数据同步</label>
              <div className="space-y-2">
                <button
                  onClick={() => handleSyncModeChange('local')}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${
                    syncMode === 'local' ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${syncMode === 'local' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <CloudOff className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-slate-800">本地模式</div>
                    <div className="text-xs text-slate-400">数据保存在浏览器本地</div>
                  </div>
                  {syncMode === 'local' && <span className="ml-auto text-xs font-medium text-slate-900">当前</span>}
                </button>

                <button
                  onClick={() => handleSyncModeChange('cloud')}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${
                    syncMode === 'cloud' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${syncMode === 'cloud' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <Cloud className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-slate-800">云端同步</div>
                    <div className="text-xs text-slate-400">数据同步到 Supabase，支持多设备</div>
                  </div>
                  {!isSupabaseConfigured() && (
                    <span className="ml-auto text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">未配置</span>
                  )}
                  {syncMode === 'cloud' && <span className="ml-auto text-xs font-medium text-emerald-700">当前</span>}
                </button>
              </div>
            </div>

            {/* Cloud config info */}
            <div className="p-3 bg-slate-50 rounded-xl mb-4">
              <div className="text-xs font-semibold text-slate-500 mb-1">Supabase 状态</div>
              <div className="text-xs text-slate-500">
                {isSupabaseConfigured() ? (
                  <span className="text-emerald-600">✓ 已配置环境变量</span>
                ) : (
                  <span className="text-amber-600">✗ 未配置 — 请在项目根目录创建 .env.local 文件，填入 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY</span>
                )}
              </div>
              {isSupabaseConfigured() && (
                <div className="text-[11px] text-slate-400 mt-1">
                  URL: {import.meta.env.VITE_SUPABASE_URL}
                </div>
              )}
            </div>

            {/* Help links */}
            <div className="text-xs text-slate-400 space-y-1">
              <p>📖 配置步骤：</p>
              <ol className="list-decimal list-inside pl-2 space-y-0.5">
                <li>在 <a href="https://supabase.com" target="_blank" className="text-indigo-500 hover:underline">supabase.com</a> 注册并创建项目</li>
                <li>在 SQL Editor 中运行 <code className="bg-slate-100 px-1 rounded">supabase-init.sql</code></li>
                <li>创建 <code className="bg-slate-100 px-1 rounded">.env.local</code> 填入 URL 和 Key</li>
                <li>重启开发服务器</li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
//           SUB-COMPONENTS
// ═══════════════════════════════════════

function SidebarItem({ icon, label, active, sidebarOpen, color, count, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; sidebarOpen: boolean;
  color?: string; count?: number; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${
        active
          ? 'bg-slate-100 text-slate-900 font-medium'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
      }`}
      style={active && color ? { backgroundColor: color + '10', color } : undefined}
    >
      <span className={active && color ? '' : ''}>{icon}</span>
      {sidebarOpen && (
        <>
          <span className="flex-1 text-left">{label}</span>
          {count !== undefined && <span className="text-xs text-slate-400">{count}</span>}
        </>
      )}
    </button>
  );
}

function StatCard({ icon, label, value, color, onClick }: { icon: React.ReactNode; label: string; value: number; color: string; onClick?: () => void }) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border border-slate-200 p-4 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-slate-300' : ''} transition-all`}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${colorMap[color] || 'bg-slate-50 text-slate-600'}`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

function ProjectCard({ project, lane, tags, taskCount, completedTaskCount, onClick, onEdit, onDelete }: {
  project: Project; lane?: Lane; tags: Tag[];
  taskCount: number; completedTaskCount: number;
  onClick: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  return (
    <div onClick={onClick} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:border-slate-300 transition-all cursor-pointer group relative">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {lane && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: lane.color + '15', color: lane.color }}>
              {lane.name}
            </span>
          )}
        </div>
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-slate-100 text-slate-400 transition-all"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />
              <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-20 w-32">
                <button onClick={(e) => { e.stopPropagation(); onEdit(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                  <Edit3 className="w-3.5 h-3.5" /> 编辑
                </button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" /> 删除
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <h4 className="font-semibold text-slate-900 mb-2 leading-snug line-clamp-2">{project.name}</h4>
      <p className="text-xs text-slate-400 mb-3 line-clamp-2">{project.description}</p>

      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[project.status]}`}>
          {STATUS_LABELS[project.status]}
        </span>
        <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[project.priority]}`}>
          {PRIORITY_LABELS[project.priority]}
        </span>
        {project.deadline && (
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Clock className="w-3 h-3" /> {format(parseISO(project.deadline), 'M月d日')}
          </span>
        )}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {tags.slice(0, 4).map(tag => (
            <span key={tag.id} className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: tag.color + '15', color: tag.color }}>
              {tag.name}
            </span>
          ))}
          {tags.length > 4 && <span className="text-[10px] text-slate-400">+{tags.length - 4}</span>}
        </div>
      )}

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="text-slate-400">进度</span>
          <span className="text-slate-600 font-medium">{project.progress}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-1.5">
          <div className="h-1.5 rounded-full transition-all" style={{
            backgroundColor: project.status === 'completed' ? '#10b981' : lane?.color || '#6366f1',
            width: `${project.progress}%`
          }} />
        </div>
        {taskCount > 0 && (
          <div className="text-[11px] text-slate-400 mt-1.5">
            {completedTaskCount}/{taskCount} 任务已完成
          </div>
        )}
      </div>
    </div>
  );
}

function TaskRow({ task, project, lane, tags, onClick, onStatusChange, onEdit, onDelete }: {
  task: Task; project?: Project; lane?: Lane; tags: Tag[];
  onClick: () => void; onStatusChange: (s: Status) => void; onEdit: () => void; onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const isOverdue = task.deadline && isBefore(parseISO(task.deadline), new Date());
  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
      <td className="px-4 py-3">
        <button onClick={(e) => { e.stopPropagation(); onStatusChange(task.status === 'completed' ? 'not_started' : 'completed'); }}
          className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            task.status === 'completed' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'
          }`}>
          {task.status === 'completed' && <span className="text-[10px]">✓</span>}
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="cursor-pointer" onClick={onClick}>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT_COLORS[task.priority]}`} />
            <span className={`text-sm ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
              {task.title}
            </span>
            {tags.slice(0, 2).map(tag => (
              <span key={tag.id} className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: tag.color + '15', color: tag.color }}>
                {tag.name}
              </span>
            ))}
          </div>
          {task.currentProgress && (
            <p className="mt-0.5 ml-4 text-[11px] text-slate-400 line-clamp-1 leading-relaxed">
              {task.currentProgress}
            </p>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          {lane && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: lane.color }} />}
          {project && <span className="truncate max-w-[180px]">{project.name}</span>}
        </div>
      </td>
      <td className="px-4 py-3">
        <select
          value={task.status}
          onChange={(e) => { e.stopPropagation(); onStatusChange(e.target.value as Status); }}
          onClick={(e) => e.stopPropagation()}
          className={`text-[11px] font-medium px-2 py-1 rounded-full border cursor-pointer ${STATUS_COLORS[task.status]} bg-transparent`}
        >
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </td>
      <td className="px-4 py-3">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[task.priority]}`}>
          {PRIORITY_LABELS[task.priority]}
        </span>
      </td>
      <td className="px-4 py-3">
        {task.deadline && (
          <span className={`text-xs flex items-center gap-1 ${isOverdue && task.status !== 'completed' ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
            <Clock className="w-3 h-3" /> {format(parseISO(task.deadline), 'M月d日')}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="relative">
          <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-slate-100 text-slate-400 transition-all">
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />
              <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-20 w-32">
                <button onClick={(e) => { e.stopPropagation(); onClick(); setShowMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                  <ExternalLink className="w-3.5 h-3.5" /> 详情
                </button>
                <button onClick={(e) => { e.stopPropagation(); onEdit(); setShowMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                  <Edit3 className="w-3.5 h-3.5" /> 编辑
                </button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" /> 删除
                </button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function KanbanColumn({ status, tasks, onTaskClick, onStatusChange, getProject, getTag, onEdit }: {
  status: Status; tasks: Task[]; onTaskClick: (id: string) => void;
  onStatusChange: (id: string, s: Status) => void;
  getProject: (id: string) => Project | undefined;
  getTag: (id: string) => Tag | undefined;
  onEdit: (id: string) => void;
}) {
  const statusConfig: Record<Status, { label: string; dotColor: string; bgColor: string }> = {
    not_started: { label: '未开始', dotColor: 'bg-slate-400', bgColor: 'bg-slate-50' },
    in_progress: { label: '进行中', dotColor: 'bg-blue-500', bgColor: 'bg-blue-50' },
    blocked: { label: '阻塞', dotColor: 'bg-amber-500', bgColor: 'bg-amber-50' },
    completed: { label: '已完成', dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-50' },
  };
  const config = statusConfig[status];
  return (
    <div className={`rounded-2xl ${config.bgColor} p-3`}>
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
        <span className="text-sm font-semibold text-slate-700">{config.label}</span>
        <span className="text-xs text-slate-400 bg-white px-2 py-0.5 rounded-full">{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {tasks.map(task => {
          const project = getProject(task.projectId);
          return (
            <div key={task.id} className="bg-white rounded-xl border border-slate-200 p-3 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT_COLORS[task.priority]}`} />
                <span className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-800'}`}
                  onClick={() => onTaskClick(task.id)}>{task.title}</span>
              </div>
              {project && (
                <div className="text-[11px] text-slate-400 mb-2 truncate">{project.name}</div>
              )}
              {task.deadline && (
                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {format(parseISO(task.deadline), 'M月d日')}
                </div>
              )}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                <div className="flex gap-1">
                  {task.tags.slice(0, 2).map(tid => {
                    const tag = getTag(tid);
                    if (!tag) return null;
                    return <span key={tag.id} className="text-[9px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: tag.color + '15', color: tag.color }}>{tag.name}</span>;
                  })}
                </div>
                <div className="flex items-center gap-0.5">
                  {status !== 'completed' && (
                    <button onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, 'completed'); }}
                      className="p-1 rounded hover:bg-emerald-50 text-slate-400 hover:text-emerald-600">
                      <CheckSquare className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button onClick={() => onEdit(task.id)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailPanel({ type, item, lane, tags, relatedTasks, project, onClose, onEdit }: {
  type: 'project' | 'task'; item: Project | Task;
  lane?: Lane; tags: Tag[];
  relatedTasks?: Task[]; project?: Project;
  onClose: () => void; onEdit: () => void;
}) {
  const isProject = type === 'project';
  const p = isProject ? (item as Project) : null;
  const t = isProject ? null : (item as Task);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            {lane && <span className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ backgroundColor: lane.color + '15', color: lane.color }}>{lane.name}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <Edit3 className="w-4 h-4" /> 编辑
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Title */}
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            {isProject ? p!.name : t!.title}
          </h2>

          {/* Meta */}
          <div className="flex items-center gap-3 mb-4">
            <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[item.status]}`}>
              {STATUS_LABELS[item.status]}
            </span>
            <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${PRIORITY_COLORS[item.priority]}`}>
              {PRIORITY_LABELS[item.priority]}
            </span>
            {item.deadline && (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> {format(parseISO(item.deadline), 'yyyy年M月d日')}
              </span>
            )}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              {tags.map(tag => (
                <span key={tag.id} className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: tag.color + '15', color: tag.color }}>
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          <div className="mb-5">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">描述</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{item.description}</p>
          </div>

          {/* Project-specific fields */}
          {isProject && p && (
            <>
              {p.background && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">背景说明</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{p.background}</p>
                </div>
              )}
              {p.nextSteps && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">下一步计划</h3>
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{p.nextSteps}</p>
                </div>
              )}
              {p.risks && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">风险点</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{p.risks}</p>
                </div>
              )}
              {/* Progress */}
              <div className="mb-5">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">进度</h3>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all" style={{ backgroundColor: lane?.color || '#6366f1', width: `${p.progress}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-slate-700">{p.progress}%</span>
                </div>
              </div>
            </>
          )}

          {/* Task-specific fields */}
          {!isProject && t && (
            <>
              {t.currentProgress && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">当前进展</h3>
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{t.currentProgress}</p>
                </div>
              )}
              {t.notes && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">备注</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{t.notes}</p>
                </div>
              )}
              {project && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">所属项目</h3>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-sm font-medium text-slate-700">{project.name}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Related tasks (for project) */}
          {isProject && relatedTasks && relatedTasks.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">相关任务 ({relatedTasks.length})</h3>
              <div className="space-y-2">
                {relatedTasks.map(task => {
                  return (
                    <div key={task.id} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl">
                      <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT_COLORS[task.priority]}`} />
                      <span className={`text-sm flex-1 ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700'}`}>{task.title}</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[task.status]}`}>
                        {STATUS_LABELS[task.status]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Updated at */}
          <div className="text-[11px] text-slate-400 mt-6 pt-4 border-t border-slate-100">
            更新于 {item.updatedAt}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edit Modal ──
function EditModal({ type, item, lanes, projects, tags, onClose, onSave, onDelete }: {
  type: 'project' | 'task'; item: Project | Task;
  lanes: Lane[]; projects: Project[]; tags: Tag[];
  onClose: () => void; onSave: (data: any) => void; onDelete: () => void;
}) {
  const [form, setForm] = useState<any>({ ...item });
  const update = (key: string, value: any) => setForm((prev: any) => ({ ...prev, [key]: value }));
  const isProject = type === 'project';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">编辑{type === 'project' ? '项目' : '任务'}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Name / Title */}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">{type === 'project' ? '项目名称' : '任务标题'}</label>
            <input value={isProject ? form.name : form.title} onChange={e => update(isProject ? 'name' : 'title', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300" />
          </div>

          {/* Lane */}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">主线</label>
            <select value={form.laneId} onChange={e => update('laneId', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
              {lanes.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          {/* Project (for task) */}
          {!isProject && (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">所属项目</label>
              <select value={form.projectId} onChange={e => update('projectId', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                {projects.filter(p => p.laneId === form.laneId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">状态</label>
              <select value={form.status} onChange={e => update('status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">优先级</label>
              <select value={form.priority} onChange={e => update('priority', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">截止日期</label>
            <input type="date" value={form.deadline || ''} onChange={e => update('deadline', e.target.value || undefined)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">描述</label>
            <textarea value={form.description} onChange={e => update('description', e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
          </div>

          {/* Project-specific */}
          {isProject && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">背景说明</label>
                <textarea value={form.background} onChange={e => update('background', e.target.value)} rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">下一步计划</label>
                <textarea value={form.nextSteps} onChange={e => update('nextSteps', e.target.value)} rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">风险点</label>
                <textarea value={form.risks} onChange={e => update('risks', e.target.value)} rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">进度 ({form.progress}%)</label>
                <input type="range" min="0" max="100" value={form.progress} onChange={e => update('progress', Number(e.target.value))}
                  className="w-full" />
              </div>
            </>
          )}

          {/* Task-specific */}
          {!isProject && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">当前进展</label>
                <textarea value={form.currentProgress || ''} onChange={e => update('currentProgress', e.target.value)} rows={3}
                  placeholder="记录当前的进展情况..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">备注</label>
                <textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
              </div>
            </>
          )}

          {/* Tags */}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">标签</label>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <button key={tag.id} onClick={() => {
                  const currentTags = form.tags || [];
                  update('tags', currentTags.includes(tag.id) ? currentTags.filter((t: string) => t !== tag.id) : [...currentTags, tag.id]);
                }} className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  (form.tags || []).includes(tag.id)
                    ? 'border-current'
                    : 'border-transparent opacity-50 hover:opacity-100'
                }`} style={{ color: tag.color, backgroundColor: tag.color + ((form.tags || []).includes(tag.id) ? '20' : '10') }}>
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <button onClick={onDelete} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors">
            <Trash2 className="w-4 h-4" /> 删除
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">取消</button>
            <button onClick={() => onSave(form)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 rounded-xl transition-colors">
              <Save className="w-4 h-4" /> 保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── New Item Modal ──
function NewModal({ type, lanes, projects, tags, defaultLaneId, defaultProjectId, onClose, onAdd }: {
  type: 'project' | 'task'; lanes: Lane[]; projects: Project[]; tags: Tag[];
  defaultLaneId?: string; defaultProjectId?: string;
  onClose: () => void; onAdd: (data: any) => void;
}) {
  const empty = type === 'project'
    ? { name: '', laneId: defaultLaneId || 'lane-research', status: 'not_started' as Status, priority: 'medium' as Priority, deadline: '', description: '', background: '', nextSteps: '', risks: '', progress: 0, tags: [] as string[] }
    : { title: '', projectId: defaultProjectId || '', laneId: defaultLaneId || 'lane-research', status: 'not_started' as Status, priority: 'medium' as Priority, deadline: '', description: '', currentProgress: '', notes: '', tags: [] as string[] };

  const [form, setForm] = useState(empty);
  const update = (key: string, value: any) => setForm((prev: any) => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">新建{type === 'project' ? '项目' : '任务'}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">{type === 'project' ? '项目名称' : '任务标题'}</label>
            <input value={type === 'project' ? form.name : form.title} onChange={e => update(type === 'project' ? 'name' : 'title', e.target.value)}
              placeholder={type === 'project' ? '输入项目名称...' : '输入任务标题...'}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">主线</label>
            <select value={form.laneId} onChange={e => update('laneId', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
              {lanes.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {type === 'task' && (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">所属项目</label>
              <select value={form.projectId} onChange={e => update('projectId', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                <option value="">无</option>
                {projects.filter(p => p.laneId === form.laneId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">状态</label>
              <select value={form.status} onChange={e => update('status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">优先级</label>
              <select value={form.priority} onChange={e => update('priority', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">截止日期</label>
            <input type="date" value={form.deadline} onChange={e => update('deadline', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">描述</label>
            <textarea value={form.description} onChange={e => update('description', e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
          </div>
          {type === 'project' && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">背景说明</label>
                <textarea value={form.background} onChange={e => update('background', e.target.value)} rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">下一步计划</label>
                <textarea value={form.nextSteps} onChange={e => update('nextSteps', e.target.value)} rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
              </div>
            </>
          )}
          {type === 'task' && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">当前进展</label>
                <textarea value={form.currentProgress} onChange={e => update('currentProgress', e.target.value)} rows={3}
                  placeholder="记录当前的进展情况..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">备注</label>
                <textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
              </div>
            </>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">标签</label>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <button key={tag.id} onClick={() => {
                  const currentTags = form.tags || [];
                  update('tags', currentTags.includes(tag.id) ? currentTags.filter((t: string) => t !== tag.id) : [...currentTags, tag.id]);
                }} className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  (form.tags || []).includes(tag.id) ? 'border-current' : 'border-transparent opacity-50 hover:opacity-100'
                }`} style={{ color: tag.color, backgroundColor: tag.color + ((form.tags || []).includes(tag.id) ? '20' : '10') }}>
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">取消</button>
          <button onClick={() => {
            if (type === 'project' && !form.name) return;
            if (type === 'task' && !form.title) return;
            onAdd({
              ...form,
              deadline: form.deadline || undefined,
              projectId: form.projectId || undefined,
            });
          }} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 rounded-xl transition-colors">
            <Plus className="w-4 h-4" /> 创建
          </button>
        </div>
      </div>
    </div>
  );
}
