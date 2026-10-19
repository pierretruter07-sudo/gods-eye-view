import path from 'node:path';

/**
 * Node test reporter for GitHub Actions: one `::error` annotation per failing
 * test, so failures are readable from the check run (REST annotations API)
 * without downloading the raw job log. The spec reporter still prints the
 * full output alongside it.
 */
const data = (s) =>
  String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const rel = (f) => path.relative(process.cwd(), path.resolve(f));
const prop = (s) => data(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export default async function* annotateFailures(source) {
  // A file that fails to load reports only "test failed"; its stderr says why.
  const stderr = new Map();
  for await (const event of source) {
    if (event.type === 'test:stderr' && event.data?.file) {
      const key = rel(event.data.file);
      const text = `${stderr.get(key) || ''}${event.data.message || ''}`;
      stderr.set(key, text.slice(-4000));
      continue;
    }
    if (event.type !== 'test:fail') continue;
    const d = event.data || {};
    const file = d.file ? rel(d.file) : '';
    const error = d.details?.error;
    const message = String(
      error?.cause?.stack || error?.cause?.message || error?.message || error || 'failed',
    )
      .split('\n')
      .slice(0, 8)
      .join('\n')
      .slice(0, 1500);
    const why = file && stderr.get(file);
    const detail =
      why && /test failed$/.test(message.trim())
        ? why.split('\n').filter((line) => /Error|error|at /.test(line)).slice(0, 8).join('\n')
        : '';
    yield `::error file=${prop(file)},line=${Number(d.line) || 1},title=${prop(d.name || 'test failed')}::${data(detail ? `${message}\n${detail}` : message)}\n`;
  }
}
