import { useEffect, useState, useCallback } from 'react';
import { Amplify } from 'aws-amplify';
import { getCurrentUser, signOut, fetchAuthSession, signInWithRedirect } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { awsConfig } from './aws-config';
import { type Task, tasksApi, usersApi } from './api/tasks';
import KanbanBoard from './components/KanbanBoard';
import Sidebar from './components/Sidebar';
import CreateTaskModal from './components/CreateTaskModal';
import UserManagementPage from './components/UserManagementPage';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: awsConfig.userPoolId,
      userPoolClientId: awsConfig.userPoolClientId,
      loginWith: {
        oauth: {
          domain: awsConfig.cognitoDomain.replace('https://', ''),
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: [`${awsConfig.appUrl}/callback`],
          redirectSignOut: [awsConfig.appUrl],
          responseType: 'code',
        },
      },
    },
  },
});

interface Team { teamId: string; name: string; description: string; }

function LoginPage() {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await signInWithRedirect({ provider: 'Google' });
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '48px 40px', width: 380,
        boxShadow: '0 24px 80px rgba(0,0,0,0.2)', textAlign: 'center',
      }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800, color: '#4338ca' }}>TaskManager</h1>
        <p style={{ margin: '0 0 36px', color: '#6b7280', fontSize: 14 }}>技術部タスク管理システム</p>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            width: '100%', padding: '12px 20px', border: '1px solid #d1d5db',
            borderRadius: 8, background: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 15, fontWeight: 500, color: '#374151', transition: 'box-shadow 0.15s',
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>
            <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.32-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/>
            <path fill="#FBBC05" d="M11.68 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.34-5.7z"/>
            <path fill="#EA4335" d="M24 9.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 3.19 29.93 1 24 1 15.4 1 7.96 5.93 4.34 14.12l7.34 5.7C13.42 13.62 18.27 9.75 24 9.75z"/>
          </svg>
          {loading ? 'リダイレクト中...' : 'Google アカウントでログイン'}
        </button>

        <p style={{ marginTop: 24, fontSize: 12, color: '#9ca3af' }}>
          @gmail.com アカウントのみ利用可能です
        </p>
      </div>
    </div>
  );
}

function MainApp() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'team' | 'personal' | 'admin'>('personal');
  const [showCreate, setShowCreate] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserGroups, setCurrentUserGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPriority, setFilterPriority] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const isAdmin = currentUserGroups.includes('admin');

  useEffect(() => { init(); }, []);

  async function init() {
    try {
      const user = await getCurrentUser();
      const session = await fetchAuthSession();
      const claims = session.tokens?.idToken?.payload ?? {};
      setCurrentUserEmail(claims.email as string ?? user.username);
      setCurrentUserId(user.userId);

      const rawGroups = claims['cognito:groups'];
      const groups: string[] = Array.isArray(rawGroups) ? rawGroups : rawGroups ? [rawGroups as string] : [];
      setCurrentUserGroups(groups);

      const teamsRes = await usersApi.listTeams();
      setTeams(teamsRes.data.teams);

      const myTeams = teamsRes.data.teams.filter(t => groups.includes(t.teamId));
      if (myTeams.length > 0 && !groups.includes('admin')) {
        setViewMode('team');
        setSelectedTeam(myTeams[0].teamId);
      }
    } catch (err) {
      console.error(err);
    }
  }

  const loadTasks = useCallback(async () => {
    if (viewMode === 'admin') return;
    setLoading(true);
    try {
      const params: { teamId?: string; assigneeId?: string } = {};
      if (viewMode === 'personal') params.assigneeId = currentUserId;
      else if (selectedTeam) params.teamId = selectedTeam;
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

  const headerTitle = viewMode === 'admin' ? 'ユーザー管理'
    : viewMode === 'personal' ? 'マイタスク'
    : selectedTeam ? `# ${selectedTeam}` : '全チームのタスク';

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f9fafb' }}>
      <Sidebar
        teams={teams} selectedTeam={selectedTeam} viewMode={viewMode}
        onSelectTeam={setSelectedTeam} onViewModeChange={setViewMode}
        currentUserEmail={currentUserEmail} currentUserGroups={currentUserGroups}
        onSignOut={() => signOut()}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: '#111827', flex: 1 }}>{headerTitle}</h2>
          {viewMode !== 'admin' && (
            <>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="タスクを検索..." style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: 200, outline: 'none' }} />
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, outline: 'none' }}>
                <option value="">全優先度</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <button onClick={() => setShowCreate(true)} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                + タスク追加
              </button>
            </>
          )}
        </div>

        {viewMode === 'admin' ? (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <UserManagementPage currentUserId={currentUserId} />
          </div>
        ) : (
          <>
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
            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
              {loading
                ? <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: '#9ca3af' }}>読み込み中...</div>
                : <KanbanBoard tasks={filteredTasks} onTasksChange={loadTasks} />
              }
            </div>
          </>
        )}
      </main>
      {showCreate && (
        <CreateTaskModal
          teams={isAdmin ? teams : teams.filter(t => currentUserGroups.includes(t.teamId))}
          defaultTeam={selectedTeam ?? undefined}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadTasks(); }}
        />
      )}
    </div>
  );
}

function CallbackPage() {
  useEffect(() => {
    const timer = setTimeout(() => { window.location.replace('/'); }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <p style={{ color: '#6b7280' }}>ログイン処理中...</p>
    </div>
  );
}

export default function App() {
  const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const isCallback = window.location.pathname === '/callback';

  useEffect(() => {
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn') setAuthState('authenticated');
      if (payload.event === 'signedOut') setAuthState('unauthenticated');
    });
    getCurrentUser()
      .then(() => setAuthState('authenticated'))
      .catch(() => setAuthState('unauthenticated'));
    return unsubscribe;
  }, []);

  if (isCallback) return <CallbackPage />;
  if (authState === 'loading') {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#9ca3af', fontFamily: 'sans-serif' }}>読み込み中...</p>
      </div>
    );
  }
  if (authState === 'unauthenticated') return <LoginPage />;
  return <MainApp />;
}
