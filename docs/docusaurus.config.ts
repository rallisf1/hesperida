import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import type * as OpenApiPlugin from 'docusaurus-plugin-openapi-docs';

const config: Config = {
  title: 'Hesperida',
  tagline: 'Self-hosted web scanning documentation',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://rallisf1.github.io',
  baseUrl: '/hesperida/',
  organizationName: 'rallisf1',
  projectName: 'hesperida',

  onBrokenLinks: 'throw',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
          docItemComponent: '@theme/ApiItem',
          editUrl:
            'https://github.com/rallisf1/hesperida/blob/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],
  plugins: [
    [
      'docusaurus-plugin-openapi-docs',
      {
        id: 'openapi',
        docsPluginId: 'classic',
        config: {
          endpoints: {
            specPath: 'openapi/openapi.json',
            outputDir: 'docs/api/endpoints',
            sidebarOptions: {
              groupPathsBy: 'tag',
              categoryLinkSource: 'auto',
            },
            showSchemas: true,
          } satisfies OpenApiPlugin.Options,
        },
      },
    ],
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        indexDocs: true,
        indexBlog: false,
        indexPages: false,
        docsRouteBasePath: '/',
        language: ['en']
      },
    ],
  ],
  themes: ['docusaurus-theme-openapi-docs'],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Hesperida',
      logo: {
        alt: 'Hesperida Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          type: 'search',
          position: 'right',
        },
        {
          href: 'https://github.com/rallisf1/hesperida',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Introduction',
              to: '/',
            },
            {
              label: 'Architecture',
              to: '/concepts/architecture',
            },
            {
              label: 'API',
              to: '/api/overview',
            }
          ],
        },
        {
          title: 'Project',
          items: [
            {
              label: 'Repository',
              href: 'https://github.com/rallisf1/hesperida',
            },
            {
              label: 'Issues',
              href: 'https://github.com/rallisf1/hesperida/issues',
            },
            {
              label: 'Changelog',
              to: '/reference/changelog',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Hesperida`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
