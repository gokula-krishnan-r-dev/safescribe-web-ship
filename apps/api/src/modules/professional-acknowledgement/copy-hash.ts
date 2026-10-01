import { createHash } from 'node:crypto';
import { PROFESSIONAL_ACK_BODY } from '@safescript/shared';

export function professionalAckCopySha256(body = PROFESSIONAL_ACK_BODY): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}
