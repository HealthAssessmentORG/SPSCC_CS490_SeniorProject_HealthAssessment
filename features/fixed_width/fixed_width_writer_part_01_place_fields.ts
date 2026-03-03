import { RecordContext, WriterFieldPlan } from "../mapping/mapping_compile_part_02_build_writer_plan";

/**
 * Builds a fixed-width formatted line from a record context using a field plan.
 * 
 * @param rowLength - The total length of the output line in characters
 * @param plan - Array of field plans defining positions and value extraction logic
 * @param ctx - The record context containing data to extract field values from
 * @returns An object containing the formatted fixed-width line and a map of field names to their values
 * @returns {string} line - The fixed-width formatted line padded to rowLength with spaces
 * @returns {Map<string, string>} fieldValues - Map of field names to their extracted string values
 */

export function buildFixedWidthLine(
  rowLength: number,
  plan: WriterFieldPlan[],
  ctx: RecordContext
): { line: string; fieldValues: Map<string, string> } {
  const buf = Array.from({ length: rowLength }, () => " ");
  const fieldValues = new Map<string, string>();

  for (const f of plan) {
    const v = f.getValue(ctx);
    fieldValues.set(f.field_name, v);

    const startIdx = f.start_pos - 1;
    for (let i = 0; i < f.length; i++) {
      const bi = startIdx + i;
      if (bi >= 0 && bi < buf.length) buf[bi] = v[i] ?? " ";
    }
  }

  return { line: buf.join(""), fieldValues };
}
