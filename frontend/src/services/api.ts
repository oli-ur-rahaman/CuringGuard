import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Inject JWT token into every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authService = {
  login: async (username: string, password: string) => {
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);
    const response = await api.post('/auth/login', params);
    if (response.data.access_token) {
      localStorage.setItem('token', response.data.access_token);
    }
    return response.data;
  },
  logout: () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  },
  isAuthenticated: () => {
    return !!localStorage.getItem('token');
  },
  isSuperadmin: () => {
    const token = localStorage.getItem('token');
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.role === 'superadmin';
    } catch (e) {
      return false;
    }
  },
  getCurrentUser: () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
      return null;
    }
  }
};

export const curingService = {
  getElements: async () => {
    const response = await api.get('/curing/elements');
    return response.data;
  },
  logCuring: async (elementId: string, contractorId: number) => {
    const response = await api.post('/curing/log', { element_id: elementId, contractor_id: contractorId });
    return response.data;
  },
  uploadDrawing: async (formData: FormData) => {
    const response = await api.post('/hierarchy/drawings/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  }
};

export const hierarchyService = {
  getTenants: async () => {
    const response = await api.get('/hierarchy/tenants');
    return response.data;
  },
  getProjects: async (userId: number) => {
    const response = await api.get(`/hierarchy/monitors/${userId}/projects`);
    return response.data;
  },
  getPackages: async (projectId: number) => {
    const response = await api.get(`/hierarchy/projects/${projectId}/packages`);
    return response.data;
  },
  getStructures: async (packageId: number) => {
    const response = await api.get(`/hierarchy/packages/${packageId}/structures`);
    return response.data;
  },
  parseDrawing: async (drawingId: number) => {
    const response = await api.post(`/hierarchy/drawings/${drawingId}/parse`);
    return response.data;
  },
  createTenant: async (data: any) => {
    const response = await api.post('/hierarchy/tenants', data);
    return response.data;
  },
  createProject: async (data: any) => {
    const response = await api.post('/hierarchy/projects', data);
    return response.data;
  },
  createPackage: async (data: any) => {
    const response = await api.post('/hierarchy/packages', data);
    return response.data;
  },
  createStructure: async (data: any) => {
    const response = await api.post('/hierarchy/structures', data);
    return response.data;
  },
  assignContractor: async (structureId: number, contractorId: number) => {
    const response = await api.put(`/hierarchy/structures/${structureId}/assign?contractor_id=${contractorId}`);
    return response.data;
  },
  toggleTenantActive: async (id: number) => {
    const response = await api.post(`/hierarchy/tenants/${id}/toggle-active`);
    return response.data;
  },
  resetTenantPassword: async (id: number, newPass: string) => {
    const response = await api.post(`/hierarchy/tenants/${id}/reset-password`, null, { params: { new_password: newPass } });
    return response.data;
  },
  deleteTenant: async (id: number) => {
    const response = await api.delete(`/hierarchy/tenants/${id}`);
    return response.data;
  }
};

export const userService = {
  getUsers: async (tenantId?: number, role?: string) => {
    const response = await api.get('/users/', { params: { tenant_id: tenantId, role } });
    return response.data;
  },
  create_user: async (data: any) => {
    const response = await api.post('/users/', data);
    return response.data;
  },
  update_user: async (id: number, data: any) => {
    const response = await api.patch(`/users/${id}`, data);
    return response.data;
  },
  toggleUserActive: async (id: number) => {
    const response = await api.post(`/users/${id}/toggle-active`);
    return response.data;
  },
  resetUserPassword: async (id: number, newPass: string) => {
    const response = await api.post(`/users/${id}/reset-password`, null, { params: { new_password: newPass } });
    return response.data;
  },
  deleteUser: async (id: number) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
  },
  pingUser: async (userId: number, message: string) => {
    const response = await api.post(`/users/${userId}/ping`, null, { params: { message } });
    return response.data;
  }
};

export const libraryService = {
  getRules: async () => {
    const response = await api.get('/library/');
    return response.data;
  },
  createRule: async (data: any) => {
    const response = await api.post('/library/', data);
    return response.data;
  },
  updateRule: async (id: number, data: any) => {
    const response = await api.patch(`/library/${id}`, data);
    return response.data;
  },
  deleteRule: async (id: number) => {
    const response = await api.delete(`/library/${id}`);
    return response.data;
  }
};

export const gatewayService = {
  getGateways: async () => {
    const response = await api.get('/gateways/');
    return response.data;
  },
  createGateway: async (data: any) => {
    const response = await api.post('/gateways/', data);
    return response.data;
  },
  updateGateway: async (id: number, data: any) => {
    const response = await api.patch(`/gateways/${id}`, data);
    return response.data;
  },
  deleteGateway: async (id: number) => {
    const response = await api.delete(`/gateways/${id}`);
    return response.data;
  }
};

export default api;
