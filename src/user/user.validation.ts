import { z, ZodType } from 'zod';

export class UserValidation {
  static readonly CREATE: ZodType = z.object({
    name: z.string().min(1).max(100),
    account_number: z
      .string()
      .min(1, 'Account number too short')
      .max(30, 'Account number too long'),
    bank: z.string().min(1).max(50),
  });

  static readonly UPDATE: ZodType = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
  });

  static readonly TRANSFEER: ZodType = z.object({
    senderId: z.string().uuid(),
    recipientName: z.string().min(1).max(100),
    amount: z.number().int().positive(),
  });

  static readonly TOPUP: ZodType = z.object({
    id: z.string().uuid(),
    amount: z.number().int().positive(),
  });
}
