import React from 'react';

interface Team { teamId: string; name: string; }

interface Props {
  teams: Team[];
  selectedTeam: string | null;
  viewMode: 'team' | 'personal';
  onSelectTeam: (teamId: string | null) => void;
  onViewModeChange: (mode: 'team' | 'personal') => void;
  currentUserEmail: string;
  onSignOut: () => void;
}

export default function Sidebar({ teams, selectedTeam, viewMode, onSelectTeam, onViewModeChange, currentUserEmail, onSignOut }: Props) {
  const navItem = (active: boolean): React.CSSProperties => ({
    display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 6,
    border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: active ? 600 : 400,
    background: active ? '#e0e7ff' : 'transparent', color: active ? '#4338ca' : '#374151',
    marginBottom: 2,
  });

  return (
    <aside style={{ width: 220, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', padding: '20px 12px' }}>
      {/* Logo */}
      <div style={{ padding: '0 4px 20px', borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#4338ca' }}>TaskFlow</h1>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af' }}>技術部タスク管理</p>
      </div>

      {/* View Mode */}
      <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px' }}>表示</p>
      <button style={navItem(viewMode === 'personal')} onClick={() => { onViewModeChange('personal'); onSelectTeam(null); }}>
        👤 マイタスク
      </button>
      <button style={navItem(viewMode === 'team' && selectedTeam === null)} onClick={() => { onViewModeChange('team'); onSelectTeam(null); }}>
        🏢 全チーム
      </button>

      {/* Teams */}
      <p style={{ margin: '16px 0 6px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px' }}>チーム</p>
      {teams.map(team => (
        <button key={team.teamId} style={navItem(viewMode === 'team' && selectedTeam === team.teamId)}
          onClick={() => { onViewModeChange('team'); onSelectTeam(team.teamId); }}>
          # {team.name}
        </button>
      ))}

      {/* User info */}
      <div style={{ marginTop: 'auto', borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
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
