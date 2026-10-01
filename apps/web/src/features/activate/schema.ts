import { z } from 'zod';
import { ACCESS_REQUEST_LIMITS, isValidOptionalPhone } from '@safescript/shared';

export const activateFormSchema = z.object({
  pharmacyName: z
    .string()
    .trim()
    .min(1, 'Please enter your pharmacy name.')
    .max(ACCESS_REQUEST_LIMITS.PHARMACY_NAME, 'Pharmacy name is too long.'),
  licenceNumber: z
    .string()
    .trim()
    .min(1, 'Please enter your Alberta licence number.')
    .max(ACCESS_REQUEST_LIMITS.LICENCE_NUMBER, 'Licence number is too long.'),
  contactName: z
    .string()
    .trim()
    .min(1, 'Please enter your full name.')
    .max(ACCESS_REQUEST_LIMITS.CONTACT_NAME, 'Name is too long.'),
  email: z
    .string()
    .trim()
    .min(1, 'Please enter a valid email address.')
    .email('Please enter a valid email address.')
    .max(ACCESS_REQUEST_LIMITS.EMAIL),
  phone: z
    .string()
    .trim()
    .max(ACCESS_REQUEST_LIMITS.PHONE)
    .refine((value) => isValidOptionalPhone(value), 'Please enter a valid phone number.'),
  companyWebsite: z.string().optional(),
});

export type ActivateFormValues = z.infer<typeof activateFormSchema>;
