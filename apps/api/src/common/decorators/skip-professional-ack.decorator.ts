import { SetMetadata } from '@nestjs/common';

export const SKIP_PROFESSIONAL_ACK_KEY = 'skipProfessionalAck';

/** Skip the pharmacist professional-use acknowledgement API gate. */
export const SkipProfessionalAck = () => SetMetadata(SKIP_PROFESSIONAL_ACK_KEY, true);
