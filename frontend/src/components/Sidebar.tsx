import React from 'react';

interface Team { teamId: string; name: string; }

interface Props {
  teams: Team[];
  selectedTeam: string | null;
  viewMode: 'team' | 'personal' | 'admin';
  onSelectTeam: (teamId: string | null) => void;
  onViewModeChange: (mode: 'team' | 'personal' | 'admin') => void;
  currentUserEmail: string;
  currentUserGroups: string[];
  onSignOut: () => void;
}

export default function Sidebar({ teams, selectedTeam, viewMode, onSelectTeam, onViewModeChange, currentUserEmail, currentUserGroups, onSignOut }: Props) {
  const isAdmin = currentUserGroups.includes('admin');

  const navItem = (active: boolean): React.CSSProperties => ({
    display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 6,
    border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: active ? 600 : 400,
    background: active ? '#e0e7ff' : 'transparent', color: active ? '#4338ca' : '#374151',
    marginBottom: 2,
  });

  const visibleTeams = isAdmin ? teams : teams.filter(t => currentUserGroups.includes(t.teamId));

  return (
    <aside style={{ width: 220, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', padding: '20px 12px' }}>
      <div style={{ padding: '0 4px 20px', borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#4338ca' }}>TaskManager</h1>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af' }}>技術部タスク管理</p>
      </div>

      <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px' }}>表示</p>
      <button style={navItem(viewMode === 'personal')} onClick={() => { onViewModeChange('personal'); onSelectTeam(null); }}>
        👤 マイタスク
      </button>
      {isAdmin && (
        <button style={navItem(viewMode === 'team' && selectedTeam === null)} onClick={() => { onViewModeChange('team'); onSelectTeam(null); }}>
          🏢 全チーム
        </button>
      )}

      {visibleTeams.length > 0 && (
        <>
          <p style={{ margin: '16px 0 6px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px' }}>チーム</p>
          {visibleTeams.map(team => (
            <button key={team.teamId} style={navItem(viewMode === 'team' && selectedTeam === team.teamId)}
              onClick={() => { onViewModeChange('team'); onSelectTeam(team.teamId); }}>
              # {team.name}
            </button>
          ))}
        </>
      )}

      {isAdmin && (
        <>
          <p style={{ margin: '16px 0 6px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px' }}>管理</p>
          <button style={navItem(viewMode === 'admin')} onClick={() => { onViewModeChange('admin'); onSelectTeam(null); }}>
            ⚙️ ユーザー管理
          </button>
        </>
      )}

      <div style={{ marginTop: 'auto', borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
        {currentUserGroups.length > 0 && (
          <div style={{ padding: '0 4px 8px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {currentUserGroups.map(g => (
              <span key={g} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: g === 'admin' ? '#fee2e2' : '#e0e7ff', color: g === 'admin' ? '#dc2626' : '#4338ca' }}>
                {g}
              </span>
            ))}
          </div>
        )}
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>
          {currentUserEmail}
        </p>
        <button onClick={onSignOut} style={{ ...navItem(false), color: '#dc2626' }}>
          サインアウト
        </button>
      </div>
    </aside>
  );
}
