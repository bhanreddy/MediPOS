import { createHash } from 'node:crypto';

/** UUID v5, scoped to the clinic, so imported IDs also work with UUID API lookups. */
export function importIdentity(clinicId: string, name: string): string {
  const digest = createHash('sha1')
    .update(Buffer.from(clinicId.replace(/-/g, ''), 'hex'))
    .update(name).digest('hex');
  const variant = ((parseInt(digest[16], 16) & 3) | 8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
