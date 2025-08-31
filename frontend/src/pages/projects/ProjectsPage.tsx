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
  DollarSign,
  Clock,
  Pencil,
  Eye
} from 'lucide-react';
import apiService from '../../services/api';
import { Project } from '../../types';

interface ProjectFormData {
  name: string;
  description: string;
  company_id: string;
  project_manager_id?: string;
  budget?: number;
  currency: string;
  start_date: string;
  end_date?: string;
  estimated_hours?: number;
  repository_url?: string;
}

const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<ProjectFormData>();

  const fetchProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      const params: any = {};
      if (searchTerm) params.search = searchTerm;
      if (statusFilter) params.status = statusFilter;
      
      const response = await apiService.getProjects(params);
      setProjects(response.projects || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch projects');
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreateProject = async (data: ProjectFormData) => {
    try {
      const response = await apiService.createProject(data);
      setProjects([response.project, ...projects]);
      setIsCreateModalOpen(false);
      reset();
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planning':
        return 'bg-yellow-100 text-yellow-800';
      case 'ongoing':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'stopped':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD'
    }).format(amount);
  };

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
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="text-gray-600">Manage your projects and track progress</p>
          </div>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            icon={Plus}
            className="bg-primary-600 hover:bg-primary-700"
          >
            New Project
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
                  placeholder="Search projects..."
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
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Status</option>
                <option value="planning">Planning</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="stopped">Stopped</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Error message */}
        {error && (
          <Card>
            <div className="text-center py-8">
              <p className="text-red-600">Error: {error}</p>
              <Button
                onClick={fetchProjects}
                variant="outline"
                className="mt-4"
              >
                Try Again
              </Button>
            </div>
          </Card>
        )}

        {/* Projects grid */}
        {projects.length === 0 && !error ? (
          <Card>
            <div className="text-center py-12">
              <div className="mx-auto h-12 w-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                <Plus className="h-6 w-6 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No projects found</h3>
              <p className="text-gray-500 mb-6">Get started by creating your first project.</p>
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                icon={Plus}
              >
                Create Project
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Card key={project.id} className="hover:shadow-lg transition-shadow duration-200">
                <div className="space-y-4">
                  {/* Project header */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {project.name}
                      </h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                        {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Button variant="ghost" size="sm" icon={Eye} />
                      <Button variant="ghost" size="sm" icon={Pencil} />
                      <Button variant="ghost" size="sm" icon={MoreHorizontal} />
                    </div>
                  </div>

                  {/* Project description */}
                  <p className="text-gray-600 text-sm line-clamp-2">
                    {project.description}
                  </p>

                  {/* Project stats */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <DollarSign className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-600">
                        {project.budget ? formatCurrency(project.budget, project.currency) : 'No budget'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-600">
                        {project.estimated_hours ? `${project.estimated_hours}h` : 'No estimate'}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>Progress</span>
                      <span>{project.progress_percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${project.progress_percentage}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Project dates */}
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-3 w-3" />
                      <span>Start: {new Date(project.start_date).toLocaleDateString()}</span>
                    </div>
                    {project.end_date && (
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3" />
                        <span>End: {new Date(project.end_date).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Create Project Modal */}
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false);
            reset();
          }}
          title="Create New Project"
          size="lg"
        >
          <form onSubmit={handleSubmit(handleCreateProject)} className="space-y-6">
            <Input
              label="Project Name"
              placeholder="Enter project name"
              error={errors.name?.message}
              {...register('name', { required: 'Project name is required' })}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                rows={3}
                placeholder="Enter project description"
                {...register('description', { required: 'Description is required' })}
              />
              {errors.description && (
                <p className="text-sm text-red-600 mt-1">{errors.description.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Start Date"
                type="date"
                error={errors.start_date?.message}
                {...register('start_date', { required: 'Start date is required' })}
              />

              <Input
                label="End Date (Optional)"
                type="date"
                {...register('end_date')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Budget (Optional)"
                type="number"
                placeholder="0"
                {...register('budget', { valueAsNumber: true })}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Currency
                </label>
                <select
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  {...register('currency')}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            </div>

            <Input
              label="Estimated Hours (Optional)"
              type="number"
              placeholder="0"
              {...register('estimated_hours', { valueAsNumber: true })}
            />

            <Input
              label="Repository URL (Optional)"
              type="url"
              placeholder="https://github.com/username/repo"
              {...register('repository_url')}
            />

            <Input
              label="Company ID"
              placeholder="Enter company ID"
              error={errors.company_id?.message}
              {...register('company_id', { required: 'Company ID is required' })}
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
                Create Project
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </DashboardLayout>
  );
};

export default ProjectsPage;