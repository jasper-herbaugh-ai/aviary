import path from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import type { Prisma, PrismaClient } from "@aviary/db";
import {
  JobEventBroker,
  appendJobEvent,
  parsePayloadJson
} from "./job-events.js";

type PublishEventRequest = {
  jobId?: string;
  seq?: number | string;
  eventType?: string;
  payloadJson?: string;
  emittedAt?: string;
};

type PublishEventsResponse = {
  acceptedCount: number;
  rejectedCount: number;
};

type LoggerLike = {
  info: (obj: unknown, message?: string) => void;
  warn: (obj: unknown, message?: string) => void;
  error: (obj: unknown, message?: string) => void;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = path.resolve(__dirname, "../../../packages/proto/job_events.proto");

function parseSeq(value: number | string | undefined): number | null {
  if (value === undefined) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0 || numeric > Number.MAX_SAFE_INTEGER) {
    return null;
  }
  return numeric;
}

function parseEmittedAt(value: string | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

function internalToken(metadata: grpc.Metadata): string | null {
  const raw = metadata.get("x-internal-token")[0];
  if (typeof raw !== "string" || !raw) {
    return null;
  }
  return raw;
}

export async function startJobEventGrpcServer(options: {
  db: PrismaClient;
  broker: JobEventBroker;
  internalToken: string;
  port: number;
  logger: LoggerLike;
}): Promise<{ close: () => Promise<void> }> {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });

  const descriptor = grpc.loadPackageDefinition(packageDefinition) as unknown as {
    aviary: {
      jobs: {
        v1: {
          JobEventIngress: {
            service: grpc.ServiceDefinition;
          };
        };
      };
    };
  };

  const service = descriptor.aviary.jobs.v1.JobEventIngress.service;
  const server = new grpc.Server();

  server.addService(service, {
    publishEvents: (
      call: grpc.ServerReadableStream<PublishEventRequest, PublishEventsResponse>,
      callback: grpc.sendUnaryData<PublishEventsResponse>
    ) => {
      const token = internalToken(call.metadata);
      if (token !== options.internalToken) {
        callback(
          {
            name: "AuthError",
            message: "Missing internal token",
            code: grpc.status.UNAUTHENTICATED
          },
          null
        );
        return;
      }

      const knownJobs = new Set<string>();
      let acceptedCount = 0;
      let rejectedCount = 0;
      let pending = Promise.resolve();

      call.on("data", (request) => {
        pending = pending
          .then(async () => {
            const jobId = request.jobId?.trim();
            const seq = parseSeq(request.seq);
            const eventType = request.eventType?.trim();

            if (!jobId || seq === null || !eventType) {
              rejectedCount += 1;
              options.logger.warn(
                { request },
                "Rejected invalid gRPC job event payload"
              );
              return;
            }

            if (!knownJobs.has(jobId)) {
              const existingJob = await options.db.job.findUnique({
                where: { id: jobId },
                select: { id: true }
              });
              if (!existingJob) {
                rejectedCount += 1;
                options.logger.warn({ jobId }, "Rejected event for missing job");
                return;
              }
              knownJobs.add(jobId);
            }

            let payload: unknown;
            try {
              payload = parsePayloadJson(request.payloadJson ?? "{}");
            } catch (error) {
              rejectedCount += 1;
              options.logger.warn(
                { jobId, seq, error },
                "Rejected event with invalid payload_json"
              );
              return;
            }

            const persisted = await appendJobEvent(options.db, {
              jobId,
              seq,
              eventType,
              payload: payload as Prisma.InputJsonValue,
              emittedAt: parseEmittedAt(request.emittedAt)
            });

            options.broker.publish(persisted);
            acceptedCount += 1;
          })
          .catch((error) => {
            rejectedCount += 1;
            options.logger.error(
              { error, request },
              "Failed to persist gRPC job event"
            );
          });
      });

      call.on("error", (error) => {
        options.logger.warn({ error }, "gRPC job event stream closed with error");
      });

      call.on("end", () => {
        void pending
          .then(() => {
            callback(null, { acceptedCount, rejectedCount });
          })
          .catch((error) => {
            options.logger.error(
              { error },
              "Failed while processing gRPC job event stream"
            );
            callback(
              {
                name: "StreamProcessingError",
                message: "Failed to process job events",
                code: grpc.status.INTERNAL
              },
              null
            );
          });
      });
    }
  });

  const bindAddress = `0.0.0.0:${options.port}`;
  await new Promise<void>((resolve, reject) => {
    server.bindAsync(
      bindAddress,
      grpc.ServerCredentials.createInsecure(),
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      }
    );
  });

  server.start();
  options.logger.info(
    { port: options.port, protoPath: PROTO_PATH },
    "gRPC job event server listening"
  );

  return {
    close: async () => {
      await new Promise<void>((resolve) => {
        server.tryShutdown((error) => {
          if (error) {
            options.logger.warn(
              { error },
              "gRPC job event server did not shut down cleanly; forcing shutdown"
            );
            server.forceShutdown();
          }
          resolve();
        });
      });
    }
  };
}
