import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { type Task, type TaskStatus, tasksApi } from '../api/tasks';
import TaskCard from './TaskCard';
import TaskModal from './TaskModal';

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'todo', label: 'Todo', color: '#6b7280' },
  { id: 'in_progress', label: 'In Progress', color: '#2563eb' },
  { id: 'review', label: 'Review', color: '#d97706' },
  { id: 'done', label: 'Done', color: '#16a34a' },
];

interface Props {
  tasks: Task[];
  onTasksChange: () => void;
  selectedTeam?: string | null;
}

export default function KanbanBoard({ tasks, onTasksChange }: Props) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const tasksByStatus = (status: TaskStatus) => tasks.filter(t => t.status === status);

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId as TaskStatus;
    const taskId = result.draggableId;
    const task = tasks.find(t => t.taskId === taskId);
    if (!task || task.status === newStatus) return;

    try {
      await tasksApi.update(taskId, { teamId: task.teamId, status: newStatus });
      onTasksChange();
    } catch (err) {
      console.error('ステータス更新に失敗しました', err);
    }
  };

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', gap: 16, overflowX: 'auto', padding: '8px 0' }}>
          {COLUMNS.map(col => (
            <div key={col.id} style={{ minWidth: 280, flex: 1, background: '#f3f4f6', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: col.color, display: 'inline-block' }} />
                <strong style={{ fontSize: 14, color: '#374151' }}>{col.label}</strong>
                <span style={{ marginLeft: 'auto', background: '#e5e7eb', borderRadius: 12, padding: '2px 8px', fontSize: 12, color: '#6b7280' }}>
                  {tasksByStatus(col.id).length}
                </span>
              </div>
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      minHeight: 100,
                      background: snapshot.isDraggingOver ? '#e0e7ff' : 'transparent',
                      borderRadius: 8,
                      transition: 'background 0.2s',
                      padding: 4,
                    }}
                  >
                    {tasksByStatus(col.id).map((task, index) => (
                      <Draggable key={task.taskId} draggableId={task.taskId} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            style={{
                              marginBottom: 8,
                              ...provided.draggableProps.style,
                              opacity: snapshot.isDragging ? 0.85 : 1,
                            }}
                          >
                            <TaskCard task={task} onClick={() => setSelectedTask(task)} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => { setSelectedTask(null); onTasksChange(); }}
        />
      )}
    </>
  );
}
