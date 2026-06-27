import { useEffect, useState, useCallback } from 'react';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { getCurrentUser, signOut, fetchAuthSession } from 'aws-amplify/auth';
import { awsConfig } from './aws-config';
import { type Task, tasksApi, usersApi } from './api/tasks';
import KanbanBoard from './components/KanbanBoard';
import Sidebar from './components/Sidebar';
import CreateTaskModal from './components/CreateTaskModal';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: awsConfig.userPoolId,
      userPoolClientId: awsConfig.userPoolClientId,
    },
  },
});

interface Team { teamId: string; name: string; description: string; }

function MainApp() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'team' | 'personal'>('team');
  const [showCreate, setShowCreate] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [filterPriority, setFilterPriority] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const user = await getCurrentUser();
      const session = await fetchAuthSession();
      const claims = session.tokens?.idToken?.payload ?? {};
      setCurrentUserEmail(claims.email as string ?? user.username);
      setCurrentUserId(user.userId);

      const teamsRes = await usersApi.listTeams();
      setTeams(teamsRes.data.teams);
    } catch (err) {
      console.error(err);
    }
  }

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params: { teamId?: string; assigneeId?: string } = {};
      if (viewMode === 'personal') {
        params.assigneeId = currentUserId;
      } else if (selectedTeam) {
        params.teamId = selectedTeam;
      }
      const res = await tasksApi.list(params);
      setTasks(res.data.tasks);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [viewMode, selectedTeam, currentUserId]);

  useEffect(() => {
    if (currentUserId || viewMode === 'team') loadTasks();
  }, [loadTasks, currentUserId]);

  const filteredTasks = tasks.filter(t => {
    if (filterPriority && t.priority !== filterPriority) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || (t.assigneeName ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const headerTitle = viewMode === 'personal' ? 'マイタスク' : selectedTeam ? `# ${selectedTeam}` : '全チームのタスク';

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f9fafb' }}>
      <Sidebar
        teams={teams}
        selectedTeam={selectedTeam}
        viewMode={viewMode}
        onSelectTeam={setSelectedTeam}
        onViewModeChange={setViewMode}
        currentUserEmail={currentUserEmail}
        onSignOut={() => signOut()}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: '#111827', flex: 1 }}>{headerTitle}</h2>

          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="タスクを検索..."
            style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: 200, outline: 'none' }}
          />

          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, outline: 'none' }}
          >
            <option value="">全優先度</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <button
            onClick={() => setShowCreate(true)}
            style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            + タスク追加
          </button>
        </div>

        {/* Stats bar */}
        <div style={{ padding: '8px 24px', background: '#fff', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 20 }}>
          {(['todo', 'in_progress', 'review', 'done'] as const).map(s => {
            const count = filteredTasks.filter(t => t.status === s).length;
            const labels = { todo: 'Todo', in_progress: 'In Progress', review: 'Review', done: 'Done' };
            const colors = { todo: '#6b7280', in_progress: '#2563eb', review: '#d97706', done: '#16a34a' };
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[s], display: 'inline-block' }} />
                <span style={{ fontSize: 13, color: '#374151' }}>{labels[s]}: <strong>{count}</strong></span>
              </div>
            );
          })}
          <span style={{ marginLeft: 'auto', fontSize: 13, color: '#9ca3af' }}>計 {filteredTasks.length} タスク</span>
        </div>

        {/* Kanban */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: '#9ca3af' }}>
              読み込み中...
            </div>
          ) : (
            <KanbanBoard tasks={filteredTasks} onTasksChange={loadTasks} selectedTeam={selectedTeam} />
          )}
        </div>
      </main>

      {showCreate && (
        <CreateTaskModal
          teams={teams}
          defaultTeam={selectedTeam ?? undefined}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadTasks(); }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <Authenticator
      loginMechanisms={['email']}
      hideSignUp
      components={{
        Header() {
          return (
            <div style={{ textAlign: 'center', padding: '32px 0 8px' }}>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#4338ca' }}>TaskFlow</h1>
              <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>技術部タスク管理システム</p>
            </div>
          );
        },
      }}
    >
      {() => <MainApp />}
    </Authenticator>
  );
}
