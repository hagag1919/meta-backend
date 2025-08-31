import React, { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '../../components/layout';
import { Card, Button, Modal, Input } from '../../components/ui';
import { useForm } from 'react-hook-form';
import { 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Calendar,
  Clock,
  Flag,
  Pencil,
  Eye
} from 'lucide-react';
import apiService from '../../services/api';
import { Task } from '../../types';

interface TaskFormData {
  title: string;
  description: string;
  project_id: string;
  assigned_to?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimated_hours?: number;
  due_date?: string;
}

const columns = [
  { id: 'todo', title: 'To Do', color: 'bg-gray-100' },
  { id: 'in_progress', title: 'In Progress', color: 'bg-blue-100' },
  { id: 'review', title: 'Review', color: 'bg-yellow-100' },
  { id: 'completed', title: 'Completed', color: 'bg-green-100' }
];

const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<TaskFormData>();

  const fetchTasks = useCallback(async () => {
    try {
      setIsLoading(true);
      const params: any = {};
      if (searchTerm) params.search = searchTerm;
      if (priorityFilter) params.priority = priorityFilter;
      
      const response = await apiService.getTasks(params);
      setTasks(response.tasks || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch tasks');
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, priorityFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleCreateTask = async (data: TaskFormData) => {
    try {
      const response = await apiService.createTask(data);
      setTasks([response.task, ...tasks]);
      setIsCreateModalOpen(false);
      reset();
    } catch (err: any) {
      setError(err.message || 'Failed to create task');
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      await apiService.updateTask(taskId, { status: newStatus });
      setTasks(tasks.map(task => 
        task.id === taskId ? { ...task, status: newStatus as any } : task
      ));
    } catch (err: any) {
      setError(err.message || 'Failed to update task');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low':
        return 'bg-gray-100 text-gray-800';
      case 'medium':
        return 'bg-blue-100 text-blue-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'critical':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityIcon = (priority: string) => {
    const baseClasses = "h-4 w-4";
    switch (priority) {
      case 'low':
        return <Flag className={`${baseClasses} text-gray-500`} />;
      case 'medium':
        return <Flag className={`${baseClasses} text-blue-500`} />;
      case 'high':
        return <Flag className={`${baseClasses} text-orange-500`} />;
      case 'critical':
        return <Flag className={`${baseClasses} text-red-500`} />;
      default:
        return <Flag className={`${baseClasses} text-gray-500`} />;
    }
  };

  const tasksByStatus = columns.reduce((acc, column) => {
    acc[column.id] = tasks.filter(task => task.status === column.id);
    return acc;
  }, {} as Record<string, Task[]>);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
            <p className="text-gray-600">Manage tasks with Kanban board</p>
          </div>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            icon={Plus}
            className="bg-primary-600 hover:bg-primary-700"
          >
            New Task
          </Button>
        </div>

        {/* Filters */}
        <Card padding="sm">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                <option value="">All Priority</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Error message */}
        {error && (
          <Card>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </Card>
        )}

        {/* Kanban Board */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 min-h-96">
          {columns.map((column) => (
            <div key={column.id} className="space-y-4">
              {/* Column header */}
              <div className={`p-3 rounded-lg ${column.color}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">{column.title}</h3>
                  <span className="bg-white px-2 py-1 rounded-full text-xs font-medium text-gray-600">
                    {tasksByStatus[column.id]?.length || 0}
                  </span>
                </div>
              </div>

              {/* Tasks */}
              <div className="space-y-3">
                {tasksByStatus[column.id]?.map((task) => (
                  <Card key={task.id} padding="sm" className="hover:shadow-md transition-shadow duration-200 cursor-pointer">
                    <div className="space-y-3">
                      {/* Task header */}
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium text-gray-900 text-sm line-clamp-2">
                          {task.title}
                        </h4>
                        <Button variant="ghost" size="sm" icon={MoreHorizontal} className="p-1" />
                      </div>

                      {/* Task description */}
                      {task.description && (
                        <p className="text-gray-600 text-xs line-clamp-2">
                          {task.description}
                        </p>
                      )}

                      {/* Task metadata */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          {getPriorityIcon(task.priority)}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
                            {task.priority}
                          </span>
                        </div>
                        
                        {task.estimated_hours && (
                          <div className="flex items-center space-x-1 text-xs text-gray-500">
                            <Clock className="h-3 w-3" />
                            <span>{task.estimated_hours}h</span>
                          </div>
                        )}
                      </div>

                      {/* Due date */}
                      {task.due_date && (
                        <div className="flex items-center space-x-1 text-xs text-gray-500">
                          <Calendar className="h-3 w-3" />
                          <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>
                        </div>
                      )}

                      {/* Task actions */}
                      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <div className="flex items-center space-x-1">
                          <Button variant="ghost" size="sm" icon={Eye} className="p-1" />
                          <Button variant="ghost" size="sm" icon={Pencil} className="p-1" />
                        </div>
                        
                        {/* Status change buttons */}
                        {column.id !== 'completed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs px-2 py-1"
                            onClick={() => {
                              const nextStatus = column.id === 'todo' ? 'in_progress' : 
                                               column.id === 'in_progress' ? 'review' : 'completed';
                              handleUpdateTaskStatus(task.id, nextStatus);
                            }}
                          >
                            Move →
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}

                {/* Empty state */}
                {(!tasksByStatus[column.id] || tasksByStatus[column.id].length === 0) && (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-sm">No tasks</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Create Task Modal */}
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false);
            reset();
          }}
          title="Create New Task"
          size="lg"
        >
          <form onSubmit={handleSubmit(handleCreateTask)} className="space-y-6">
            <Input
              label="Task Title"
              placeholder="Enter task title"
              error={errors.title?.message}
              {...register('title', { required: 'Task title is required' })}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                rows={3}
                placeholder="Enter task description"
                {...register('description', { required: 'Description is required' })}
              />
              {errors.description && (
                <p className="text-sm text-red-600 mt-1">{errors.description.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Project ID"
                placeholder="Enter project ID"
                error={errors.project_id?.message}
                {...register('project_id', { required: 'Project ID is required' })}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  {...register('priority', { required: 'Priority is required' })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Estimated Hours (Optional)"
                type="number"
                placeholder="0"
                {...register('estimated_hours', { valueAsNumber: true })}
              />

              <Input
                label="Due Date (Optional)"
                type="date"
                {...register('due_date')}
              />
            </div>

            <Input
              label="Assigned To (Optional)"
              placeholder="Enter user ID"
              {...register('assigned_to')}
            />

            <div className="flex justify-end space-x-3 pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsCreateModalOpen(false);
                  reset();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={isSubmitting}
              >
                Create Task
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </DashboardLayout>
  );
};

export default TasksPage;