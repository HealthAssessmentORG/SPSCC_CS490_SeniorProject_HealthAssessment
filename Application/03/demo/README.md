# Application 3 Demo Files

These files support the Gold Master UI and CLI demo for Application 3.

## Files

- `layout.json`: fixed-width layout metadata for the demo output files.
- `valid_output.txt`: one valid fixed-width record.
- `invalid_output.txt`: one invalid fixed-width record with deterministic domain validation errors.

## Validation Commands

Valid case:

```bash
node --import tsx Application/03/src/main.ts validate \
  --input Application/03/demo/valid_output.txt \
  --layout Application/03/demo/layout.json
```

Invalid case:

```bash
node --import tsx Application/03/src/main.ts validate \
  --input Application/03/demo/invalid_output.txt \
  --layout Application/03/demo/layout.json
```

The valid case should exit `0` with `Validation result: passed`.

The invalid case should exit nonzero with `Validation result: failed` and error counts for `BAD_DATE` and `BAD_DODID10`.

## UI Use

Run the current UI with:

```bash
npm run ui:app3
```

The UI first asks for the fixed-width output file, then asks for the layout JSON file. Select `valid_output.txt` or `invalid_output.txt`, then select `layout.json`.

`APP3_LAYOUT_PATH` can still be set before launch to skip the layout picker. Later Gold Master UI stages will add report writing from the UI.
