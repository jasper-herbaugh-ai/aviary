import { z } from "zod";
import { createCredentialInputSchema } from "@aviary/types";

export const wizardScheduleUnitSchema = z.enum(["seconds", "minutes", "hours", "days", "weeks", "months"]);

export type WizardScheduleUnit = z.infer<typeof wizardScheduleUnitSchema>;

export const wizardScheduleInputSchema = z.object({
  every: z.number().int().positive(),
  unit: wizardScheduleUnitSchema,
  useSudo: z.boolean().default(false),
  enabled: z.boolean().default(true)
});

export const wizardServerInputSchema = z.object({
  displayName: z.string().trim().min(1),
  hostname: z.string().trim().min(1),
  ipAddress: z.string().trim().min(1),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().trim().min(1).nullable().optional(),
  osType: z.string().trim().min(1).nullable().optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  active: z.boolean().default(true)
});

export const wizardCredentialSelectionSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("existing"),
    id: z.string().uuid()
  }),
  createCredentialInputSchema.extend({
    mode: z.literal("new")
  })
]);

export const wizardServerSelectionSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("existing"),
    id: z.string().uuid()
  }),
  wizardServerInputSchema.extend({
    mode: z.literal("new")
  })
]);

export const wizardAutomationInputSchema = z.object({
  credential: wizardCredentialSelectionSchema,
  server: wizardServerSelectionSchema,
  playbookId: z.string().uuid(),
  schedule: wizardScheduleInputSchema
});

const maxIntervalByUnit: Record<WizardScheduleUnit, number> = {
  seconds: 59,
  minutes: 59,
  hours: 23,
  days: 31,
  weeks: 4,
  months: 12
};

function everyField(every: number): string {
  return every === 1 ? "*" : `*/${every}`;
}

export function intervalToCron(input: { every: number; unit: WizardScheduleUnit }): string {
  const { every, unit } = input;

  if (!Number.isFinite(every) || !Number.isInteger(every) || every < 1) {
    throw new Error("Schedule interval must be a positive integer.");
  }

  const maxAllowed = maxIntervalByUnit[unit];
  if (every > maxAllowed) {
    throw new Error(`Maximum interval for ${unit} is ${maxAllowed}.`);
  }

  switch (unit) {
    case "seconds":
      return `${everyField(every)} * * * * *`;
    case "minutes":
      return `0 ${everyField(every)} * * * *`;
    case "hours":
      return `0 0 ${everyField(every)} * * *`;
    case "days":
      return `0 0 0 ${everyField(every)} * *`;
    case "weeks":
      return `0 0 0 ${everyField(every * 7)} * *`;
    case "months":
      return `0 0 0 1 ${everyField(every)} *`;
    default: {
      const exhaustive: never = unit;
      throw new Error(`Unsupported schedule unit: ${exhaustive}`);
    }
  }
}
