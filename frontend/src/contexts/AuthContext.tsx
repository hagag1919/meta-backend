import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { AuthState, LoginCredentials, RegisterData } from '../types';
import apiService from '../services/api';

interface AuthContextType {
  state: AuthState;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthAction {
  type: 'LOGIN_START' | 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'LOGOUT' | 'REGISTER_START' | 'REGISTER_SUCCESS' | 'REGISTER_FAILURE' | 'CLEAR_ERROR' | 'RESTORE_AUTH';
  payload?: any;
}

const initialState: AuthState = {
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_START':
    case 'REGISTER_START':
      return {
        ...state,
        isLoading: true,
      };

    case 'LOGIN_SUCCESS':
    case 'REGISTER_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        refreshToken: action.payload.refreshToken,
        isAuthenticated: true,
        isLoading: false,
      };

    case 'LOGIN_FAILURE':
    case 'REGISTER_FAILURE':
      return {
        ...state,
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
      };

    case 'LOGOUT':
      return {
        ...initialState,
      };

    case 'RESTORE_AUTH':
      return {
        ...state,
        ...action.payload,
        isLoading: false,
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
      };

    default:
      return state;
  }
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    // Restore auth state from localStorage on app start
    const restoreAuth = () => {
      try {
        const authData = localStorage.getItem('meta_auth');
        if (authData) {
          const parsedAuth = JSON.parse(authData);
          if (parsedAuth.token && parsedAuth.user) {
            dispatch({
              type: 'RESTORE_AUTH',
              payload: {
                user: parsedAuth.user,
                token: parsedAuth.token,
                refreshToken: parsedAuth.refreshToken,
                isAuthenticated: true,
              },
            });
          }
        }
      } catch (error) {
        console.error('Error restoring auth state:', error);
        localStorage.removeItem('meta_auth');
      }
    };

    restoreAuth();
  }, []);

  useEffect(() => {
    // Save auth state to localStorage whenever it changes
    if (state.isAuthenticated && state.user && state.token) {
      localStorage.setItem('meta_auth', JSON.stringify({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }));
    } else {
      localStorage.removeItem('meta_auth');
    }
  }, [state]);

  const login = async (credentials: LoginCredentials) => {
    dispatch({ type: 'LOGIN_START' });
    try {
      const response = await apiService.login(credentials.email, credentials.password);
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          user: response.user,
          token: response.token,
          refreshToken: response.refreshToken,
        },
      });
    } catch (error: any) {
      dispatch({ type: 'LOGIN_FAILURE' });
      throw new Error(error.response?.data?.error || 'Login failed');
    }
  };

  const register = async (data: RegisterData) => {
    dispatch({ type: 'REGISTER_START' });
    try {
      const response = await apiService.register(data);
      dispatch({
        type: 'REGISTER_SUCCESS',
        payload: {
          user: response.user,
          token: response.token,
          refreshToken: response.refreshToken,
        },
      });
    } catch (error: any) {
      dispatch({ type: 'REGISTER_FAILURE' });
      throw new Error(error.response?.data?.error || 'Registration failed');
    }
  };

  const logout = async () => {
    try {
      await apiService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      dispatch({ type: 'LOGOUT' });
    }
  };

  const forgotPassword = async (email: string) => {
    try {
      await apiService.forgotPassword(email);
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Password reset request failed');
    }
  };

  const resetPassword = async (token: string, password: string) => {
    try {
      await apiService.resetPassword(token, password);
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Password reset failed');
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      await apiService.changePassword(currentPassword, newPassword);
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Password change failed');
    }
  };

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  return (
    <AuthContext.Provider
      value={{
        state,
        login,
        register,
        logout,
        forgotPassword,
        resetPassword,
        changePassword,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;