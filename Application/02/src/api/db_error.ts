function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function safeApplication2DbConfigError(error: unknown): string | null {
  const message = messageFrom(error);

  if (
    /^application2 DB (server|database|user|password) is required \(APP2_DB_(SERVER|DATABASE|USER|PASSWORD)\)$/.test(
      message
    )
  ) {
    return message;
  }

  if (/^Invalid (number|boolean) for APP2_DB_[A-Z_]+: .+$/.test(message)) {
    return message;
  }

  return null;
}
