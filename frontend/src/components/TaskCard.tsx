import { type Task, type TaskPriority } from '../api/tasks';
import { format, parseISO, isPast } from 'date-fns';
import { ja } from 'date-fns/locale';

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  low: { label: 'Low', color: '#6b7280', bg: '#f3f4f6' },
  medium: { label: 'Medium', color: '#2563eb', bg: '#eff6ff' },
  high: { label: 'High', color: '#d97706', bg: '#fffbeb' },
  urgent: { label: 'Urgent', color: '#dc2626', bg: '#fef2f2' },
};

interface Props {
  task: Task;
  onClick: () => void;
}

export default function TaskCard({ task, onClick }: Props) {
  const priority = PRIORITY_CONFIG[task.priority];
  const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && task.status !== 'done';

  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        borderRadius: 8,
        padding: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        cursor: 'pointer',
        borderLeft: `4px solid ${priority.color}`,
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827', flex: 1, lineHeight: 1.4 }}>
          {task.title}
        </p>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
          color: priority.color, background: priority.bg, marginLeft: 8, whiteSpace: 'nowrap',
        }}>
          {priority.label}
        </span>
      </div>

      {task.description && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.description}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
        {task.assigneeName && (
          <span style={{ fontSize: 12, color: '#4b5563', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%', background: '#6366f1', color: '#fff',
              fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {task.assigneeName.charAt(0).toUpperCase()}
            </span>
            {task.assigneeName}
          </span>
        )}
        {task.dueDate && (
          <span style={{ fontSize: 11, color: isOverdue ? '#dc2626' : '#6b7280', fontWeight: isOverdue ? 600 : 400 }}>
            {isOverdue ? '⚠ ' : ''}{format(parseISO(task.dueDate), 'MM/dd', { locale: ja })}
          </span>
        )}
      </div>

      {task.tags.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {task.tags.map(tag => (
            <span key={tag} style={{ fontSize: 10, padding: '1px 6px', background: '#e0e7ff', color: '#4338ca', borderRadius: 12 }}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
