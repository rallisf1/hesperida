import { config } from '$lib/server/config';
import { sendAppriseNotification as sendSharedAppriseNotification } from '../../../../../notifications/apprise';

export type AppriseNotifyInput = {
	targets: string[];
	title: string;
	body: string;
	format: 'text' | 'markdown' | 'html';
};

export const sendAppriseNotification = async (input: AppriseNotifyInput): Promise<void> => {
	await sendSharedAppriseNotification(
		{
			baseUrl: config.appriseUrl,
			apiKey: config.appriseApiKey
		},
		input
	);
};
