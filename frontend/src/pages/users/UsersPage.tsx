import React, { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '../../components/layout';
import { Card, Button, Modal, Input } from '../../components/ui';
import { useForm } from 'react-hook-form';
import { 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Mail,
  Phone,
  Calendar,
  Shield,
  Edit,
  Trash2,
  UserCheck,
  UserX
} from 'lucide-react';
import apiService from '../../services/api';
import { User } from '../../types';

interface UserFormData {
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role: 'administrator' | 'developer' | 'client';
  password: string;
}

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<UserFormData>();

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const params: any = {};
      if (searchTerm) params.search = searchTerm;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.status = statusFilter;
      
      const response = await apiService.getUsers(params);
      setUsers(response.users || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users');
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (data: UserFormData) => {
    try {
      const response = await apiService.register(data);
      setUsers([response.user, ...users]);
      setIsCreateModalOpen(false);
      reset();
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      await apiService.updateUser(userId, { is_active: !currentStatus });
      setUsers(users.map(user => 
        user.id === userId ? { ...user, is_active: !currentStatus } : user
      ));
    } catch (err: any) {
      setError(err.message || 'Failed to update user status');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await apiService.deleteUser(userId);
        setUsers(users.filter(user => user.id !== userId));
      } catch (err: any) {
        setError(err.message || 'Failed to delete user');
      }
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'administrator':
        return 'bg-red-100 text-red-800';
      case 'developer':
        return 'bg-blue-100 text-blue-800';
      case 'client':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleIcon = (role: string) => {
    return <Shield className="h-4 w-4" />;
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
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-600">Manage team members and their permissions</p>
          </div>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            icon={Plus}
            className="bg-primary-600 hover:bg-primary-700"
          >
            Add User
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
                  placeholder="Search users..."
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
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">All Roles</option>
                <option value="administrator">Administrator</option>
                <option value="developer">Developer</option>
                <option value="client">Client</option>
              </select>
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
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

        {/* Users table */}
        {users.length === 0 && !error ? (
          <Card>
            <div className="text-center py-12">
              <div className="mx-auto h-12 w-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                <Plus className="h-6 w-6 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No users found</h3>
              <p className="text-gray-500 mb-6">Get started by adding your first team member.</p>
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                icon={Plus}
              >
                Add User
              </Button>
            </div>
          </Card>
        ) : (
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Login
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 bg-primary-600 rounded-full flex items-center justify-center">
                            <span className="text-white font-medium text-sm">
                              {user.first_name[0]}{user.last_name[0]}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {user.first_name} {user.last_name}
                            </div>
                            <div className="text-sm text-gray-500 flex items-center">
                              <Mail className="h-3 w-3 mr-1" />
                              {user.email}
                            </div>
                            {user.phone && (
                              <div className="text-sm text-gray-500 flex items-center">
                                <Phone className="h-3 w-3 mr-1" />
                                {user.phone}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {getRoleIcon(user.role)}
                          <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}>
                            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.last_login ? (
                          <div className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {new Date(user.last_login).toLocaleDateString()}
                          </div>
                        ) : (
                          'Never'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Edit}
                            onClick={() => console.log('Edit user:', user.id)}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={user.is_active ? UserX : UserCheck}
                            onClick={() => handleToggleUserStatus(user.id, user.is_active)}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Trash2}
                            onClick={() => handleDeleteUser(user.id)}
                            className="text-red-600 hover:text-red-700"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={MoreHorizontal}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Create User Modal */}
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false);
            reset();
          }}
          title="Add New User"
          size="lg"
        >
          <form onSubmit={handleSubmit(handleCreateUser)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First Name"
                placeholder="First name"
                error={errors.first_name?.message}
                {...register('first_name', { required: 'First name is required' })}
              />

              <Input
                label="Last Name"
                placeholder="Last name"
                error={errors.last_name?.message}
                {...register('last_name', { required: 'Last name is required' })}
              />
            </div>

            <Input
              label="Email Address"
              type="email"
              placeholder="user@example.com"
              error={errors.email?.message}
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Invalid email address'
                }
              })}
            />

            <Input
              label="Phone (Optional)"
              type="tel"
              placeholder="Phone number"
              {...register('phone')}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <select
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                {...register('role', { required: 'Role is required' })}
              >
                <option value="">Select a role</option>
                <option value="administrator">Administrator</option>
                <option value="developer">Developer</option>
                <option value="client">Client</option>
              </select>
              {errors.role && (
                <p className="text-sm text-red-600 mt-1">{errors.role.message}</p>
              )}
            </div>

            <Input
              label="Password"
              type="password"
              placeholder="Create a password"
              error={errors.password?.message}
              {...register('password', {
                required: 'Password is required',
                minLength: {
                  value: 8,
                  message: 'Password must be at least 8 characters'
                }
              })}
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
                Create User
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </DashboardLayout>
  );
};

export default UsersPage;