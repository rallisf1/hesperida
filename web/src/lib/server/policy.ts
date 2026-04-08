import type { AuthUser } from './auth';

export const isAdmin = (user: Pick<AuthUser, 'role'>): boolean => user.role === 'admin';
export const isEditor = (user: Pick<AuthUser, 'role'>): boolean => user.role === 'editor';
export const isViewer = (user: Pick<AuthUser, 'role'>): boolean => user.role === 'viewer';

export const canCreateWebsite = (user: Pick<AuthUser, 'role'>): boolean => !isViewer(user);
export const canCreateJob = (user: Pick<AuthUser, 'role'>): boolean => !isViewer(user);
export const canCancelQueueTask = (user: Pick<AuthUser, 'role'>): boolean => !isViewer(user);
export const canInviteToWebsite = (user: Pick<AuthUser, 'role'>): boolean => isAdmin(user) || isEditor(user);

