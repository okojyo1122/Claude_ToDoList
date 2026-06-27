import { useEffect, useState } from 'react';
import { type Task, type Comment, type TaskStatus, type TaskPriority, tasksApi } from '../api/tasks';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { getCurrentUser } from 'aws-amplify/auth';

interface Props {
  task: Task;
  onClose: () => void;
  onUpdate: () => void;
}

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];
const STATUS_LABELS: Record<TaskStatus, string> = { todo: 'Todo', in_progress: 'In Progress', review: 'Review', done: 'Done' };
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export default function TaskModal({ task, onClose, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...task });
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');

  useEffect(() => {
    loadComments();
    getCurrentUser().then(u => setCurrentUserId(u.userId));
  }, []);

  async function loadComments() {
    const res = await tasksApi.getComments(task.taskId);
    setComments(res.data.comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }

  async function handleUpdate() {
    await tasksApi.update(task.taskId, { ...form, teamId: task.teamId });
    onUpdate();
  }

  async function handleDelete() {
    if (!confirm('このタスクを削除しますか?')) return;
    await tasksApi.delete(task.taskId, task.teamId);
    onUpdate();
  }

  async function handleAddComment() {
    if (!newComment.trim()) return;
    await tasksApi.addComment(task.taskId, newComment.trim());
    setNewComment('');
    loadComments();
  }

  async function handleDeleteComment(commentId: string) {
    await tasksApi.deleteComment(task.taskId, commentId);
    loadComments();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 680,
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            {editing ? (
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                style={{ fontSize: 20, fontWeight: 700, border: 'none', borderBottom: '2px solid #6366f1', outline: 'none', flex: 1, paddingBottom: 4 }}
              />
            ) : (
              <h2 style={{ margin: 0, fontSize: 20, color: '#111827' }}>{task.title}</h2>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280', marginLeft: 12 }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 8, paddingBottom: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>チーム: <strong>{task.teamId}</strong></span>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>|</span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>作成: {format(parseISO(task.createdAt), 'yyyy/MM/dd', { locale: ja })}</span>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>ステータス</label>
              {editing ? (
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as TaskStatus }))} style={selectStyle}>
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              ) : <p style={valueStyle}>{STATUS_LABELS[task.status]}</p>}
            </div>
            <div>
              <label style={labelStyle}>優先度</label>
              {editing ? (
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))} style={selectStyle}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : <p style={valueStyle}>{task.priority}</p>}
            </div>
            <div>
              <label style={labelStyle}>担当者</label>
              {editing ? (
                <input value={form.assigneeName ?? ''} onChange={e => setForm(f => ({ ...f, assigneeName: e.target.value }))} style={inputStyle} placeholder="担当者名" />
              ) : <p style={valueStyle}>{task.assigneeName ?? '未割り当て'}</p>}
            </div>
            <div>
              <label style={labelStyle}>期限</label>
              {editing ? (
                <input type="date" value={form.dueDate?.slice(0, 10) ?? ''} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={inputStyle} />
              ) : <p style={valueStyle}>{task.dueDate ? format(parseISO(task.dueDate), 'yyyy/MM/dd', { locale: ja }) : '未設定'}</p>}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>説明</label>
            {editing ? (
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                style={{ ...inputStyle, height: 100, resize: 'vertical' }}
                placeholder="タスクの説明..."
              />
            ) : <p style={{ ...valueStyle, whiteSpace: 'pre-wrap', minHeight: 40 }}>{task.description || '説明なし'}</p>}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {editing ? (
              <>
                <button onClick={handleUpdate} style={btnStyle('#6366f1')}>保存</button>
                <button onClick={() => { setForm({ ...task }); setEditing(false); }} style={btnStyle('#6b7280')}>キャンセル</button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} style={btnStyle('#6366f1')}>編集</button>
                <button onClick={handleDelete} style={btnStyle('#dc2626')}>削除</button>
              </>
            )}
          </div>

          {/* Comments */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#374151' }}>コメント ({comments.length})</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAddComment()}
                placeholder="コメントを入力..."
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={handleAddComment} style={btnStyle('#6366f1')}>送信</button>
            </div>
            {comments.map(c => (
              <div key={c.commentId} style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{c.authorEmail}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{format(parseISO(c.createdAt), 'MM/dd HH:mm', { locale: ja })}</span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: '#4b5563', whiteSpace: 'pre-wrap' }}>{c.content}</p>
                {c.authorId === currentUserId && (
                  <button onClick={() => handleDeleteComment(c.commentId)} style={{ marginTop: 4, fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    削除
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' };
const valueStyle: React.CSSProperties = { margin: 0, fontSize: 14, color: '#111827' };
const inputStyle: React.CSSProperties = { width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', outline: 'none', boxSizing: 'border-box' };
const selectStyle: React.CSSProperties = { ...inputStyle };
const btnStyle = (bg: string): React.CSSProperties => ({
  background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px',
  fontSize: 14, fontWeight: 600, cursor: 'pointer',
});
