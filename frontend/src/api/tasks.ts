import apiClient from './client';

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
  teamId: string;
  taskId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assigneeName: string | null;
  createdBy: string;
  createdByEmail: string;
  dueDate: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  taskId: string;
  commentId: string;
  content: string;
  authorId: string;
  authorEmail: string;
  createdAt: string;
}

export const tasksApi = {
  list: (params: { teamId?: string; assigneeId?: string; status?: string }) =>
    apiClient.get<{ tasks: Task[] }>('/tasks', { params }),

  get: (taskId: string, teamId: string) =>
    apiClient.get<{ task: Task }>(`/tasks/${taskId}`, { params: { teamId } }),

  create: (data: Partial<Task>) =>
    apiClient.post<{ task: Task }>('/tasks', data),

  update: (taskId: string, data: Partial<Task> & { teamId: string }) =>
    apiClient.put<{ task: Task }>(`/tasks/${taskId}`, data),

  delete: (taskId: string, teamId: string) =>
    apiClient.delete(`/tasks/${taskId}`, { params: { teamId } }),

  getComments: (taskId: string) =>
    apiClient.get<{ comments: Comment[] }>(`/tasks/${taskId}/comments`),

  addComment: (taskId: string, content: string) =>
    apiClient.post<{ comment: Comment }>(`/tasks/${taskId}/comments`, { content }),

  deleteComment: (taskId: string, commentId: string) =>
    apiClient.delete(`/tasks/${taskId}/comments/${commentId}`),
};

export const usersApi = {
  listTeams: () => apiClient.get<{ teams: { teamId: string; name: string; description: string }[] }>('/teams'),
  listMembers: (teamId: string) => apiClient.get<{ users: { userId: string; email: string; name: string }[] }>(`/teams/${teamId}/members`),
  listAll: () => apiClient.get<{ users: { userId: string; email: string; name: string }[] }>('/users'),
};
