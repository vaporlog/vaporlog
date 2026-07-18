import { Check, Minus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
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

function MarkCell({ mark }: { mark: Mark }) {
  const { t } = useTranslation("landing");

  if (mark === "yes") {
    return (
      <span className="inline-flex items-center justify-center">
        <Check
          aria-label={t("comparison.mark.yes")}
          className="size-5 text-herb"
          strokeWidth={2.5}
        />
      </span>
    );
  }
  if (mark === "partial") {
    return (
      <span className="inline-flex items-center justify-center">
        <Minus
          aria-label={t("comparison.mark.partial")}
          className="size-5 text-muted-foreground"
        />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center">
      <X
        aria-label={t("comparison.mark.no")}
        className="size-5 text-muted-foreground/60"
      />
    </span>
  );
}

/**
 * Compare (viral-product #31): make the switch obvious. vaporlog vs the
 * tools connoisseurs actually use today — a notes app and a spreadsheet.
 */
export default function Comparison() {
  const { t } = useTranslation("landing");

  const ROWS: Row[] = [
    {
      feature: t("comparison.rows.temps"),
      vaporlog: "yes",
      notes: "no",
      spreadsheet: "partial",
    },
    {
      feature: t("comparison.rows.favorites"),
      vaporlog: "yes",
      notes: "no",
      spreadsheet: "no",
    },
    {
      feature: t("comparison.rows.experts"),
      vaporlog: "yes",
      notes: "no",
      spreadsheet: "no",
    },
    {
      feature: t("comparison.rows.couch"),
      vaporlog: "yes",
      notes: "partial",
      spreadsheet: "no",
    },
  ];

  return (
    <section className="border-t border-border/60 py-20 sm:py-28">
      <Reveal>
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("comparison.title")}
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
                  {t("comparison.columns.notes")}
                </TableHead>
                <TableHead className="text-center text-muted-foreground">
                  {t("comparison.columns.spreadsheet")}
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
