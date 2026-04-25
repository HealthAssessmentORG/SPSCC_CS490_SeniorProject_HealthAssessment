import type { Application2RecordContext } from "../types";
import type { Application2WriterFieldPlan } from "../mapping/build_writer_plan";

export function buildFixedWidthLine(
  rowLength: number,
  plan: Application2WriterFieldPlan[],
  ctx: Application2RecordContext
): { line: string; fieldValues: Map<string, string> } {
  const buf = Array.from({ length: rowLength }, () => " ");
  const fieldValues = new Map<string, string>();

  for (const field of plan) {
    const value = field.getValue(ctx);
    fieldValues.set(field.field_name, value);

    const startIdx = field.start_pos - 1;
    for (let i = 0; i < field.length; i++) {
      const bi = startIdx + i;
      if (bi >= 0 && bi < buf.length) buf[bi] = value[i] ?? " ";
    }
  }

  return { line: buf.join(""), fieldValues };
}
