import type { Application2DatabaseFormSummary } from "../types";

function mappingSetIdsText(mappingSetIds: string[]): string {
  if (mappingSetIds.length === 0) return "none";
  return mappingSetIds.join(", ");
}

function questionCodeText(questionCode: string | null): string {
  return questionCode ?? "none";
}

export function formatDatabaseFormSummary(summary: Application2DatabaseFormSummary): string {
  const lines: string[] = [`Database: ${summary.database}`, `Forms: ${summary.forms.length}`];

  for (const form of summary.forms) {
    lines.push(
      "",
      `## ${form.form_name}`,
      "Form UUIDs:",
      `- export_spec_id: ${form.uuids.export_spec_id}`,
      `- mapping_set_ids: ${mappingSetIdsText(form.uuids.mapping_set_ids)}`,
      "",
      "Fields:"
    );

    if (form.fields.length === 0) {
      lines.push("(none)");
      continue;
    }

    form.fields.forEach((field, index) => {
      lines.push(
        `${index + 1}. ${field.field_name}`,
        `   field_uuid: ${field.field_uuid}`,
        `   question_code: ${questionCodeText(field.question_code)}`,
        `   positions: ${field.start_pos}-${field.end_pos}`,
        `   length: ${field.field_length}`
      );
    });
  }

  return lines.join("\n") + "\n";
}
