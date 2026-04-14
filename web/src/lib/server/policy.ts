import type { AuthUser } from './auth';

export const isSuperuser = (user: Pick<AuthUser, 'is_superuser'>): boolean =>
	user.is_superuser === true;
export const isAdmin = (user: Pick<AuthUser, 'role'>): boolean => user.role === 'admin';
export const isEditor = (user: Pick<AuthUser, 'role'>): boolean => user.role === 'editor';
export const isViewer = (user: Pick<AuthUser, 'role'>): boolean => user.role === 'viewer';

export const canCreateWebsite = (user: Pick<AuthUser, 'role'>): boolean => !isViewer(user);
export const canCreateJob = (user: Pick<AuthUser, 'role'>): boolean => !isViewer(user);
export const canCancelQueueTask = (user: Pick<AuthUser, 'role'>): boolean => !isViewer(user);

export const canInviteToWebsite = (user: Pick<AuthUser, 'role' | 'is_superuser'>): boolean =>
	isSuperuser(user) || isAdmin(user) || isEditor(user);

type AppRole = NonNullable<AuthUser['role']>;
export const canManageInvitedRole = (
	inviter: Pick<AuthUser, 'role' | 'is_superuser'>,
	targetRole: AppRole
): boolean => {
	if (isSuperuser(inviter) || isAdmin(inviter)) return true;
	if (isEditor(inviter)) return targetRole === 'editor' || targetRole === 'viewer';
	return false;
};

export const canUninviteRole = (
	inviter: Pick<AuthUser, 'role' | 'is_superuser'>,
	targetRole: AppRole
): boolean => canManageInvitedRole(inviter, targetRole);
