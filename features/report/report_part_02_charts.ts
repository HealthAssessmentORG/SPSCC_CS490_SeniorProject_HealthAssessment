/**
 * Prints a console-based histogram of validation error counts by error code.
 *
 * If no rows are provided, it logs a success message indicating there are no validation errors.
 * Otherwise, it logs each error code with its count and a bar made of `#` characters, capped at 60.
 *
 * @param rows - Array of error summary rows, where each row contains an `error_code` and its occurrence count (`cnt`).
 * @returns This function does not return a value.
 */
export function printErrorHistogram(rows: Array<{ error_code: string; cnt: number }>) {
  if (!rows.length) {
    console.log("No validation errors ✅");
    return;
  }

  console.log("Validation errors:");
  for (const r of rows) {
    const bar = "#".repeat(Math.min(60, Number(r.cnt)));
    console.log(`- ${r.error_code}: ${r.cnt} ${bar}`);
  }
}
