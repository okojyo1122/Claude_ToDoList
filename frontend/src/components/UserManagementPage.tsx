import { useEffect, useState } from 'react';
import { type UserWithGroups, usersApi } from '../api/tasks';

const TEAMS = ['frontend', 'backend', 'infrastructure', 'qa'];

interface Props {
  currentUserId: string;
}

export default function UserManagementPage({ currentUserId }: Props) {
  const [users, setUsers] = useState<UserWithGroups[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await usersApi.listAll();
      setUsers(res.data.users);
    } finally {
      setLoading(false);
    }
  }

  async function handleGroupChange(user: UserWithGroups, team: string, checked: boolean) {
    setSaving(user.username);
    try {
      const newGroups = checked
        ? [...user.groups.filter(g => g !== 'admin'), team]
        : user.groups.filter(g => g !== team && g !== 'admin');
      await usersApi.updateGroups(user.username, newGroups);
      setUsers(prev => prev.map(u =>
        u.username === user.username
          ? { ...u, groups: checked ? [...u.groups.filter(g => g !== 'admin'), team] : u.groups.filter(g => g !== team) }
          : u
      ));
      setMessage('更新しました');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setMessage('更新に失敗しました');
    } finally {
      setSaving(null);
    }
  }

  async function handleAdminChange(user: UserWithGroups, checked: boolean) {
    if (user.userId === currentUserId) return; // 自分のadminは変更不可
    setSaving(user.username);
    try {
      await usersApi.updateAdmin(user.username, checked);
      setUsers(prev => prev.map(u =>
        u.username === user.username
          ? { ...u, groups: checked ? [...u.groups, 'admin'] : u.groups.filter(g => g !== 'admin') }
          : u
      ));
      setMessage('更新しました');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setMessage('更新に失敗しました');
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <div style={{ padding: 40, color: '#9ca3af' }}>読み込み中...</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 20, color: '#111827' }}>ユーザー管理</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: '#6b7280' }}>チームとadmin権限の割り当てを管理します</p>

      {message && (
        <div style={{ marginBottom: 16, padding: '8px 14px', background: '#d1fae5', borderRadius: 6, fontSize: 13, color: '#065f46' }}>
          {message}
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
            <th style={th}>ユーザー</th>
            {TEAMS.map(t => <th key={t} style={th}>{t}</th>)}
            <th style={th}>admin</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.username} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={td}>
                <div style={{ fontWeight: 500, color: '#111827' }}>{user.name}</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>{user.email}</div>
              </td>
              {TEAMS.map(team => (
                <td key={team} style={{ ...td, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={user.groups.includes(team)}
                    disabled={saving === user.username}
                    onChange={e => handleGroupChange(user, team, e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                </td>
              ))}
              <td style={{ ...td, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={user.groups.includes('admin')}
                  disabled={saving === user.username || user.userId === currentUserId}
                  onChange={e => handleAdminChange(user, e.target.checked)}
                  style={{ width: 16, height: 16, cursor: user.userId === currentUserId ? 'not-allowed' : 'pointer', accentColor: '#dc2626' }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#6b7280' };
const td: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' };
