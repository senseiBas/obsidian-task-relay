import { Plugin } from 'obsidian';
import type { BasesAllOptions } from 'obsidian';
import {
	CONFIG_KEYS,
	DEFAULT_MOVED_WORDING,
	DEFAULT_PULLED_WORDING,
	DEFAULT_SEPARATOR,
	VIEW_ICON,
	VIEW_NAME,
	VIEW_TYPE,
} from './constants';
import { TaskRelayView } from './view/workbench-view';
import { logger } from './logger';

export default class TaskRelayPlugin extends Plugin {
	onload(): void {
		logger.init(this.app, this.manifest.dir ?? '');
		logger.info('Plugin loaded', { version: this.manifest.version });
		this.registerBasesView(VIEW_TYPE, {
			name: VIEW_NAME,
			icon: VIEW_ICON,
			factory: (controller, containerEl) =>
				new TaskRelayView(controller, containerEl),
			options: () => viewOptions(),
		});
	}
}

/**
 * View options are stored inside each `.base` file rather than in global plugin
 * settings, so filtering, sorting and visible properties stay owned by the Base
 * and only the few genuinely presentational choices live here.
 */
function viewOptions(): BasesAllOptions[] {
	return [
		{
			type: 'group',
			displayName: 'Task Relay',
			items: [
				{
					type: 'toggle',
					displayName: 'Manual note order (drag headers to reorder)',
					key: CONFIG_KEYS.manualOrder,
					default: false,
				},
				{
					type: 'toggle',
					displayName: 'Raw move by default (no provenance)',
					key: CONFIG_KEYS.rawMove,
					default: false,
				},
				{
					type: 'toggle',
					displayName: 'Open notes on the left (default: right)',
					key: CONFIG_KEYS.openLeft,
					default: false,
				},
				{
					type: 'text',
					displayName: 'Provenance separator',
					key: CONFIG_KEYS.separator,
					default: DEFAULT_SEPARATOR,
				},
				{
					type: 'text',
					displayName: 'Wording: moved to',
					key: CONFIG_KEYS.movedWording,
					default: DEFAULT_MOVED_WORDING,
				},
				{
					type: 'text',
					displayName: 'Wording: pulled from',
					key: CONFIG_KEYS.pulledWording,
					default: DEFAULT_PULLED_WORDING,
				},
			],
		},
	];
}
