import { RecordContext, WriterFieldPlan } from "../mapping/mapping_compile_part_02_build_writer_plan";

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
