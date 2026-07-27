import { api } from '../api/client';

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return api.post('/auth/change-password', { currentPassword, newPassword });
}

export function forgotPassword(email: string): Promise<{ ok: boolean }> {
  return api.post('/auth/forgot-password', { email });
}

export function resetPassword(token: string, newPassword: string): Promise<void> {
  return api.post('/auth/reset-password', { token, newPassword });
}
