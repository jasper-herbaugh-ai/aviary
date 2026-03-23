import { z } from "zod";

export const roleSchema = z.enum(["admin", "operator"]);
export const jobStatusSchema = z.enum(["queued", "running", "success", "failed", "timeout"]);
export const credentialTypeSchema = z.enum(["ssh_key", "password"]);
export const alertOperatorSchema = z.enum(["gt", "lt", "eq"]);
export const alertSeveritySchema = z.enum(["info", "warning", "critical"]);
export const alertMetricSchema = z.enum(["disk_percent", "memory_percent", "custom"]);

export const serverSchema = z.object({
  id: z.string().uuid(),
  hostname: z.string(),
  ipAddress: z.string(),
  port: z.number().int().min(1).max(65535),
  username: z.string().nullable(),
  displayName: z.string(),
  osType: z.string().nullable(),
  tags: z.array(z.string()),
  active: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const credentialSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: credentialTypeSchema,
  username: z.string(),
  createdAt: z.coerce.date()
});

export const playbookStepSchema = z.object({
  order: z.number().int().min(1),
  command: z.string(),
  expectedExitCode: z.number().int().default(0),
  parseRule: z.record(z.string(), z.unknown()).optional()
});

export const playbookSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isBuiltin: z.boolean(),
  useSudo: z.boolean(),
  steps: z.array(playbookStepSchema),
  createdBy: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const scheduleSchema = z.object({
  id: z.string().uuid(),
  playbookId: z.string().uuid(),
  targetType: z.enum(["server", "tag", "all"]),
  targetIds: z.array(z.string()),
  cronExpression: z.string(),
  useSudo: z.boolean(),
  enabled: z.boolean(),
  lastRunAt: z.coerce.date().nullable(),
  nextRunAt: z.coerce.date().nullable()
});

export const jobSchema = z.object({
  id: z.string().uuid(),
  scheduleId: z.string().uuid().nullable(),
  playbookId: z.string().uuid(),
  serverId: z.string().uuid(),
  status: jobStatusSchema,
  enqueuedAt: z.coerce.date(),
  startedAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable()
});

export const jobResultSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  stepOrder: z.number().int(),
  command: z.string(),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number().int(),
  parsedValues: z.record(z.string(), z.unknown()).nullable()
});

export const alertSchema = z.object({
  id: z.string().uuid(),
  serverId: z.string().uuid(),
  metric: alertMetricSchema,
  threshold: z.number(),
  operator: alertOperatorSchema,
  severity: alertSeveritySchema,
  notificationChannel: z.string().nullable(),
  lastTriggeredAt: z.coerce.date().nullable()
});

export const dashboardHealthSchema = z.object({
  serverId: z.string().uuid(),
  displayName: z.string(),
  lastJobStatus: jobStatusSchema.nullable(),
  diskPercent: z.number().nullable(),
  memoryPercent: z.number().nullable(),
  lastRunAt: z.coerce.date().nullable()
});

export const createServerInputSchema = serverSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  username: z.string().trim().min(1).nullable().optional(),
  credentialId: z.string().uuid().nullable().optional()
});
export const updateServerInputSchema = createServerInputSchema.partial();

export const createCredentialInputSchema = z.object({
  name: z.string().min(1),
  type: credentialTypeSchema,
  username: z.string().min(1),
  secretValue: z.string().min(1)
});

export const createPlaybookInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isBuiltin: z.boolean().default(false),
  useSudo: z.boolean().default(false),
  createdBy: z.string().optional(),
  steps: z.array(playbookStepSchema).min(1)
});

export const createScheduleInputSchema = z.object({
  playbookId: z.string().uuid(),
  targetType: z.enum(["server", "tag", "all"]),
  targetIds: z.array(z.string()),
  cronExpression: z.string(),
  useSudo: z.boolean().default(false),
  enabled: z.boolean().default(true)
});

export const createAlertInputSchema = z.object({
  serverId: z.string().uuid(),
  metric: alertMetricSchema,
  threshold: z.number(),
  operator: alertOperatorSchema,
  severity: alertSeveritySchema,
  notificationChannel: z.string().optional()
});

export type Role = z.infer<typeof roleSchema>;
export type ServerDto = z.infer<typeof serverSchema>;
export type CredentialDto = z.infer<typeof credentialSchema>;
export type PlaybookDto = z.infer<typeof playbookSchema>;
export type ScheduleDto = z.infer<typeof scheduleSchema>;
export type JobDto = z.infer<typeof jobSchema>;
export type JobResultDto = z.infer<typeof jobResultSchema>;
export type AlertDto = z.infer<typeof alertSchema>;
export type DashboardHealthDto = z.infer<typeof dashboardHealthSchema>;
