export const VIEW_TYPE = 'task-relay-workbench';

export const VIEW_NAME = 'Task Relay';

export const VIEW_ICON = 'list-checks';

/**
 * Config keys for the Bases view options. These are stored inside the `.base`
 * file, not in global plugin settings, so each Base can behave differently.
 */
export const CONFIG_KEYS = {
	rawMove: 'taskRelayRawMove',
	separator: 'taskRelaySeparator',
	movedWording: 'taskRelayMovedWording',
	pulledWording: 'taskRelayPulledWording',
} as const;

/** Default provenance formatting. */
export const DEFAULT_SEPARATOR = ' — ';
export const DEFAULT_MOVED_WORDING = 'moved to';
export const DEFAULT_PULLED_WORDING = 'pulled from';
