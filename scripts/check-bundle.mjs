import { readFileSync } from 'node:fs';
import process from 'node:process';

const bundle = readFileSync('main.js', 'utf8');
const imports = Array.from(
	bundle.matchAll(/require\((['"])([^'"]+)\1\)/gu),
	(match) => match[2],
);
const unexpectedImports = Array.from(
	new Set(imports.filter((dependency) => dependency !== 'obsidian')),
);
const forbiddenRuntimeTokens = [
	'fetch(',
	'XMLHttpRequest',
	'WebSocket',
	'child_process',
	'electron',
	'node:fs',
];
const foundTokens = forbiddenRuntimeTokens.filter((token) =>
	bundle.includes(token),
);

if (unexpectedImports.length > 0 || foundTokens.length > 0) {
	throw new Error(
		[
			'Production bundle failed the mobile-safety check.',
			unexpectedImports.length > 0
				? `Unexpected imports: ${unexpectedImports.join(', ')}`
				: '',
			foundTokens.length > 0
				? `Forbidden runtime tokens: ${foundTokens.join(', ')}`
				: '',
		]
			.filter(Boolean)
			.join('\n'),
	);
}

process.stdout.write('Bundle mobile-safety check passed.\n');
