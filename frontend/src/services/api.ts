import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

const parseStoredToken = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp <= now) {
      localStorage.removeItem('token');
      return null;
    }
    return { token, payload };
  } catch {
    localStorage.removeItem('token');
    return null;
  }
};

// Inject JWT token into every request
api.interceptors.request.use((config) => {
  const auth = parseStoredToken();
  if (auth) {
    config.headers.Authorization = `Bearer ${auth.token}`;
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
    return !!parseStoredToken();
  },
  isSuperadmin: () => {
    const auth = parseStoredToken();
    return auth?.payload.role === 'superadmin';
  },
  getCurrentUser: () => {
    return parseStoredToken()?.payload ?? null;
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
  },
  uploadManagedDrawing: async (formData: FormData) => {
    const response = await api.post('/hierarchy/drawings/upload-managed', formData, {
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
  getDrawings: async (structureId: number) => {
    const response = await api.get(`/hierarchy/structures/${structureId}/drawings`);
    return response.data;
  },
  getDrawingPages: async (drawingId: number) => {
    const response = await api.get(`/hierarchy/drawings/${drawingId}/pages`);
    return response.data;
  },
  getDrawingFile: async (drawingId: number) => {
    const response = await api.get(`/hierarchy/drawings/${drawingId}/file`, {
      responseType: 'blob',
    });
    return response.data as Blob;
  },
  getDrawingAnnotations: async (drawingId: number, pageId: string) => {
    const response = await api.get(`/hierarchy/drawings/${drawingId}/annotations`, {
      params: { page_id: pageId },
    });
    return response.data;
  },
  deleteDrawingAnnotations: async (drawingId: number, pageId: string, elementIds: string[]) => {
    const response = await api.delete(`/hierarchy/drawings/${drawingId}/annotations`, {
      params: { page_id: pageId, element_ids: JSON.stringify(elementIds) },
    });
    return response.data;
  },
  saveDrawingAnnotations: async (drawingId: number, pageId: string, annotations: any[]) => {
    const formData = new FormData();
    formData.append('page_id', pageId);
    formData.append('annotations', JSON.stringify(annotations));
    const response = await api.post(`/hierarchy/drawings/${drawingId}/annotations`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },
  updateDrawingAnnotation: async (drawingId: number, pageId: string, elementId: string, data: {
    memberName?: string;
    color?: string;
    elementType?: string;
    curingStartDate?: string;
    isHidden?: boolean;
  }) => {
    const formData = new FormData();
    formData.append('page_id', pageId);
    if (data.memberName !== undefined) formData.append('member_name', data.memberName);
    if (data.color !== undefined) formData.append('color', data.color);
    if (data.elementType !== undefined) formData.append('element_type', data.elementType);
    if (data.curingStartDate !== undefined) formData.append('curing_start_date', data.curingStartDate);
    if (data.isHidden !== undefined) formData.append('is_hidden', String(data.isHidden));
    const response = await api.patch(`/hierarchy/drawings/${drawingId}/annotations/${elementId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },
  createBlankDrawingPage: async (drawingId: number, name: string) => {
    const formData = new FormData();
    formData.append('name', name);
    const response = await api.post(`/hierarchy/drawings/${drawingId}/pages/blank`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },
  deleteDrawingPage: async (drawingId: number, pageId: string) => {
    const response = await api.delete(`/hierarchy/drawings/${drawingId}/pages/${encodeURIComponent(pageId)}`);
    return response.data;
  },
  createPageCalibration: async (drawingId: number, pageId: string, data: {
    value: number;
    unit: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }) => {
    const formData = new FormData();
    formData.append('value', String(data.value));
    formData.append('unit', data.unit);
    formData.append('x1', String(data.x1));
    formData.append('y1', String(data.y1));
    formData.append('x2', String(data.x2));
    formData.append('y2', String(data.y2));
    const response = await api.post(`/hierarchy/drawings/${drawingId}/pages/${encodeURIComponent(pageId)}/calibrations`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },
  getDrawingCanvasData: async (drawingId: number, pageId?: string) => {
    const response = await api.get(`/hierarchy/drawings/${drawingId}/canvas-data`, {
      params: pageId ? { page_id: pageId } : undefined,
    });
    return response.data;
  },
  parseDrawing: async (drawingId: number) => {
    const response = await api.post(`/hierarchy/drawings/${drawingId}/parse`);
    return response.data;
  },
  deleteDrawing: async (drawingId: number) => {
    const response = await api.delete(`/hierarchy/drawings/${drawingId}`);
    return response.data;
  },
  updateDrawing: async (drawingId: number, data: any) => {
    const response = await api.patch(`/hierarchy/drawings/${drawingId}`, data);
    return response.data;
  },
  createBlankDrawing: async (structureId: number, name: string) => {
    const formData = new FormData();
    formData.append('name', name);
    const response = await api.post(`/hierarchy/structures/${structureId}/drawings/blank`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },
  uploadManagedDrawing: async (formData: FormData) => {
    const response = await api.post('/hierarchy/drawings/upload-managed', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
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
  updateProject: async (projectId: number, data: any) => {
    const response = await api.patch(`/hierarchy/projects/${projectId}`, data);
    return response.data;
  },
  deleteProject: async (projectId: number) => {
    const response = await api.delete(`/hierarchy/projects/${projectId}`);
    return response.data;
  },
  createPackage: async (data: any) => {
    const response = await api.post('/hierarchy/packages', data);
    return response.data;
  },
  updatePackage: async (packageId: number, data: any) => {
    const response = await api.patch(`/hierarchy/packages/${packageId}`, data);
    return response.data;
  },
  deletePackage: async (packageId: number) => {
    const response = await api.delete(`/hierarchy/packages/${packageId}`);
    return response.data;
  },
  createStructure: async (data: any) => {
    const response = await api.post('/hierarchy/structures', data);
    return response.data;
  },
  updateStructure: async (structureId: number, data: any) => {
    const response = await api.patch(`/hierarchy/structures/${structureId}`, data);
    return response.data;
  },
  deleteStructure: async (structureId: number) => {
    const response = await api.delete(`/hierarchy/structures/${structureId}`);
    return response.data;
  },
  assignContractor: async (structureId: number, contractorId?: number | null) => {
    const response = await api.put(`/hierarchy/structures/${structureId}/assign`, null, {
      params: { contractor_id: contractorId ?? null },
    });
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
  getMe: async () => {
    const response = await api.get('/users/me');
    return response.data;
  },
  checkEmail: async (email: string, excludeUserId?: number) => {
    const response = await api.get('/users/check-email', { params: { email, exclude_user_id: excludeUserId } });
    return response.data as { exists: boolean };
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

export const progressService = {
  getRows: async () => {
    const response = await api.get('/progress/rows');
    return response.data;
  },
  createEntry: async (formData: FormData) => {
    const response = await api.post('/progress/entries', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

export const systemService = {
  getSettings: async () => {
    const response = await api.get('/system/settings');
    return response.data as {
      manual_file_entry_enabled: boolean;
      server_time_offset_hours: number;
      sms_api_key: string;
      sms_sender_id: string;
      automatic_message_format: string;
      server_now_utc: string;
      updated_at?: string | null;
    };
  },
  updateSettings: async (data: {
    manual_file_entry_enabled?: boolean;
    server_time_offset_hours?: number;
    sms_api_key?: string;
    sms_sender_id?: string;
    automatic_message_format?: string;
  }) => {
    const response = await api.patch('/system/settings', data);
    return response.data as {
      manual_file_entry_enabled: boolean;
      server_time_offset_hours: number;
      sms_api_key: string;
      sms_sender_id: string;
      automatic_message_format: string;
      server_now_utc: string;
      updated_at?: string | null;
    };
  },
};

export const notificationService = {
  getWebNotifications: async (unreadOnly = false) => {
    const response = await api.get('/notifications/web', { params: { unread_only: unreadOnly } });
    return response.data;
  },
  markWebNotificationRead: async (notificationId: number) => {
    const response = await api.post(`/notifications/web/${notificationId}/read`);
    return response.data;
  },
  sendCustomMessage: async (data: { contractor_id: number; message: string; structure_id?: number }) => {
    const response = await api.post('/notifications/custom-message', data);
    return response.data;
  },
  getStructureSettings: async () => {
    const response = await api.get('/notifications/structure-settings');
    return response.data;
  },
  updateStructureSettings: async (structureId: number, data: { notification_time?: string; auto_sms_enabled?: boolean; auto_web_enabled?: boolean }) => {
    const response = await api.patch(`/notifications/structures/${structureId}/settings`, data);
    return response.data;
  },
};

export default api;
