import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../../components/ui';
import { DashboardLayout } from '../../components/layout';
import { 
  BarChart3, 
  CheckSquare, 
  Clock, 
  DollarSign, 
  FolderOpen, 
  TrendingUp,
  Users
} from 'lucide-react';
import apiService from '../../services/api';
import { DashboardStats } from '../../types';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<any>;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, trend, color }) => {
  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-center">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {trend && (
            <div className={`flex items-center mt-1 ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
              <TrendingUp className={`h-4 w-4 mr-1 ${trend.isPositive ? '' : 'rotate-180'}`} />
              <span className="text-sm font-medium">{Math.abs(trend.value)}%</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </Card>
  );
};

const DashboardPage: React.FC = () => {
  const { state } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        const response = await apiService.getDashboardStats();
        setStats(response);
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
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

  if (error) {
    return (
      <DashboardLayout>
        <Card>
          <div className="text-center py-8">
            <p className="text-red-600">Error loading dashboard: {error}</p>
          </div>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Welcome section */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {getGreeting()}, {state.user?.first_name}!
          </h1>
          <p className="text-gray-600">
            Here's what's happening with your projects today.
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Projects"
            value={stats?.total_projects || 0}
            icon={FolderOpen}
            color="bg-blue-500"
            trend={{ value: 12, isPositive: true }}
          />
          <StatCard
            title="Active Projects"
            value={stats?.active_projects || 0}
            icon={BarChart3}
            color="bg-green-500"
            trend={{ value: 8, isPositive: true }}
          />
          <StatCard
            title="Completed Tasks"
            value={stats?.completed_tasks || 0}
            icon={CheckSquare}
            color="bg-purple-500"
            trend={{ value: 15, isPositive: true }}
          />
          <StatCard
            title="Total Hours"
            value={stats?.total_hours || 0}
            icon={Clock}
            color="bg-orange-500"
            trend={{ value: 5, isPositive: false }}
          />
        </div>

        {/* Additional stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="Overdue Tasks"
            value={stats?.overdue_tasks || 0}
            icon={CheckSquare}
            color="bg-red-500"
          />
          <StatCard
            title="Revenue"
            value={`$${stats?.total_revenue?.toLocaleString() || 0}`}
            icon={DollarSign}
            color="bg-green-600"
          />
          <StatCard
            title="Pending Invoices"
            value={stats?.pending_invoices || 0}
            icon={Users}
            color="bg-yellow-500"
          />
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent activity placeholder */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <FolderOpen className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">New project created</p>
                  <p className="text-xs text-gray-500">2 hours ago</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckSquare className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Task completed</p>
                  <p className="text-xs text-gray-500">4 hours ago</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 bg-purple-100 rounded-full flex items-center justify-center">
                  <Users className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">New team member added</p>
                  <p className="text-xs text-gray-500">1 day ago</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Quick actions */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <FolderOpen className="h-6 w-6 text-blue-600 mb-2" />
                <p className="text-sm font-medium text-gray-900">New Project</p>
              </button>
              <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <CheckSquare className="h-6 w-6 text-green-600 mb-2" />
                <p className="text-sm font-medium text-gray-900">New Task</p>
              </button>
              <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <Clock className="h-6 w-6 text-orange-600 mb-2" />
                <p className="text-sm font-medium text-gray-900">Log Time</p>
              </button>
              <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <DollarSign className="h-6 w-6 text-green-600 mb-2" />
                <p className="text-sm font-medium text-gray-900">New Invoice</p>
              </button>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;