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
