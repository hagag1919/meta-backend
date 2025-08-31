import axios, { AxiosInstance } from 'axios';
import { AuthState } from '../types';

class ApiService {
  private api: AxiosInstance;
  
  constructor() {
    this.api = axios.create({
      baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3001/api',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor to add auth token
    this.api.interceptors.request.use(
      (config) => {
        const authState = this.getAuthFromStorage();
        if (authState?.token) {
          config.headers.Authorization = `Bearer ${authState.token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle auth errors
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const authState = this.getAuthFromStorage();
            if (authState?.refreshToken) {
              const response = await this.refreshToken(authState.refreshToken);
              this.saveAuthToStorage({
                ...authState,
                token: response.token,
              });
              
              // Retry the original request with new token
              originalRequest.headers.Authorization = `Bearer ${response.token}`;
              return this.api(originalRequest);
            }
          } catch (refreshError) {
            // Refresh failed, clear auth and redirect to login
            this.clearAuthFromStorage();
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private getAuthFromStorage(): AuthState | null {
    try {
      const authData = localStorage.getItem('meta_auth');
      return authData ? JSON.parse(authData) : null;
    } catch {
      return null;
    }
  }

  private saveAuthToStorage(authState: AuthState) {
    localStorage.setItem('meta_auth', JSON.stringify(authState));
  }

  private clearAuthFromStorage() {
    localStorage.removeItem('meta_auth');
  }

  // Auth methods
  async login(email: string, password: string) {
    const response = await this.api.post('/auth/login', { email, password });
    return response.data;
  }

  async register(userData: any) {
    const response = await this.api.post('/auth/register', userData);
    return response.data;
  }

  async refreshToken(refreshToken: string) {
    const response = await this.api.post('/auth/refresh-token', { refreshToken });
    return response.data;
  }

  async logout() {
    try {
      await this.api.post('/auth/logout');
    } finally {
      this.clearAuthFromStorage();
    }
  }

  async forgotPassword(email: string) {
    const response = await this.api.post('/auth/forgot-password', { email });
    return response.data;
  }

  async resetPassword(token: string, password: string) {
    const response = await this.api.post('/auth/reset-password', { token, password });
    return response.data;
  }

  async changePassword(currentPassword: string, newPassword: string) {
    const response = await this.api.post('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return response.data;
  }

  // Dashboard methods
  async getDashboardStats() {
    const response = await this.api.get('/dashboard/overview');
    return response.data;
  }

  async getDashboardActivity() {
    const response = await this.api.get('/dashboard/activity');
    return response.data;
  }

  async getProjectProgress() {
    const response = await this.api.get('/dashboard/projects/progress');
    return response.data;
  }

  async getTasksSummary() {
    const response = await this.api.get('/dashboard/tasks/summary');
    return response.data;
  }

  // Projects methods
  async getProjects(params?: any) {
    const response = await this.api.get('/projects', { params });
    return response.data;
  }

  async getProject(id: string) {
    const response = await this.api.get(`/projects/${id}`);
    return response.data;
  }

  async createProject(projectData: any) {
    const response = await this.api.post('/projects', projectData);
    return response.data;
  }

  async updateProject(id: string, projectData: any) {
    const response = await this.api.put(`/projects/${id}`, projectData);
    return response.data;
  }

  async deleteProject(id: string) {
    const response = await this.api.delete(`/projects/${id}`);
    return response.data;
  }

  async getProjectMembers(id: string) {
    const response = await this.api.get(`/projects/${id}/members`);
    return response.data;
  }

  async addProjectMember(projectId: string, userId: string) {
    const response = await this.api.post(`/projects/${projectId}/members`, { user_id: userId });
    return response.data;
  }

  async removeProjectMember(projectId: string, userId: string) {
    const response = await this.api.delete(`/projects/${projectId}/members/${userId}`);
    return response.data;
  }

  // Tasks methods
  async getTasks(params?: any) {
    const response = await this.api.get('/tasks', { params });
    return response.data;
  }

  async getTask(id: string) {
    const response = await this.api.get(`/tasks/${id}`);
    return response.data;
  }

  async createTask(taskData: any) {
    const response = await this.api.post('/tasks', taskData);
    return response.data;
  }

  async updateTask(id: string, taskData: any) {
    const response = await this.api.put(`/tasks/${id}`, taskData);
    return response.data;
  }

  async deleteTask(id: string) {
    const response = await this.api.delete(`/tasks/${id}`);
    return response.data;
  }

  // Users methods
  async getUsers(params?: any) {
    const response = await this.api.get('/users', { params });
    return response.data;
  }

  async getUser(id: string) {
    const response = await this.api.get(`/users/${id}`);
    return response.data;
  }

  async updateUser(id: string, userData: any) {
    const response = await this.api.put(`/users/${id}`, userData);
    return response.data;
  }

  async deleteUser(id: string) {
    const response = await this.api.delete(`/users/${id}`);
    return response.data;
  }

  // Clients methods
  async getClients(params?: any) {
    const response = await this.api.get('/clients', { params });
    return response.data;
  }

  async getClient(id: string) {
    const response = await this.api.get(`/clients/${id}`);
    return response.data;
  }

  async createClient(clientData: any) {
    const response = await this.api.post('/clients', clientData);
    return response.data;
  }

  async updateClient(id: string, clientData: any) {
    const response = await this.api.put(`/clients/${id}`, clientData);
    return response.data;
  }

  async deleteClient(id: string) {
    const response = await this.api.delete(`/clients/${id}`);
    return response.data;
  }

  // Time tracking methods
  async getTimeEntries(params?: any) {
    const response = await this.api.get('/time', { params });
    return response.data;
  }

  async createTimeEntry(entryData: any) {
    const response = await this.api.post('/time', entryData);
    return response.data;
  }

  async updateTimeEntry(id: string, entryData: any) {
    const response = await this.api.put(`/time/${id}`, entryData);
    return response.data;
  }

  async deleteTimeEntry(id: string) {
    const response = await this.api.delete(`/time/${id}`);
    return response.data;
  }

  async getTimeStats() {
    const response = await this.api.get('/time/stats/summary');
    return response.data;
  }

  // File methods
  async getFiles(params?: any) {
    const response = await this.api.get('/files', { params });
    return response.data;
  }

  async uploadFiles(files: FileList, projectId?: string, taskId?: string) {
    const formData = new FormData();
    Array.from(files).forEach(file => {
      formData.append('files', file);
    });
    
    if (projectId) formData.append('project_id', projectId);
    if (taskId) formData.append('task_id', taskId);

    const response = await this.api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async downloadFile(id: string) {
    const response = await this.api.get(`/files/${id}/download`, {
      responseType: 'blob',
    });
    return response;
  }

  async deleteFile(id: string) {
    const response = await this.api.delete(`/files/${id}`);
    return response.data;
  }

  // Invoice methods
  async getInvoices(params?: any) {
    const response = await this.api.get('/invoices', { params });
    return response.data;
  }

  async getInvoice(id: string) {
    const response = await this.api.get(`/invoices/${id}`);
    return response.data;
  }

  async createInvoice(invoiceData: any) {
    const response = await this.api.post('/invoices', invoiceData);
    return response.data;
  }

  async updateInvoice(id: string, invoiceData: any) {
    const response = await this.api.put(`/invoices/${id}`, invoiceData);
    return response.data;
  }

  async getInvoiceStats() {
    const response = await this.api.get('/invoices/stats/overview');
    return response.data;
  }

  // Comments methods
  async getComments(entityType: string, entityId: string) {
    const response = await this.api.get('/comments', {
      params: { entity_type: entityType, entity_id: entityId }
    });
    return response.data;
  }

  async createComment(commentData: any) {
    const response = await this.api.post('/comments', commentData);
    return response.data;
  }

  async updateComment(id: string, content: string) {
    const response = await this.api.put(`/comments/${id}`, { content });
    return response.data;
  }

  async deleteComment(id: string) {
    const response = await this.api.delete(`/comments/${id}`);
    return response.data;
  }

  // Reports methods
  async getProjectReports(params?: any) {
    const response = await this.api.get('/reports/projects', { params });
    return response.data;
  }

  async getTaskReports(params?: any) {
    const response = await this.api.get('/reports/tasks', { params });
    return response.data;
  }

  async getProductivityReports(params?: any) {
    const response = await this.api.get('/reports/productivity', { params });
    return response.data;
  }

  async getFinancialReports(params?: any) {
    const response = await this.api.get('/reports/financial', { params });
    return response.data;
  }

  // Chat methods
  async getConversations() {
    const response = await this.api.get('/chat/conversations');
    return response.data;
  }

  async getMessages(conversationId: string, params?: any) {
    const response = await this.api.get(`/chat/conversations/${conversationId}/messages`, { params });
    return response.data;
  }

  async sendMessage(conversationId: string, content: string) {
    const response = await this.api.post(`/chat/conversations/${conversationId}/messages`, { content });
    return response.data;
  }

  async createConversation(participantIds: string[], name?: string) {
    const response = await this.api.post('/chat/conversations', {
      participant_ids: participantIds,
      name
    });
    return response.data;
  }

  // Settings methods
  async getSettings() {
    const response = await this.api.get('/settings');
    return response.data;
  }

  async updateSettings(settings: any) {
    const response = await this.api.put('/settings', settings);
    return response.data;
  }

  // Notifications methods
  async getNotifications() {
    const response = await this.api.get('/dashboard/notifications');
    return response.data;
  }

  async markNotificationAsRead(id: string) {
    const response = await this.api.put(`/dashboard/notifications/${id}/read`);
    return response.data;
  }
}

export const apiService = new ApiService();
export default apiService;