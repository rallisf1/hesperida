import type { LayoutLoad } from './$types';
import { localeStore } from '$lib/stores';

export const load: LayoutLoad = async ({ data }) => {
    localeStore.set(data.locale);
    return {
        ...data
    };
};
