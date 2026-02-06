/*
package.json:
{
  "dependencies": {
    "@types/node": "^25.2.1",
    "@types/typescript": "^0.4.29",
    "node": "^25.6.0",
    "typescript": "^5.9.3"
  }
}
*/

/*
node dist/main.js -form "dir/file" -gen 100
npx tsx main.ts -form "dir/file" -gen 100
*/

type Options = {
    form?: string;
    gen: number;
    help: boolean;
};

function usage(exitCode = 0): never {
    const msg = `
Usage:
  node dist/main.js -form <path> -gen <number>
  node dist/main.js --form <path> --gen <number>

Examples:
  node dist/main.js -form "dir/file" -gen 100
  npx tsx main.ts -form ./templates/form.json -gen 100
`.trim();
    console.log(msg);
    process.exit(exitCode);
}

function parseArgs(argv: string[]): Options {
    // argv should be process.argv.slice(2)
    const opts: Options = { gen: 0, help: false };

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];

        if (a === "-h" || a === "--help") {
            opts.help = true;
            continue;
        }

        if (a === "-form" || a === "--form") {
            const v = argv[++i];
            if (!v) throw new Error("Missing value after -form/--form");
            opts.form = v;
            continue;
        }

        if (a === "-gen" || a === "--gen") {
            const v = argv[++i];
            if (!v) throw new Error("Missing value after -gen/--gen");
            const n = Number(v);
            if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
                throw new Error(`-gen must be a non-negative integer, got: ${v}`);
            }
            opts.gen = n;
            continue;
        }

        throw new Error(`Unknown argument: ${a}`);
    }

    return opts;
}

async function main() {
    let opts: Options;

    try {
        opts = parseArgs(process.argv.slice(2));
    } catch (err) {
        console.error((err as Error).message);
        usage(1);
    }

    if (opts.help) usage(0);

    if (!opts.form) {
        console.error("Required: -form <path>");
        usage(1);
    }
    if (opts.gen === 0) {
        console.error("Required: -gen <number> (non-zero in this example)");
        usage(1);
    }

    // The program logic here:
    console.log("form:", opts.form);
    console.log("gen:", opts.gen);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
