function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function safeApplication2DbConfigError(error: unknown): string | null {
  const message = messageFrom(error);

  if (
    /^(application2 DB|export DB|root DB) (server|database|user|password) is required \((APP2_DB|EXPORT_DB|DB)_(SERVER|DATABASE|USER|PASSWORD)\)$/.test(
      message
    )
  ) {
    return message;
  }

  if (/^Invalid (number|boolean) for (APP2_DB|EXPORT_DB|DB)_[A-Z_]+: .+$/.test(message)) {
    return message;
  }

  if (
    /^Application 2 database connection failed after trying (APP2_DB_\*|EXPORT_DB_\*|DB_\*)(, (APP2_DB_\*|EXPORT_DB_\*|DB_\*))*\.$/.test(
      message
    )
  ) {
    return message;
  }

  return null;
}
