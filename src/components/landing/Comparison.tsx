import { Check, Minus, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Reveal from "@/components/landing/Reveal";

type Mark = "yes" | "partial" | "no";

interface Row {
  feature: string;
  vaporlog: Mark;
  notes: Mark;
  spreadsheet: Mark;
}

const ROWS: Row[] = [
  {
    feature: "Remembers temps, flavors & terpenes",
    vaporlog: "yes",
    notes: "no",
    spreadsheet: "partial",
  },
  {
    feature: "Finds your favorites from your own ratings",
    vaporlog: "yes",
    notes: "no",
    spreadsheet: "no",
  },
  {
    feature: "Expert sessions with the exact temps to copy",
    vaporlog: "yes",
    notes: "no",
    spreadsheet: "no",
  },
  {
    feature: "Couch-to-logged in 30 seconds",
    vaporlog: "yes",
    notes: "partial",
    spreadsheet: "no",
  },
];

function MarkCell({ mark }: { mark: Mark }) {
  if (mark === "yes") {
    return (
      <span className="inline-flex items-center justify-center">
        <Check aria-label="Yes" className="size-5 text-herb" strokeWidth={2.5} />
      </span>
    );
  }
  if (mark === "partial") {
    return (
      <span className="inline-flex items-center justify-center">
        <Minus aria-label="Sort of" className="size-5 text-muted-foreground" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center">
      <X aria-label="No" className="size-5 text-muted-foreground/60" />
    </span>
  );
}

/**
 * Compare (viral-product #31): make the switch obvious. vaporlog vs the
 * tools connoisseurs actually use today — a notes app and a spreadsheet.
 */
export default function Comparison() {
  return (
    <section className="border-t border-border/60 py-20 sm:py-28">
      <Reveal>
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          Your notes app forgot. Your spreadsheet never knew.
        </h2>
      </Reveal>
      <Reveal delayMs={100} className="mt-10">
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                <TableHead className="w-[46%] text-foreground" />
                <TableHead className="text-center font-semibold text-herb">
                  vaporlog
                </TableHead>
                <TableHead className="text-center text-muted-foreground">
                  Notes app
                </TableHead>
                <TableHead className="text-center text-muted-foreground">
                  Spreadsheet
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.map((row) => (
                <TableRow key={row.feature}>
                  <TableCell className="text-sm font-medium sm:text-base">
                    {row.feature}
                  </TableCell>
                  <TableCell className="text-center">
                    <MarkCell mark={row.vaporlog} />
                  </TableCell>
                  <TableCell className="text-center">
                    <MarkCell mark={row.notes} />
                  </TableCell>
                  <TableCell className="text-center">
                    <MarkCell mark={row.spreadsheet} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Reveal>
    </section>
  );
}
