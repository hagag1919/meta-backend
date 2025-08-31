import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Auth pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// Dashboard pages
import DashboardPage from './pages/dashboard/DashboardPage';

// Project pages
import ProjectsPage from './pages/projects/ProjectsPage';

// Task pages
import TasksPage from './pages/tasks/TasksPage';

// User pages
import UsersPage from './pages/users/UsersPage';

// Placeholder components for other pages

const ClientsPage = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold">Clients</h1>
    <p>Client management coming soon...</p>
  </div>
);

const TimePage = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold">Time Tracking</h1>
    <p>Time tracking coming soon...</p>
  </div>
);

const InvoicesPage = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold">Invoices</h1>
    <p>Invoice management coming soon...</p>
  </div>
);

const ReportsPage = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold">Reports</h1>
    <p>Reports coming soon...</p>
  </div>
);

const FilesPage = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold">Files</h1>
    <p>File management coming soon...</p>
  </div>
);

const CommentsPage = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold">Comments</h1>
    <p>Comments system coming soon...</p>
  </div>
);

const ChatPage = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold">Chat</h1>
    <p>Chat system coming soon...</p>
  </div>
);

const SettingsPage = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold">Settings</h1>
    <p>Settings coming soon...</p>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            
            {/* Protected routes */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            } />
            
            <Route path="/projects" element={
              <ProtectedRoute>
                <ProjectsPage />
              </ProtectedRoute>
            } />
            
            <Route path="/tasks" element={
              <ProtectedRoute>
                <TasksPage />
              </ProtectedRoute>
            } />
            
            <Route path="/users" element={
              <ProtectedRoute roles={['administrator']}>
                <UsersPage />
              </ProtectedRoute>
            } />
            
            <Route path="/clients" element={
              <ProtectedRoute>
                <ClientsPage />
              </ProtectedRoute>
            } />
            
            <Route path="/time" element={
              <ProtectedRoute>
                <TimePage />
              </ProtectedRoute>
            } />
            
            <Route path="/invoices" element={
              <ProtectedRoute roles={['administrator', 'developer']}>
                <InvoicesPage />
              </ProtectedRoute>
            } />
            
            <Route path="/reports" element={
              <ProtectedRoute roles={['administrator', 'developer']}>
                <ReportsPage />
              </ProtectedRoute>
            } />
            
            <Route path="/files" element={
              <ProtectedRoute>
                <FilesPage />
              </ProtectedRoute>
            } />
            
            <Route path="/comments" element={
              <ProtectedRoute>
                <CommentsPage />
              </ProtectedRoute>
            } />
            
            <Route path="/chat" element={
              <ProtectedRoute>
                <ChatPage />
              </ProtectedRoute>
            } />
            
            <Route path="/settings" element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            } />
            
            {/* Redirect root to dashboard */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            
            {/* 404 fallback */}
            <Route path="*" element={
              <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                  <h1 className="text-4xl font-bold text-gray-900">404</h1>
                  <p className="text-gray-600">Page not found</p>
                </div>
              </div>
            } />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
