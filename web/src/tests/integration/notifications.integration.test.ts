import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { adminOne, createWebsite, ensureSchema, resetData } from '../helpers/db';
import { createAndSigninUser, signinExistingUser } from '../helpers/fixtures';
import { ApiTestClient } from '../helpers/request';
import { normalizeRecordId } from '../helpers/ids';

setDefaultTimeout(30_000);

describe('API Notifications Integration', () => {
	beforeAll(async () => {
		await ensureSchema();
	});

	beforeEach(async () => {
		await resetData();
	});

	test('notification channels lifecycle and superuser filtering', async () => {
		const owner = await createAndSigninUser('Channel Owner', 'editor');
		const other = await createAndSigninUser('Other Owner', 'editor');
		const superEmail = `super_${crypto.randomUUID()}@example.test`;
		const superPass = 'pass12345';
		await adminOne(
			`CREATE users CONTENT {
				name: "Super User",
				email: $email,
				password: crypto::argon2::generate($password),
				role: 'admin',
				\`group\`: 'superuser',
				is_superuser: true
			};`,
			{ email: superEmail, password: superPass }
		);
		const superToken = await signinExistingUser(superEmail, superPass);

		const ownerClient = new ApiTestClient({ bearerToken: owner.token });
		const otherClient = new ApiTestClient({ bearerToken: other.token });
		const superClient = new ApiTestClient({ bearerToken: superToken });

		const create1 = await ownerClient.call({
			method: 'POST',
			path: '/api/v1/notification-channels',
			body: { name: 'Owner Channel', apprise_url: 'mailto://owner@example.test' }
		});
		expect(create1.response.status).toBe(201);
		const channelId = String(create1.json.data.channel.id);
		expect(channelId).toBeTruthy();

		const create2 = await otherClient.call({
			method: 'POST',
			path: '/api/v1/notification-channels',
			body: { name: 'Other Channel', apprise_url: 'mailto://other@example.test' }
		});
		expect(create2.response.status).toBe(201);

		const ownerList = await ownerClient.call({ method: 'GET', path: '/api/v1/notification-channels' });
		expect(ownerList.response.status).toBe(200);
		expect(ownerList.json.data.channels).toHaveLength(1);

		const ownerFilterForbidden = await ownerClient.call({
			method: 'GET',
			path: `/api/v1/notification-channels?user=${encodeURIComponent(other.userId)}`
		});
		expect(ownerFilterForbidden.response.status).toBe(403);

		const superFiltered = await superClient.call({
			method: 'GET',
			path: `/api/v1/notification-channels?user=${encodeURIComponent(owner.userId)}`
		});
		expect(superFiltered.response.status).toBe(200);
		expect(superFiltered.json.data.channels).toHaveLength(1);
		expect(normalizeRecordId(superFiltered.json.data.channels[0].user)).toBe(owner.userId);

		const testOk = await ownerClient.call({
			method: 'POST',
			path: `/api/v1/notification-channels/${encodeURIComponent(channelId)}/test`
		});
		expect(testOk.response.status).toBe(200);

		const updateFailTarget = await ownerClient.call({
			method: 'PATCH',
			path: `/api/v1/notification-channels/${encodeURIComponent(channelId)}`,
			body: { apprise_url: 'mock://fail/updated' }
		});
		expect(updateFailTarget.response.status).toBe(200);

		const testFail = await ownerClient.call({
			method: 'POST',
			path: `/api/v1/notification-channels/${encodeURIComponent(channelId)}/test`
		});
		expect(testFail.response.status).toBe(502);
		expect(testFail.json.error.code).toBe('notification_test_failed');
	});

	test('website notification links enforce channel ownership and website access', async () => {
		const owner = await createAndSigninUser('Website Owner', 'editor');
		const member = await createAndSigninUser('Website Member', 'viewer');
		const outsider = await createAndSigninUser('Website Outsider', 'editor');
		const superEmail = `super2_${crypto.randomUUID()}@example.test`;
		const superPass = 'pass12345';
		await adminOne(
			`CREATE users CONTENT {
				name: "Super User 2",
				email: $email,
				password: crypto::argon2::generate($password),
				role: 'admin',
				\`group\`: 'superuser',
				is_superuser: true
			};`,
			{ email: superEmail, password: superPass }
		);
		const superToken = await signinExistingUser(superEmail, superPass);

		const website = await createWebsite({
			user: owner.userId,
			url: 'https://notify.example.test',
			description: 'notify'
		});
		expect(website?.id).toBeTruthy();

		await adminOne('UPDATE websites SET users = array::distinct(array::append(users ?? [], $member)) WHERE id = $id;', {
			id: website!.id,
			member: `users:${member.userId}`
		});

		const ownerClient = new ApiTestClient({ bearerToken: owner.token });
		const memberClient = new ApiTestClient({ bearerToken: member.token });
		const outsiderClient = new ApiTestClient({ bearerToken: outsider.token });
		const superClient = new ApiTestClient({ bearerToken: superToken });

		const ownerChannelRes = await ownerClient.call({
			method: 'POST',
			path: '/api/v1/notification-channels',
			body: { name: 'Owner Link Channel', apprise_url: 'mailto://owner-channel@example.test' }
		});
		expect(ownerChannelRes.response.status).toBe(201);
		const ownerChannelId = String(ownerChannelRes.json.data.channel.id);

		const memberChannelRes = await memberClient.call({
			method: 'POST',
			path: '/api/v1/notification-channels',
			body: { name: 'Member Link Channel', apprise_url: 'mailto://member-channel@example.test' }
		});
		expect(memberChannelRes.response.status).toBe(201);
		const memberChannelId = String(memberChannelRes.json.data.channel.id);

		const outsiderLink = await outsiderClient.call({
			method: 'POST',
			path: '/api/v1/website-notifications',
			body: {
				website: normalizeRecordId(website!.id),
				notification_channel: normalizeRecordId(ownerChannelId),
				events: { JOB_FAILED: true }
			}
		});
		expect(outsiderLink.response.status).toBe(404);

		const memberOwnChannelLink = await memberClient.call({
			method: 'POST',
			path: '/api/v1/website-notifications',
			body: {
				website: normalizeRecordId(website!.id),
				notification_channel: normalizeRecordId(memberChannelId),
				events: { JOB_FAILED: true, SEO_SCORE_BELOW: 70 }
			}
		});
		expect(memberOwnChannelLink.response.status).toBe(201);

		const memberOwnerChannelForbidden = await memberClient.call({
			method: 'POST',
			path: '/api/v1/website-notifications',
			body: {
				website: normalizeRecordId(website!.id),
				notification_channel: normalizeRecordId(ownerChannelId),
				events: { JOB_FAILED: true }
			}
		});
		expect(memberOwnerChannelForbidden.response.status).toBe(403);

		const superCrossOwnerLink = await superClient.call({
			method: 'POST',
			path: '/api/v1/website-notifications',
			body: {
				website: normalizeRecordId(website!.id),
				notification_channel: normalizeRecordId(ownerChannelId),
				events: { JOB_COMPLETED: true }
			}
		});
		expect(superCrossOwnerLink.response.status).toBe(201);
	});
});
