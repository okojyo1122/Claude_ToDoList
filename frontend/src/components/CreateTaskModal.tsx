import { useState } from 'react';
import { type TaskPriority, tasksApi } from '../api/tasks';

interface Props {
  teams: { teamId: string; name: string }[];
  defaultTeam?: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateTaskModal({ teams, defaultTeam, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    teamId: defaultTeam ?? (teams[0]?.teamId ?? ''),
    assigneeName: '',
    priority: 'medium' as TaskPriority,
    dueDate: '',
    tags: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.teamId) { setError('タイトルとチームは必須です'); return; }
    setLoading(true);
    setError('');
    try {
      await tasksApi.create({
        ...form,
        dueDate: form.dueDate || null,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        assigneeName: form.assigneeName || null,
      });
      onCreated();
    } catch {
      setError('タスクの作成に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = { width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 12px', outline: 'none', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: '#111827' }}>新しいタスクを作成</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>タイトル *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} placeholder="タスクのタイトル" required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>チーム *</label>
              <select value={form.teamId} onChange={e => setForm(f => ({ ...f, teamId: e.target.value }))} style={inputStyle}>
                {teams.map(t => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>優先度</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))} style={inputStyle}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>担当者</label>
              <input value={form.assigneeName} onChange={e => setForm(f => ({ ...f, assigneeName: e.target.value }))} style={inputStyle} placeholder="担当者名" />
            </div>
            <div>
              <label style={labelStyle}>期限</label>
              <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>説明</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ ...inputStyle, height: 80, resize: 'vertical' }} placeholder="タスクの詳細..." />
          </div>

          <div>
            <label style={labelStyle}>タグ (カンマ区切り)</label>
            <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} style={inputStyle} placeholder="例: バグ修正, フロントエンド" />
          </div>

          {error && <p style={{ color: '#dc2626', margin: 0, fontSize: 13 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 20px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 14 }}>
              キャンセル
            </button>
            <button type="submit" disabled={loading} style={{ padding: '8px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              {loading ? '作成中...' : 'タスクを作成'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
