#!/usr/bin/env node
/**
 * Daytona sandbox housekeeping.
 *
 *   node scripts/sandboxes.mjs list           # show all sandboxes
 *   node scripts/sandboxes.mjs clean          # delete all sandboxes
 *   node scripts/sandboxes.mjs clean <id>     # delete one by agent-id label
 *
 * Reads DAYTONA_API_KEY from the environment. Source ~/.secrets or set
 * before running.
 */
import { Daytona } from '@daytona/sdk';

const cmd = process.argv[2];
const arg = process.argv[3];
const apiKey = process.env.DAYTONA_API_KEY;
if (!apiKey) {
	console.error('DAYTONA_API_KEY not set');
	process.exit(1);
}
const client = new Daytona({ apiKey });

if (cmd === 'list' || !cmd) {
	const r = await client.list();
	console.log('total:', r.total);
	for (const s of r.items) {
		const label = s.labels?.['flue-agent-id'] ?? '(unlabeled)';
		console.log(`  ${label.padEnd(20)} ${(s.state ?? '?').padEnd(12)} ${s.id}`);
	}
} else if (cmd === 'clean') {
	const r = await client.list();
	let count = 0;
	for (const s of r.items) {
		const label = s.labels?.['flue-agent-id'];
		if (arg && label !== arg) continue;
		await s.delete();
		console.log('deleted:', label ?? '(unlabeled)', s.id);
		count++;
	}
	if (count === 0) {
		console.log('no matching sandboxes', arg ? `(filter: agent-id=${arg})` : '');
	}
} else {
	console.error('usage: sandboxes.mjs [list | clean [<agent-id>]]');
	process.exit(1);
}
