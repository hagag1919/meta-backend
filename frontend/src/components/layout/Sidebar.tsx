import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  LayoutDashboard,
  FolderOpen,
  CheckSquare,
  Users,
  Building2,
  Clock,
  FileText,
  BarChart3,
  Upload,
  MessageSquare,
  MessageCircle,
  Settings
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MenuItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  roles?: string[];
  children?: MenuItem[];
}

const menuItems: MenuItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard
  },
  {
    name: 'Projects',
    href: '/projects',
    icon: FolderOpen
  },
  {
    name: 'Tasks',
    href: '/tasks',
    icon: CheckSquare
  },
  {
    name: 'Users',
    href: '/users',
    icon: Users,
    roles: ['administrator']
  },
  {
    name: 'Clients',
    href: '/clients',
    icon: Building2
  },
  {
    name: 'Time Tracking',
    href: '/time',
    icon: Clock
  },
  {
    name: 'Invoices',
    href: '/invoices',
    icon: FileText,
    roles: ['administrator', 'developer']
  },
  {
    name: 'Reports',
    href: '/reports',
    icon: BarChart3,
    roles: ['administrator', 'developer']
  },
  {
    name: 'Files',
    href: '/files',
    icon: Upload
  },
  {
    name: 'Comments',
    href: '/comments',
    icon: MessageSquare
  },
  {
    name: 'Chat',
    href: '/chat',
    icon: MessageCircle
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings
  }
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { state } = useAuth();
  const location = useLocation();

  const canAccess = (item: MenuItem) => {
    if (!item.roles || item.roles.length === 0) return true;
    return state.user?.role && item.roles.includes(state.user.role);
  };

  const MenuItem: React.FC<{ item: MenuItem; level?: number }> = ({ item, level = 0 }) => {
    const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
    const Icon = item.icon;

    if (!canAccess(item)) return null;

    return (
      <li>
        <Link
          to={item.href}
          onClick={onClose}
          className={`
            flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200
            ${isActive 
              ? 'bg-primary-100 text-primary-700 border-r-2 border-primary-700' 
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }
            ${level > 0 ? 'ml-4' : ''}
          `}
        >
          <Icon className={`h-5 w-5 mr-3 ${isActive ? 'text-primary-700' : 'text-gray-400'}`} />
          {item.name}
        </Link>
      </li>
    );
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black bg-opacity-50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-30 h-full w-64 bg-white border-r border-gray-200 transition-transform duration-300 lg:translate-x-0 lg:static lg:inset-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center h-16 px-6 border-b border-gray-200">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">M</span>
              </div>
              <span className="ml-2 text-xl font-bold text-gray-900">Meta</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            <ul className="space-y-1">
              {menuItems.map((item) => (
                <MenuItem key={item.name} item={item} />
              ))}
            </ul>
          </nav>

          {/* User info */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center">
              <div className="h-10 w-10 bg-primary-600 rounded-full flex items-center justify-center">
                <span className="text-white font-medium text-sm">
                  {state.user?.first_name?.[0]}{state.user?.last_name?.[0]}
                </span>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">
                  {state.user?.first_name} {state.user?.last_name}
                </p>
                <p className="text-xs text-gray-500 capitalize">{state.user?.role}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;