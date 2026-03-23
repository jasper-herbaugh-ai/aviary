export const SERVER_WITH_CREDENTIAL_INCLUDE = {
  credentials: {
    take: 1,
    include: {
      credential: {
        select: {
          id: true,
          name: true
        }
      }
    }
  }
} as const;

type ServerCredentialLink = {
  credentialId: string;
  credential: {
    name: string;
  };
};

type ServerWithCredential<T> = T & {
  credentials: ServerCredentialLink[];
};

export function toSafeServer<T extends Record<string, unknown>>(server: ServerWithCredential<T>) {
  const link = server.credentials[0];
  const { credentials, ...rest } = server;

  return {
    ...rest,
    credentialId: link?.credentialId ?? null,
    credentialName: link?.credential.name ?? null
  };
}
