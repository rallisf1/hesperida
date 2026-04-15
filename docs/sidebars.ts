import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';
import apiEndpointsSidebar from './docs/api/endpoints/sidebar';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      items: ['getting-started/installation', 'getting-started/first-scan'],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: ['concepts/architecture', 'concepts/data-model'],
    },
    {
      type: 'category',
      label: 'API',
      items: [
        'api/overview',
        'api/auth-acl',
        {
          type: 'category',
          label: 'Endpoint Map',
          link: { type: 'generated-index', slug: '/api/endpoints' },
          items: apiEndpointsSidebar as any,
        },
      ],
    },
    {
      type: 'category',
      label: 'Dashboard',
      items: ['dashboard/overview', 'dashboard/compare-diff'],
    },
    {
      type: 'category',
      label: 'Operations',
      items: ['operations/deployment', 'operations/troubleshooting'],
    },
    {
      type: 'category',
      label: 'Reference',
      items: ['reference/configuration', 'reference/tools', 'reference/glossary', 'reference/faq', 'reference/changelog'],
    },
    {
      type: 'category',
      label: 'Development',
      items: ['development/contributing', 'development/credits'],
    }
  ],
};

export default sidebars;
