import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import openapiPlugin from 'sveltekit-openapi-generator';

const getPackageVersion = (): string => {
	try {
		const packageJsonPath = new URL('./package.json', import.meta.url);
		const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: unknown };
		return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
	} catch {
		return '0.0.0';
	}
};

const appVersion = getPackageVersion();

export default defineConfig({
    plugins: [
        openapiPlugin({
            // OpenAPI info section
            info: {
                title: 'Hesperida Web App Scanner API',
                version: appVersion,
                description: 'Use WEB_API_KEY in an x-api-key header, and the token from auth signin/signup in a Bearer Authentication header'
            },
            servers: [
                { url: 'http://localhost:3000', description: 'Development' }
            ],
            // Path to shared schema definitions
            baseSchemasPath: 'src/lib/schemas.js',
            // Additional YAML files to include
            yamlFiles: ['src/lib/extra-specs.yaml'],
            // Path prefix for all routes
            prependPath: '',
            // Glob patterns to include
            include: ['src/routes/api/v1/**/{+server,+page.server}.{js,ts}'],
            // Glob patterns to exclude
            exclude: ['**/node_modules/**', '**/.svelte-kit/**'],
            // Whether to fail on JSDoc parsing errors
            failOnErrors: false,
            // Output path for the spec file during build
            outputPath: 'static/openapi.json',
            // Debounce delay in milliseconds for file watching
            debounceMs: 200
        }),
        tailwindcss(),
        sveltekit()
    ],
});
