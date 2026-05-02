import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const HTML = new URL('./index.html', import.meta.url);
const FLUE = process.env.FLUE_URL || 'http://localhost:3583';
const PORT = Number(process.env.PORT || 8080);

createServer(async (req, res) => {
	try {
		if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
			const html = await readFile(HTML);
			res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			res.end(html);
			return;
		}
		if (req.url.startsWith('/api/')) {
			const target = FLUE + req.url.slice(4);
			const chunks = [];
			for await (const c of req) chunks.push(c);
			const body = Buffer.concat(chunks);
			const upstream = await fetch(target, {
				method: req.method,
				headers: {
					'content-type': req.headers['content-type'] || 'application/json',
					accept: req.headers.accept || 'application/json',
				},
				body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
			});
			const headers = {};
			for (const [k, v] of upstream.headers) headers[k] = v;
			res.writeHead(upstream.status, headers);
			if (upstream.body) {
				const reader = upstream.body.getReader();
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					res.write(value);
				}
			}
			res.end();
			return;
		}
		res.writeHead(404);
		res.end('not found');
	} catch (err) {
		console.error(err);
		if (!res.headersSent) res.writeHead(502);
		res.end(String(err));
	}
}).listen(PORT, () => {
	console.log(`dev-ui ready: http://localhost:${PORT}`);
	console.log(`proxying /api/* -> ${FLUE}`);
});
